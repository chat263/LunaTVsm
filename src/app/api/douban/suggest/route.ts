import { NextRequest, NextResponse } from 'next/server';
import { getRandomUserAgent } from '@/lib/user-agent';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q) {
    return NextResponse.json([], { status: 400 });
  }

  try {
    const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Referer': 'https://movie.douban.com/',
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json([]);
    }

    const data = await res.json();
    // 只返回电影/电视剧类型，过滤掉人物等
    const filtered = (Array.isArray(data) ? data : [])
      .filter((item: any) => item.type === 'movie' || !item.type)
      .slice(0, 5)
      .map((item: any) => ({ id: item.id, title: item.title, year: item.year }));

    return NextResponse.json(filtered);
  } catch {
    return NextResponse.json([]);
  }
}
