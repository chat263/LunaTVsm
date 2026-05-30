import { NextRequest, NextResponse } from 'next/server';
import { isTMDBEnabled } from '@/lib/tmdb.client';
import { getConfig } from '@/lib/config';
import { getCacheKey, getCache, setCache, TMDB_CACHE_EXPIRE } from '@/lib/tmdb-cache';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

export const runtime = 'nodejs';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w1280';

async function fetchTMDB<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const config = await getConfig();
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.append('api_key', config.SiteConfig.TMDBApiKey!);
  url.searchParams.append('language', config.SiteConfig.TMDBLanguage || 'zh-CN');
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': DEFAULT_USER_AGENT },
  });
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title')?.trim();
  const year = searchParams.get('year') || undefined;

  if (!title) {
    return NextResponse.json({ error: 'Missing title' }, { status: 400 });
  }

  if (!(await isTMDBEnabled())) {
    return NextResponse.json({ backdrop: null });
  }

  const cacheKey = getCacheKey('backdrop', { title, year: year || '' });
  const cached = await getCache(cacheKey);
  if (cached !== undefined) {
    return NextResponse.json({ backdrop: cached });
  }

  try {
    const movieParams: Record<string, string> = { query: title };
    if (year) movieParams.year = year;
    const movieRes = await fetchTMDB<any>('/search/movie', movieParams);
    const movieHit = movieRes.results?.find((r: any) => r.backdrop_path);
    if (movieHit?.backdrop_path) {
      const url = `${TMDB_BACKDROP_BASE_URL}${movieHit.backdrop_path}`;
      await setCache(cacheKey, url, TMDB_CACHE_EXPIRE.movie_details);
      return NextResponse.json({ backdrop: url });
    }

    const tvParams: Record<string, string> = { query: title };
    if (year) tvParams.first_air_date_year = year;
    const tvRes = await fetchTMDB<any>('/search/tv', tvParams);
    const tvHit = tvRes.results?.find((r: any) => r.backdrop_path);
    if (tvHit?.backdrop_path) {
      const url = `${TMDB_BACKDROP_BASE_URL}${tvHit.backdrop_path}`;
      await setCache(cacheKey, url, TMDB_CACHE_EXPIRE.movie_details);
      return NextResponse.json({ backdrop: url });
    }

    await setCache(cacheKey, null, TMDB_CACHE_EXPIRE.actor_search);
    return NextResponse.json({ backdrop: null });
  } catch (e) {
    console.error('[TMDB backdrop]', e);
    return NextResponse.json({ backdrop: null });
  }
}
