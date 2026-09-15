import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Prefijo común de todas las queries que leen la tabla `facturas`.
 *
 * Las once pantallas usan claves distintas —`['facturas','dashboard']`,
 * `['facturas','informes']`, `['facturas','gastos-pagados']`…— pero TODAS
 * empiezan con 'facturas'. React Query v5 hace match por prefijo, así que
 * invalidar esta clave alcanza a las once de una sola vez.
 *
 * Por eso NO hace falta unificarlas en una sola clave: unificar obligaría a
 * cada pantalla a traerse la tabla entera, que es justo lo contrario de donde
 * queremos ir (filtrar del lado del servidor).
 */
export const FACTURAS_KEY = ['facturas'] as const;

/**
 * Devuelve una función que marca como obsoletas TODAS las vistas de facturas.
 *
 * Por qué existe: antes, cada pantalla llamaba a su propio `refetch()` después
 * de escribir. Eso refrescaba esa pantalla y dejaba las otras diez con datos
 * viejos hasta que venciera su `staleTime` de 60 segundos. Durante esa ventana
 * la app mostraba cifras distintas para el mismo hecho según dónde mirabas.
 *
 * `invalidateQueries` sobre el prefijo hace las dos cosas que necesitamos:
 * refresca ya mismo las queries montadas, y marca las desmontadas para que
 * traigan datos frescos la próxima vez que se abran.
 *
 * @example
 * const invalidarFacturas = useInvalidateFacturas();
 * await supabase.from('facturas').update({ ... }).eq('id', id);
 * await invalidarFacturas();
 */
export function useInvalidateFacturas() {
  const queryClient = useQueryClient();

  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: FACTURAS_KEY }),
    [queryClient]
  );
}
