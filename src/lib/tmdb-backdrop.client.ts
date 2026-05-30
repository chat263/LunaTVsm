/**
 * 纯 client-side TMDB backdrop 查询
 * 不 import 任何 server-only 模块，可安全用于 client components
 */
export async function searchTMDBBackdrop(
  title: string,
  year?: string
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ title: title.trim() });
    if (year) params.set('year', year);
    const res = await fetch(`/api/tmdb/backdrop?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.backdrop ?? null;
  } catch {
    return null;
  }
}
