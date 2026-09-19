import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * POR QUÉ ESTE TEST EXISTE
 *
 * El consecutivo de `numero_serie` se estancaba cerca de 1000. La causa no era
 * la lógica de máximos: era que PostgREST corta las respuestas en 1000 filas
 * SIN lanzar error. Un test que devuelve todas las filas que le pidas no
 * reproduce el bug y no prueba nada.
 *
 * Por eso el fake de abajo aplica el cap de verdad: `MAX_ROWS = 1000`. Si
 * alguien saca el `.range()` del código de producción, estos tests fallan.
 */

/** Tope que Supabase configura por defecto en PostgREST (`db-max-rows`). */
const POSTGREST_MAX_ROWS = 1000;

interface FacturaRow {
  id: string;
  numero_serie: string | null;
  clasificacion: string;
  emisor_nit: string;
  emisor_nombre: string;
  created_at: string;
}

/** Filas que ve el fake. Cada test la reescribe. */
let tabla: FacturaRow[] = [];

/** Cuántas peticiones hizo el código bajo prueba (para verificar el paginado). */
let requestCount = 0;

/**
 * Query builder mínimo que imita a supabase-js.
 *
 * Soporta solo lo que usa `serieNumberSuggestion`: select/not/in/eq/order/range/limit.
 * Es thenable, así que `await` sobre la cadena devuelve `{ data, error }`.
 */
function createQuery(rows: FacturaRow[]) {
  let current = [...rows];
  let range: { from: number; to: number } | null = null;
  let limit: number | null = null;
  let ordered = false;

  const builder = {
    select(_columns: string) {
      return builder;
    },
    not(column: keyof FacturaRow, op: string, _value: unknown) {
      if (op === 'is') current = current.filter((r) => r[column] !== null);
      return builder;
    },
    in(column: keyof FacturaRow, values: unknown[]) {
      current = current.filter((r) => values.includes(r[column]));
      return builder;
    },
    eq(column: keyof FacturaRow, value: unknown) {
      current = current.filter((r) => r[column] === value);
      return builder;
    },
    order(column: keyof FacturaRow, opts?: { ascending?: boolean }) {
      const asc = opts?.ascending !== false;
      current = [...current].sort((a, b) => {
        const av = String(a[column] ?? '');
        const bv = String(b[column] ?? '');
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      ordered = true;
      return builder;
    },
    range(from: number, to: number) {
      range = { from, to };
      return builder;
    },
    limit(n: number) {
      limit = n;
      return builder;
    },
    then(resolve: (value: { data: FacturaRow[]; error: null }) => unknown) {
      requestCount++;

      let data = current;

      if (range) {
        data = data.slice(range.from, range.to + 1);
      }
      if (limit !== null) {
        data = data.slice(0, limit);
      }

      // EL CAP. Silencioso, sin error, igual que en producción.
      data = data.slice(0, POSTGREST_MAX_ROWS);

      return Promise.resolve(resolve({ data, error: null }));
    },
    /** Solo para las aserciones del test, no existe en supabase-js. */
    __ordered: () => ordered,
  };

  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (_table: string) => createQuery(tabla),
  },
}));

const { SerieNumberSuggestion } = await import('./serieNumberSuggestion');

/** Genera `count` facturas con series correlativas 1..count. */
function seedSeries(count: number, clasificacion = 'mercancia'): FacturaRow[] {
  return Array.from({ length: count }, (_, i) => ({
    // id con padding para que el orden alfabético coincida con el numérico:
    // así el paginado del fake es determinista y comparable.
    id: String(i + 1).padStart(9, '0'),
    numero_serie: String(i + 1),
    clasificacion,
    emisor_nit: '900123456',
    emisor_nombre: 'Proveedor SA',
    created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
  }));
}

