'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import VideoCard from '@/components/VideoCard';
import { SearchResult } from '@/lib/types';

interface WordRecommendationProps {
  title: string;
}

type TabType = 'actor' | 'hot' | 'sensitive';

// 计算聚合统计数据（与搜索页保持一致）
function computeGroupStats(group: SearchResult[]) {
  const episodes = (() => {
    const countMap = new Map<number, number>();
    group.forEach((g) => {
      const len = g.episodes?.length || 0;
      if (len > 0) countMap.set(len, (countMap.get(len) || 0) + 1);
    });
    let max = 0;
    let res = 0;
    countMap.forEach((v, k) => {
      if (v > max) {
        max = v;
        res = k;
      }
    });
    return res;
  })();

  const source_names = Array.from(
    new Set(group.map((g) => g.source_name).filter(Boolean)),
  ) as string[];

  const douban_id = (() => {
    const countMap = new Map<number, number>();
    group.forEach((g) => {
      if (g.douban_id && g.douban_id > 0) {
        countMap.set(g.douban_id, (countMap.get(g.douban_id) || 0) + 1);
      }
    });
    let max = 0;
    let res: number | undefined;
    countMap.forEach((v, k) => {
      if (v > max) {
        max = v;
        res = k;
      }
    });
    return res;
  })();

  return { episodes, source_names, douban_id };
}

