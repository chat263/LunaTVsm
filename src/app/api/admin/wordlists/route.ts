/* eslint-disable no-console */
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// KV 存储的键名
const KEY_HOT = 'wordlist:hot';
const KEY_SENSITIVE = 'wordlist:sensitive';
const KEY_ACTOR = 'wordlist:actor';

/**
 * 从 KV 读取字符串数组
 */
async function getWordList(key: string): Promise<string[]> {
  try {
    const raw = await db.getCache(key);
    if (!raw) return [];
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.error(`读取 ${key} 失败:`, error);
    return [];
  }
}

/**
 * 保存字符串数组到 KV
 */
async function setWordList(key: string, list: string[]): Promise<void> {
  await db.setCache(key, JSON.stringify(list));
}

/**
 * GET /api/admin/wordlists
 * 获取所有分词配置（需要管理员权限）
 */
export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '不支持本地存储进行管理员配置' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [hot, sensitive, actor] = await Promise.all([
      getWordList(KEY_HOT),
      getWordList(KEY_SENSITIVE),
      getWordList(KEY_ACTOR),
    ]);

    return NextResponse.json({ hot, sensitive, actor });
  } catch (error) {
    console.error('获取分词配置失败:', error);
    return NextResponse.json(
      { error: '获取配置失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/wordlists
 * 保存分词配置（仅站长可修改）
 */
export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '不支持本地存储进行管理员配置' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 仅站长可以修改配置
  if (authInfo.username !== process.env.USERNAME) {
    return NextResponse.json(
      { error: '只有站长可以修改分词配置' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { hot, sensitive, actor } = body;

    if (!Array.isArray(hot) || !Array.isArray(sensitive) || !Array.isArray(actor)) {
      return NextResponse.json(
        { error: '参数格式错误' },
        { status: 400 }
      );
    }

    await Promise.all([
      setWordList(KEY_HOT, hot),
      setWordList(KEY_SENSITIVE, sensitive),
      setWordList(KEY_ACTOR, actor),
    ]);

    revalidatePath('/admin');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存分词配置失败:', error);
    return NextResponse.json(
      { error: '保存失败' },
      { status: 500 }
    );
  }
}
