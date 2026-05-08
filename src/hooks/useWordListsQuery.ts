import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';

// ============================================================================
// Query Options
// ============================================================================

/**
 * 获取分词配置（管理员用）
 */
export const wordListsOptions = queryOptions({
  queryKey: ['admin', 'wordlists'] as const,
  queryFn: async () => {
    const response = await fetch('/api/admin/wordlists');
    if (!response.ok) {
      throw new Error('Failed to fetch word lists');
    }
    return await response.json() as {
      hot: string[];
      sensitive: string[];
      actor: string[];
    };
  },
  staleTime: 5 * 60 * 1000, // 5分钟
  gcTime: 10 * 60 * 1000,
  retry: 1,
});

// ============================================================================
// Hooks
// ============================================================================

/**
 * 获取分词配置
 */
export function useWordListsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    ...wordListsOptions,
    enabled: options?.enabled,
  });
}

/**
 * 保存分词配置
 */
export function useSaveWordListsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      hot: string[];
      sensitive: string[];
      actor: string[];
    }) => {
      const response = await fetch('/api/admin/wordlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to save word lists');
      }

      return await response.json();
    },
    onSuccess: () => {
      // 刷新配置
      queryClient.invalidateQueries({
        queryKey: ['admin', 'wordlists'],
      });
    },
  });
}
