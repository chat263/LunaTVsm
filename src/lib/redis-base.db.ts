/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
import { createClient, RedisClientType } from 'redis';
import "server-only";

import { AdminConfig } from './admin.types';
import {
  ContentStat,
  Favorite,
  IStorage,
  PlayRecord,
  PlayStatsResult,
  SkipConfig,
  UserPlayStat,
} from './types';

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

    const regex = /^(rediss?):\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/;
    const match = config.url.match(regex);
    if (!match) throw new Error('Invalid Redis URL format');

    const [, protocol, username, password, host, port] = match;

    const clientConfig: any = {
      socket: {
        host,
        port: Number(port),
        tls: protocol === 'rediss' ? {} : undefined, // ✅ 必须是 {} 或 true
        reconnectStrategy: (retries: number) => {
          console.log(`${config.clientName} reconnection attempt ${retries + 1}`);
          if (retries > 10) return false;
          return Math.min(1000 * Math.pow(2, retries), 30000);
        },
        connectTimeout: 10000,
        noDelay: true,
      },
      username,
      password,
      pingInterval: 30000,
    };

    client = createClient(clientConfig);

    client.on('error', (err) => console.error(`${config.clientName} error:`, err));
    client.on('ready', () => console.log(`${config.clientName} ready`));

    const connectWithRetry = async () => {
      try {
        await client!.connect();
        console.log(`${config.clientName} connected successfully`);
      } catch (err) {
        console.error(`${config.clientName} initial connection failed:`, err);
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
  private cacheKey(key: string) { return `cache:${encodeURIComponent(key)}`; }

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
    // 从索引集合里获取所有缓存 key
    const allMembers: string[] = await this.withRetry(() =>
      this.client.sMembers(this.cacheIndexKey())
    );
  
    let cleared = 0;
    for (const key of allMembers) {
      // 如果没有 prefix，全部清理；有 prefix 时只清理符合条件的
      if (!prefix || key.startsWith(`cache:${encodeURIComponent(prefix)}`)) {
        await this.withRetry(() => this.client.del(key));
        await this.withRetry(() => this.client.sRem(this.cacheIndexKey(), key));
        cleared++;
      }
    }
  
    if (cleared > 0) {
      console.log(
        `Cleared ${cleared} cache entr${cleared > 1 ? "ies" : "y"} with prefix: ${
          prefix ?? "ALL"
        }`
      );
    }
  }
  

  // ---------- 播放统计相关 ----------
  private playStatsKey() {
    return 'global:play_stats';
  }

  private userStatsKey(userName: string) {
    return `u:${userName}:stats`;
  }

  private contentStatsKey(source: string, id: string) {
    return `content:stats:${source}+${id}`;
  }

  // 获取全站播放统计
  async getPlayStats(): Promise<PlayStatsResult> {
    try {
      // 尝试从缓存获取
      const cached = await this.getCache('play_stats_summary');
      if (cached) {
        return cached;
      }

      // 重新计算统计数据
      const allUsers = await this.getAllUsers();
      const userStats: UserPlayStat[] = [];
      let totalWatchTime = 0;
      let totalPlays = 0;

      // 收集所有用户统计
      for (const username of allUsers) {
        const userStat = await this.getUserPlayStat(username);
        userStats.push(userStat);
        totalWatchTime += userStat.totalWatchTime;
        totalPlays += userStat.totalPlays;
      }

      // 计算热门来源
      const sourceMap = new Map<string, number>();
      for (const user of userStats) {
        for (const record of user.recentRecords) {
          const count = sourceMap.get(record.source_name) || 0;
          sourceMap.set(record.source_name, count + 1);
        }
      }

      const topSources = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 生成近7天统计（简化版本）
      const dailyStats = [];
      const now = Date.now();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        dailyStats.push({
          date: date.toISOString().split('T')[0],
          watchTime: Math.floor(totalWatchTime / 7), // 简化计算
          plays: Math.floor(totalPlays / 7)
        });
      }

      const result: PlayStatsResult = {
        totalUsers: allUsers.length,
        totalWatchTime,
        totalPlays,
        avgWatchTimePerUser: allUsers.length > 0 ? totalWatchTime / allUsers.length : 0,
        avgPlaysPerUser: allUsers.length > 0 ? totalPlays / allUsers.length : 0,
        userStats: userStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime),
        topSources,
        dailyStats
      };

      // 缓存结果30分钟
      await this.setCache('play_stats_summary', result, 1800);

      return result;
    } catch (error) {
      console.error('获取播放统计失败:', error);
      return {
        totalUsers: 0,
        totalWatchTime: 0,
        totalPlays: 0,
        avgWatchTimePerUser: 0,
        avgPlaysPerUser: 0,
        userStats: [],
        topSources: [],
        dailyStats: []
      };
    }
  }

  // 获取用户播放统计
  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    try {
      // 获取用户所有播放记录
      const playRecords = await this.getAllPlayRecords(userName);
      const records = Object.values(playRecords);

      if (records.length === 0) {
        return {
          username: userName,
          totalWatchTime: 0,
          totalPlays: 0,
          lastPlayTime: 0,
          recentRecords: [],
          avgWatchTime: 0,
          mostWatchedSource: ''
        };
      }

      // 计算统计数据
      const totalWatchTime = records.reduce((sum, record) => sum + record.play_time, 0);
      const totalPlays = records.length;
      const lastPlayTime = Math.max(...records.map(r => r.save_time));

      // 最近10条记录，按时间排序
      const recentRecords = records
        .sort((a, b) => b.save_time - a.save_time)
        .slice(0, 10);

      // 平均观看时长
      const avgWatchTime = totalPlays > 0 ? totalWatchTime / totalPlays : 0;

      // 最常观看的来源
      const sourceMap = new Map<string, number>();
      records.forEach(record => {
        const count = sourceMap.get(record.source_name) || 0;
        sourceMap.set(record.source_name, count + 1);
      });

      const mostWatchedSource = sourceMap.size > 0
        ? Array.from(sourceMap.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0]
        : '';

      return {
        username: userName,
        totalWatchTime,
        totalPlays,
        lastPlayTime,
        recentRecords,
        avgWatchTime,
        mostWatchedSource
      };
    } catch (error) {
      console.error(`获取用户 ${userName} 统计失败:`, error);
      return {
        username: userName,
        totalWatchTime: 0,
        totalPlays: 0,
        lastPlayTime: 0,
        recentRecords: [],
        avgWatchTime: 0,
        mostWatchedSource: ''
      };
    }
  }

  // 获取内容热度统计
  async getContentStats(limit = 10): Promise<ContentStat[]> {
    try {
      // 获取所有用户
      const allUsers = await this.getAllUsers();
      const contentMap = new Map<string, {
        record: PlayRecord;
        playCount: number;
        totalWatchTime: number;
        users: Set<string>;
      }>();

      // 收集所有播放记录
      for (const username of allUsers) {
        const playRecords = await this.getAllPlayRecords(username);

        Object.entries(playRecords).forEach(([key, record]) => {
          const contentKey = key; // source+id

          if (!contentMap.has(contentKey)) {
            contentMap.set(contentKey, {
              record,
              playCount: 0,
              totalWatchTime: 0,
              users: new Set()
            });
          }

          const content = contentMap.get(contentKey)!;
          content.playCount++;
          content.totalWatchTime += record.play_time;
          content.users.add(username);
        });
      }

      // 转换为ContentStat数组并排序
      const contentStats: ContentStat[] = Array.from(contentMap.entries())
        .map(([key, data]) => {
          const [source, id] = key.split('+');
          return {
            source,
            id,
            title: data.record.title,
            source_name: data.record.source_name,
            cover: data.record.cover,
            year: data.record.year,
            playCount: data.playCount,
            totalWatchTime: data.totalWatchTime,
            averageWatchTime: data.playCount > 0 ? data.totalWatchTime / data.playCount : 0,
            lastPlayed: data.record.save_time,
            uniqueUsers: data.users.size
          };
        })
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit);

      return contentStats;
    } catch (error) {
      console.error('获取内容统计失败:', error);
      return [];
    }
  }

  // 更新播放统计（当用户播放时调用）
  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number
  ): Promise<void> {
    try {
      // 清除全站统计缓存，下次查询时重新计算
      await this.deleteCache('play_stats_summary');

      // 这里可以添加更多实时统计更新逻辑
      // 比如更新用户统计缓存、内容热度等
      // 暂时只是清除缓存，实际统计在查询时重新计算
    } catch (error) {
      console.error('更新播放统计失败:', error);
    }
  }
}
