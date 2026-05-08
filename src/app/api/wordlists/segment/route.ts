/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// 词库键名（与管理员配置一致）
const KEY_HOT = 'wordlist:hot';
const KEY_SENSITIVE = 'wordlist:sensitive';
const KEY_ACTOR = 'wordlist:actor';

// 获取词库
async function getWordList(key: string): Promise<string[]> {
  try {
    const raw = await db.getCache(key);
    console.log(`[WordList] ${key} raw:`, raw);
    if (!raw) return [];
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.error(`[WordList] 读取 ${key} 失败:`, error);
    return [];
  }
}

/**
 * POST /api/wordlists/segment
 * 对标题进行分词，返回匹配的词
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: '缺少 title 参数' },
        { status: 400 }
      );
    }

    // 读取三个词库
    const [hotWords, sensitiveWords, actorWords] = await Promise.all([
      getWordList(KEY_HOT),
      getWordList(KEY_SENSITIVE),
      getWordList(KEY_ACTOR),
    ]);

    console.log('[WordList] 词库加载完成:', {
      hot: hotWords.length,
      sensitive: sensitiveWords.length,
      actor: actorWords.length,
    });

    // 匹配逻辑：标题中包含词库中的词
    const matchedHot = hotWords.filter((word) => title.includes(word));
    const matchedSensitive = sensitiveWords.filter((word) => title.includes(word));
    const matchedActor = actorWords.filter((word) => title.includes(word));

    console.log('[WordList] 匹配结果:', {
      title,
      hot: matchedHot,
      sensitive: matchedSensitive,
      actor: matchedActor,
    });

    return NextResponse.json({
      hot: matchedHot,
      sensitive: matchedSensitive,
      actor: matchedActor,
    });
  } catch (error) {
    console.error('[WordList] 分词失败:', error);
    return NextResponse.json(
      { error: '分词失败' },
      { status: 500 }
    );
  }
}
