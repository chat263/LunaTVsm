/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { createClient, RedisClientType } from 'redis';

import { AdminConfig } from './admin.types';
import { Favorite, IStorage, PlayRecord, SkipConfig } from './types';

// 搜索历史最大条数
const SEARCH_HISTORY_LIMIT = 20;

// 数据类型转换辅助函数
function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

// 连接配置接口
export interface RedisConnectionConfig {
  url: string;
  clientName: string; // 用于日志显示，如 "Redis" 或 "Pika"
}

// 添加Redis操作重试包装器
function createRetryWrapper(clientName: string, getClient: () => RedisClientType) {
  return async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (err: any) {
        const isLastAttempt = i === maxRetries - 1;
        const isConnectionError =
          err.message?.includes('Connection') ||
          err.message?.includes('ECONNREFUSED') ||
          err.message?.includes('ENOTFOUND') ||
          err.code === 'ECONNRESET' ||
          err.code === 'EPIPE';

        if (isConnectionError && !isLastAttempt) {
          console.log(
            `${clientName} operation failed, retrying... (${i + 1}/${maxRetries})`
          );
          console.error('Error:', err.message);

          // 等待一段时间后重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));

          // 尝试重新连接
          try {
            const client = getClient();
            if (!client.isOpen) {
              await client.connect();
            }
          } catch (reconnectErr) {
            console.error('Failed to reconnect:', reconnectErr);
          }

          continue;
        }

        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  };
}