export default function WordRecommendationSection({
  title,
}: WordRecommendationProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('actor');
  const [wordData, setWordData] = useState<{
    actor: string[];
    hot: string[];
    sensitive: string[];
  }>({ actor: [], hot: [], sensitive: [] });
  const [selectedWord, setSelectedWord] = useState<string>('');
  const [rawResults, setRawResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 聚合后的结果（按标题+年份+类型分组）
  const aggregatedResults = (() => {
    const map = new Map<string, SearchResult[]>();
    const keyOrder: string[] = [];

    rawResults.forEach((item) => {
      const key = `${item.title.replaceAll(' ', '')}-${item.year || 'unknown'}-${
        item.episodes.length === 1 ? 'movie' : 'tv'
      }`;
      const arr = map.get(key) || [];
      if (arr.length === 0) keyOrder.push(key);
      arr.push(item);
      map.set(key, arr);
    });

    return keyOrder.map(
      (key) => [key, map.get(key)!] as [string, SearchResult[]],
    );
  })();

  // 搜索关键词（最多返回 21 条，但聚合后可能少于分组数）
  const search = async (keyword: string) => {
    if (!keyword) return;
    setSearching(true);
    try {
      // 添加随机时间戳防止浏览器 HTTP 缓存
      const url = `/api/search?q=${encodeURIComponent(keyword)}&_t=${Date.now()}`;
      const res = await fetch(url, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store',
          Pragma: 'no-cache',
        },
      });
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      // 限制原始结果数量（最多 21 条原始结果，聚合后会减少）
      setRawResults(results.slice(0, 21));
    } catch (error) {
      console.error('搜索失败:', error);
      setRawResults([]);
    } finally {
      setSearching(false);
    }
  };

  // 获取分词结果，并智能选择默认选项卡和默认搜索词
  const fetchWordSegments = useCallback(async () => {
    if (!title) return;
    setLoading(true);
    try {
      const res = await fetch('/api/wordlists/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (res.ok) {
        const actor = data.actor || [];
        const hot = data.hot || [];
        const sensitive = data.sensitive || [];
        setWordData({ actor, hot, sensitive });

        let firstTab: TabType = 'actor';
        let firstWord = '';
        if (actor.length > 0) {
          firstTab = 'actor';
          firstWord = actor[0];
        } else if (hot.length > 0) {
          firstTab = 'hot';
          firstWord = hot[0];
        } else if (sensitive.length > 0) {
          firstTab = 'sensitive';
          firstWord = sensitive[0];
        }

        if (firstWord) {
          setActiveTab(firstTab);
          setSelectedWord(firstWord);
          await search(firstWord);
        } else {
          setRawResults([]);
          setSelectedWord('');
        }
      }
    } catch (error) {
      console.error('获取分词失败:', error);
    } finally {
      setLoading(false);
    }
  }, [title]);

  // 滚动懒加载
  useEffect(() => {
    if (!containerRef.current || hasLoaded) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !hasLoaded) {
          setHasLoaded(true);
          fetchWordSegments();
        }
      },
      { threshold: 0.1 },
    );

    observerRef.current.observe(containerRef.current);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [hasLoaded, fetchWordSegments]);

  // 未加载时渲染占位符
  if (!hasLoaded) {
    return <div ref={containerRef} className="h-4" />;
  }

  const hasAnyWord =
    wordData.actor.length > 0 ||
    wordData.hot.length > 0 ||
    wordData.sensitive.length > 0;

  // 正常渲染 - Netflix 风格
  return (
    <div
      ref={containerRef}
      className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800"
    >
      {/* 标题区域 */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          为你推荐
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          基于当前内容的智能推荐
        </p>
      </div>

      {/* 选项卡 - Pill 风格 */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { key: 'actor', label: '🎭 演员作品', count: wordData.actor.length },
          { key: 'hot', label: '🔥 热门标签', count: wordData.hot.length },
          {
            key: 'sensitive',
            label: '⚠️ 相关主题',
            count: wordData.sensitive.length,
          },
        ].map(({ key, label, count }) => {
          const tabKey = key as TabType;
          const words = wordData[tabKey];
          const hasWords = words.length > 0;

          if (!hasWords) return null;

          return (
            <button
              key={key}
              onClick={() => {
                if (activeTab === tabKey) return;
                setActiveTab(tabKey);
                const firstWord = words[0];
                if (firstWord && firstWord !== selectedWord) {
                  setSelectedWord(firstWord);
                  search(firstWord);
                }
              }}
              className={`
                px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap
                transition-all duration-200 flex items-center gap-2
                ${
                  activeTab === tabKey
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg scale-105'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }
              `}
            >
              <span>{label}</span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 词语标签 - Chip 风格 */}
      {(() => {
        const words = wordData[activeTab];
        if (words.length === 0) return null;
        return (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                选择关键词：
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {words.map((word) => (
                <button
                  key={word}
                  onClick={() => {
                    if (word === selectedWord) return;
                    setSelectedWord(word);
                    search(word);
                  }}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${
                      selectedWord === word
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg scale-105'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
                    }
                  `}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 搜索结果展示 */}
      {searching && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            正在搜索相关内容...
          </p>
        </div>
      )}
      {!searching && aggregatedResults.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              找到 {aggregatedResults.length} 个相关内容
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8">
            {aggregatedResults.map(([mapKey, group]) => {
              const title = group[0]?.title || '';
              const poster = group[0]?.poster || '';
              const year = group[0]?.year || 'unknown';
              const { episodes, source_names, douban_id } =
                computeGroupStats(group);
              const type = episodes === 1 ? 'movie' : 'tv';
              return (
              <div key={mapKey} className='w-full'>
                <VideoCard
                  from='search'
                  isAggregate={true}
                  title={title}
                  poster={poster}
                  year={year}
                  episodes={episodes}
                  source_names={source_names}
                  douban_id={douban_id}
                  query={selectedWord !== title ? selectedWord : ''}
                  type={type}
                />
              </div>
            );
          })}
          </div>
        </div>
      )}
      {!searching &&
        selectedWord &&
        aggregatedResults.length === 0 &&
        rawResults.length === 0 && (
          <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
            未找到与 “{selectedWord}” 相关的内容
          </div>
        )}
      {loading && (
        <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
          正在分析标题...
        </div>
      )}

      {/* 词库为空提示 */}
      {!loading && !hasAnyWord && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
            <span className="text-3xl">📚</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            推荐功能需要配置词库
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            当前标题未匹配到任何关键词
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            请前往 <span className="font-medium text-blue-600 dark:text-blue-400">管理后台 &gt; 分词配置</span> 添加演员名、热门标签等
          </p>
        </div>
      )}
    </div>
  );
}
