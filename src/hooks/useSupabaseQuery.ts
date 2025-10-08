import { useQuery, QueryKey, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

type SupabaseQueryFn<T> = () => Promise<T>;

const defaultOptions = {
  staleTime: 60 * 1000,
  cacheTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false
} as const;

export function useSupabaseQuery<TData>(
  queryKey: QueryKey,
  queryFn: SupabaseQueryFn<TData>,
  options?: UseQueryOptions<TData>
): UseQueryResult<TData> {
  return useQuery<TData>({
    queryKey,
    queryFn,
    ...defaultOptions,
    ...options
  });
}