// 创建客户端的工厂函数
export function createRedisClient(config: RedisConnectionConfig, globalSymbol: symbol): RedisClientType {
  let client: RedisClientType | undefined = (global as any)[globalSymbol];

  if (!client) {
    if (!config.url) {
      throw new Error(`${config.clientName}_URL env variable not set`);
    }

    let rurl, rpwd, rname;
    try {
      // 匹配格式: protocol://user:password@host:port
      const regex = /^(rediss?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/;
      const match = config.url.match(regex);

      if (!match) {
        throw new Error('Invalid Redis URL format');
      }

      const [, protocol, username, password, host, port] = match;

      rurl = `${protocol}://${host}:${port}`;
      rpwd = password || '';
      rname = username || 'default';

    } catch (error: any) {
      throw new Error(`Failed to parse Redis URL: ${error.message}`);
    }

    // 创建客户端配置
    const clientConfig: any = {
      url: rurl,
      password: rpwd,
      username: rname,
      tls: {
        rejectUnauthorized: false,
      },
      socket: {
        reconnectStrategy: (retries: number) => {
          console.log(`${config.clientName} reconnection attempt ${retries + 1}`);
          if (retries > 10) {
            console.error(`${config.clientName} max reconnection attempts exceeded`);
            return false; // 停止重连
          }
          return Math.min(1000 * Math.pow(2, retries), 30000); // 指数退避，最大30秒
        },
        connectTimeout: 10000,
        noDelay: true,
      },
      pingInterval: 30000,
    };

    client = createClient(clientConfig);

    client.on('error', (err) => {
      console.error(`${config.clientName} client error:`, err);
    });

    client.on('connect', () => {
      console.log(`${config.clientName} connected`);
    });

    client.on('reconnecting', () => {
      console.log(`${config.clientName} reconnecting...`);
    });

    client.on('ready', () => {
      console.log(`${config.clientName} ready`);
    });

    const connectWithRetry = async () => {
      try {
        await client!.connect();
        console.log(`${config.clientName} connected successfully`);
      } catch (err) {
        console.error(`${config.clientName} initial connection failed:`, err);
        console.log('Will retry in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      }
    };

    connectWithRetry();

    (global as any)[globalSymbol] = client;
  }

  return client;
}

// ---------- 抽象基类 ----------
export abstract class BaseRedisStorage implements IStorage {
  protected client: RedisClientType;
  protected withRetry: <T>(operation: () => Promise<T>, maxRetries?: number) => Promise<T>;

  constructor(config: RedisConnectionConfig, globalSymbol: symbol) {
    this.client = createRedisClient(config, globalSymbol);
    this.withRetry = createRetryWrapper(config.clientName, () => this.client);
  }

  // ---------- 辅助方法 ----------
  private prKey(user: string, key: string) { return `u:${user}:pr:${key}`; }
  private favKey(user: string, key: string) { return `u:${user}:fav:${key}`; }
  private shKey(user: string) { return `u:${user}:sh`; }
  private userPwdKey(user: string) { return `u:${user}:pwd`; }
  private skipConfigKey(user: string, source: string, id: string) { return `u:${user}:skip:${source}+${id}`; }
  private adminConfigKey() { return 'admin:config'; }

  // ---------- 索引管理 ----------
  private prIndexKey(user: string) { return `u:${user}:pr_index`; }
  private favIndexKey(user: string) { return `u:${user}:fav_index`; }
  private skipIndexKey(user: string) { return `u:${user}:skip_index`; }
  private userIndexKey() { return 'users_index'; }
  private cacheIndexKey() { return 'cache_index'; }

  // ---------- PlayRecord ----------
  async getPlayRecord(userName: string, key: string): Promise<PlayRecord | null> {
    const val = await this.withRetry(() => this.client.get(this.prKey(userName, key)));
    return val ? (JSON.parse(val) as PlayRecord) : null;
  }

  async setPlayRecord(userName: string, key: string, record: PlayRecord): Promise<void> {
    await this.withRetry(async () => {
      await this.client.set(this.prKey(userName, key), JSON.stringify(record));
      await this.client.sAdd(this.prIndexKey(userName), key);
    });
  }

  async getAllPlayRecords(userName: string): Promise<Record<string, PlayRecord>> {
    const keys: string[] = await this.withRetry(() => this.client.sMembers(this.prIndexKey(userName)));
    const result: Record<string, PlayRecord> = {};
    for (const k of keys) {
      const val = await this.withRetry(() => this.client.get(this.prKey(userName, k)));
      if (val) result[k] = JSON.parse(val) as PlayRecord;
    }
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await this.withRetry(async () => {
      await this.client.del(this.prKey(userName, key));
      await this.client.sRem(this.prIndexKey(userName), key);
    });
  }

  // ---------- Favorite ----------
  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await this.withRetry(() => this.client.get(this.favKey(userName, key)));
    return val ? (JSON.parse(val) as Favorite) : null;
  }

  async setFavorite(userName: string, key: string, favorite: Favorite): Promise<void> {
    await this.withRetry(async () => {
      await this.client.set(this.favKey(userName, key), JSON.stringify(favorite));
      await this.client.sAdd(this.favIndexKey(userName), key);
    });
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const keys: string[] = await this.withRetry(() => this.client.sMembers(this.favIndexKey(userName)));
    const result: Record<string, Favorite> = {};
    for (const k of keys) {
      const val = await this.withRetry(() => this.client.get(this.favKey(userName, k)));
      if (val) result[k] = JSON.parse(val) as Favorite;
    }
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await this.withRetry(async () => {
      await this.client.del(this.favKey(userName, key));
      await this.client.sRem(this.favIndexKey(userName), key);
    });
  }

  // ---------- User ----------
  async registerUser(userName: string, password: string): Promise<void> {
    await this.withRetry(async () => {
      await this.client.set(this.userPwdKey(userName), password);
      await this.client.sAdd(this.userIndexKey(), userName);
    });
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await this.withRetry(() => this.client.get(this.userPwdKey(userName)));
    if (stored === null) return false;
    return ensureString(stored) === password;
  }

  async checkUserExist(userName: string): Promise<boolean> {
    const exists = await this.withRetry(() => this.client.exists(this.userPwdKey(userName)));
    return exists === 1;
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    await this.withRetry(() => this.client.set(this.userPwdKey(userName), newPassword));
  }

  async deleteUser(userName: string): Promise<void> {
    // 删除密码及索引
    await this.withRetry(async () => {
      await this.client.del(this.userPwdKey(userName));
      await this.client.sRem(this.userIndexKey(), userName);
    });

    // 删除搜索历史
    await this.withRetry(() => this.client.del(this.shKey(userName)));

    // 删除播放记录
    const prKeys = await this.withRetry(() => this.client.sMembers(this.prIndexKey(userName)));
    for (const k of prKeys) await this.withRetry(() => this.client.del(this.prKey(userName, k)));
    await this.withRetry(() => this.client.del(this.prIndexKey(userName)));

    // 删除收藏
    const favKeys = await this.withRetry(() => this.client.sMembers(this.favIndexKey(userName)));
    for (const k of favKeys) await this.withRetry(() => this.client.del(this.favKey(userName, k)));
    await this.withRetry(() => this.client.del(this.favIndexKey(userName)));

    // 删除跳过配置
    const skipKeys = await this.withRetry(() => this.client.sMembers(this.skipIndexKey(userName)));
    for (const k of skipKeys) {
      const [source, id] = k.split('+');
      await this.withRetry(() => this.client.del(this.skipConfigKey(userName, source, id)));
    }
    await this.withRetry(() => this.client.del(this.skipIndexKey(userName)));
  }

  async getAllUsers(): Promise<string[]> {
    return await this.withRetry(() => this.client.sMembers(this.userIndexKey()));
  }

  // ---------- Search History ----------
  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await this.withRetry(() => this.client.lRange(this.shKey(userName), 0, -1));
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    await this.withRetry(() => this.client.lPush(key, ensureString(keyword)));
    await this.withRetry(() => this.client.lTrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    else await this.withRetry(() => this.client.del(key));
  }

  // ---------- Admin Config ----------
  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await this.withRetry(() => this.client.get(this.adminConfigKey()));
    return val ? (JSON.parse(val) as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await this.withRetry(() => this.client.set(this.adminConfigKey(), JSON.stringify(config)));
  }

  // ---------- Skip Config ----------
  async getSkipConfig(userName: string, source: string, id: string): Promise<SkipConfig | null> {
    const val = await this.withRetry(() => this.client.get(this.skipConfigKey(userName, source, id)));
    return val ? (JSON.parse(val) as SkipConfig) : null;
  }

  async setSkipConfig(userName: string, source: string, id: string, config: SkipConfig): Promise<void> {
    await this.withRetry(async () => {
      await this.client.set(this.skipConfigKey(userName, source, id), JSON.stringify(config));
      await this.client.sAdd(this.skipIndexKey(userName), `${source}+${id}`);
    });
  }

  async deleteSkipConfig(userName: string, source: string, id: string): Promise<void> {
    await this.withRetry(async () => {
      await this.client.del(this.skipConfigKey(userName, source, id));
      await this.client.sRem(this.skipIndexKey(userName), `${source}+${id}`);
    });
  }

  async getAllSkipConfigs(userName: string): Promise<{ [key: string]: SkipConfig }> {
    const keys = await this.withRetry(() => this.client.sMembers(this.skipIndexKey(userName)));
    const result: { [key: string]: SkipConfig } = {};
    for (const k of keys) {
      const [source, id] = k.split('+');
      const val = await this.withRetry(() => this.client.get(this.skipConfigKey(userName, source, id)));
      if (val) result[k] = JSON.parse(val) as SkipConfig;
    }
    return result;
  }

  // ---------- Clear All Data ----------
  async clearAllData(): Promise<void> {
    try {
      const users = await this.getAllUsers();
      for (const u of users) {
        await this.deleteUser(u);
      }
      await this.withRetry(() => this.client.del(this.adminConfigKey()));
      console.log('所有数据已清空');
    } catch (error) {
      console.error('清空数据失败:', error);
      throw new Error('清空数据失败');
    }
  }

  // ---------- Cache ----------
  private cacheKey(key: string) { return `cache:${key}`; }

  async getCache(key: string): Promise<any | null> {
    const val = await this.withRetry(() => this.client.get(this.cacheKey(key)));
    return val ? JSON.parse(val) : null;
  }

  async setCache(key: string, data: any, expireSeconds?: number): Promise<void> {
    const cacheKey = this.cacheKey(key);
    const value = JSON.stringify(data);
    await this.withRetry(async () => {
      if (expireSeconds) await this.client.setEx(cacheKey, expireSeconds, value);
      else await this.client.set(cacheKey, value);
      await this.client.sAdd(this.cacheIndexKey(), cacheKey);
    });
  }

  async deleteCache(key: string): Promise<void> {
    const cacheKey = this.cacheKey(key);
    await this.withRetry(async () => {
      await this.client.del(cacheKey);
      await this.client.sRem(this.cacheIndexKey(), cacheKey);
    });
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    const allKeys = await this.withRetry(() => this.client.sMembers(this.cacheIndexKey()));
    for (const k of allKeys) {
      if (!prefix || k.startsWith(`cache:${prefix}`)) {
        await this.withRetry(() => this.client.del(k));
        await this.withRetry(() => this.client.sRem(this.cacheIndexKey(), k));
      }
    }
  }
}