beforeEach(() => {
  tabla = [];
  requestCount = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('suggestNextSerie — el bug del tope de 1000', () => {
  it('pasa de 1000: con 4823 series sugiere 4824, no 1001', async () => {
    tabla = seedSeries(4823);

    const suggestion = await SerieNumberSuggestion.suggestNextSerie('900123456');

    expect(suggestion).toBe('4824');
  });

  it('hace más de una petición: pagina en vez de confiar en una sola respuesta', async () => {
    tabla = seedSeries(4823);

    await SerieNumberSuggestion.suggestNextSerie('900123456');

    // 4823 filas / 1000 por página = 5 páginas.
    expect(requestCount).toBe(5);
  });

  it('encuentra el máximo aunque esté en la última página', async () => {
    // El 7777 queda al final del orden por id, o sea en la última página:
    // es exactamente el caso que el código viejo nunca veía.
    tabla = seedSeries(3000);
    tabla.push({
      id: '000009999',
      numero_serie: '7777',
      clasificacion: 'mercancia',
      emisor_nit: '900123456',
      emisor_nombre: 'Proveedor SA',
      created_at: '2026-01-01T00:00:00Z',
    });

    const suggestion = await SerieNumberSuggestion.suggestNextSerie('900123456');

    expect(suggestion).toBe('7778');
  });

  it('escala a 65k+ series sin reventar por "Maximum call stack size exceeded"', async () => {
    // Este es el límite que hacía explotar a Math.max(...arr).
    tabla = seedSeries(70000);

    const suggestion = await SerieNumberSuggestion.suggestNextSerie('900123456');

    expect(suggestion).toBe('70001');
  });

  it('sugiere 1 cuando no hay ninguna serie cargada', async () => {
    tabla = [];

    const suggestion = await SerieNumberSuggestion.suggestNextSerie('900123456');

    expect(suggestion).toBe('1');
  });

  it('ignora las facturas sin numero_serie', async () => {
    tabla = seedSeries(1500);
    tabla.forEach((row, i) => {
      if (i % 2 === 0) row.numero_serie = null;
    });

    const suggestion = await SerieNumberSuggestion.suggestNextSerie('900123456');

    // La serie más alta que queda es la 1500 (índice 1499, impar).
    expect(suggestion).toBe('1501');
  });
});

describe('getAvailableSeries — huecos reales, no huecos inventados por el cap', () => {
  it('no reporta como faltantes series que sí existen más allá de la fila 1000', async () => {
    tabla = seedSeries(3000);

    const faltantes = await SerieNumberSuggestion.getAvailableSeries();

    // Correlativo perfecto del 1 al 3000: no falta ninguna.
    // El código viejo veía 1000 filas, creía que el máximo era ~1000 y
    // devolvía huecos fantasma.
    expect(faltantes).toEqual([]);
  });

  it('detecta los huecos verdaderos por encima de 1000', async () => {
    tabla = seedSeries(2500).filter(
      (row) => !['1200', '1201', '2400'].includes(String(row.numero_serie))
    );

    const faltantes = await SerieNumberSuggestion.getAvailableSeries();

    expect(faltantes).toEqual([1200, 1201, 2400]);
  });

  it('solo mira mercancía y sistematizada', async () => {
    tabla = [
      ...seedSeries(1200, 'mercancia'),
      {
        id: '000099999',
        numero_serie: '9999',
        clasificacion: 'gasto',
        emisor_nit: '900123456',
        emisor_nombre: 'Proveedor SA',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const faltantes = await SerieNumberSuggestion.getAvailableSeries();

    // Si el gasto 9999 se colara, el máximo sería 9999 y habría ~8800 faltantes.
    expect(faltantes).toEqual([]);
  });

  it('escala a 65k+ sin reventar y sin colgarse en el chequeo de huecos', async () => {
    tabla = seedSeries(70000).filter((row) => row.numero_serie !== '55555');

    const faltantes = await SerieNumberSuggestion.getAvailableSeries();

    expect(faltantes).toEqual([55555]);
  });
});
