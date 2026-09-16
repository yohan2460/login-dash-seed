/**
 * Paginación completa para consultas de Supabase.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * PostgREST corta las respuestas en 1000 filas por defecto. No lanza error,
 * no avisa: devuelve las primeras 1000 y listo. Cualquier `.select()` sin
 * `.range()` que alimente un total (montos, conteos, reportes) empieza a
 * mentir en silencio apenas la tabla cruza ese umbral, y nadie se entera
 * hasta que un número no cuadra con la contabilidad.
 *
 * IMPORTANTE: la consulta que le pases DEBE tener un `.order()` determinista.
 * Sin orden estable, Postgres puede devolver las filas en distinto orden
 * entre páginas, y el paginado saltea o duplica registros. Ordená por una
 * columna única (o agregá `id` como desempate).
 */

const DEFAULT_PAGE_SIZE = 1000;

/** Tope de seguridad: evita un loop infinito si una consulta devuelve siempre página llena. */
const DEFAULT_MAX_ROWS = 100_000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface FetchAllOptions {
  pageSize?: number;
  maxRows?: number;
  /** Nombre para los mensajes de error y el aviso de tope alcanzado. */
  label?: string;
}

/**
 * Trae TODAS las filas de una consulta, paginando de a `pageSize`.
 *
 * @example
 * const facturas = await fetchAllRows(
 *   (from, to) => supabase
 *     .from('facturas')
 *     .select('*')
 *     .order('created_at', { ascending: false })
 *     .order('id')                       // desempate: orden determinista
 *     .range(from, to),
 *   { label: 'facturas' }
 * );
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: FetchAllOptions = {}
): Promise<T[]> {
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    maxRows = DEFAULT_MAX_ROWS,
    label = 'registros',
  } = options;

  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Error paginando ${label} (offset ${from}): ${error.message}`);
    }

    if (!data || data.length === 0) break;

    rows.push(...data);

    // Página incompleta = última página.
    if (data.length < pageSize) return rows;
  }

  // Si llegamos acá con el tope justo, puede haber quedado data afuera.
  if (rows.length >= maxRows) {
    console.warn(
      `fetchAllRows: se alcanzó el tope de ${maxRows} filas trayendo ${label}. ` +
      `Puede haber registros sin cargar; considerá filtrar del lado del servidor o usar una vista agregada.`
    );
  }

  return rows;
}

/**
 * Cuenta filas sin traerlas. Usa `count: 'exact'` + `head: true`, así
 * Postgres devuelve solo el número y no viaja ni una fila por la red.
 *
 * Preferí esto siempre que solo necesites un conteo: traer 1000 facturas
 * completas para hacerles `.length` es tirar ancho de banda a la basura
 * y encima da mal apenas pasás el cap.
 */
export async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label = 'registros'
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(`Error contando ${label}: ${error.message}`);
  return count ?? 0;
}
