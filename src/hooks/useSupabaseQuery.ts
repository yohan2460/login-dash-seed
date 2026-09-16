import { useQuery, QueryKey, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

type SupabaseQueryFn<T> = () => Promise<T>;

const defaultOptions = {
  staleTime: 60 * 1000,
  // v5 renombró `cacheTime` a `gcTime`; el nombre viejo se ignoraba callado.
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false
} as const;

/**
 * Las opciones que aceptan las pantallas.
 *
 * `UseQueryOptions` de v5 exige `queryKey` y `queryFn` adentro del objeto, pero
 * acá esos dos llegan como argumentos aparte. Tipar el parámetro con
 * `UseQueryOptions` hacía que cada llamada con `{ enabled: !!user }` fuera un
 * error de compilación —eran 11 de los 23 errores del proyecto—. Omitirlos deja
 * el tipo diciendo la verdad sobre lo que este hook realmente recibe.
 */
type SupabaseQueryOptions<TData> = Omit<
  UseQueryOptions<TData>,
  'queryKey' | 'queryFn'
>;

export function useSupabaseQuery<TData>(
  queryKey: QueryKey,
  queryFn: SupabaseQueryFn<TData>,
  options?: SupabaseQueryOptions<TData>
): UseQueryResult<TData> {
  return useQuery<TData>({
    queryKey,
    queryFn,
    ...defaultOptions,
    ...options
  });
}
