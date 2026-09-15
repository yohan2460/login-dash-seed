import { supabase } from '@/integrations/supabase/client';

/**
 * Sistematización masiva de facturas.
 *
 * Marcar 800 facturas de a una son 800 requests. Esto las agrupa y las manda
 * en pocas consultas, pero hay tres trampas que obligan a no hacerlo ingenuo:
 *
 * 1. `.in('id', [...])` viaja en la QUERY STRING de la URL. Con 800 UUIDs son
 *    unos 30 KB de URL y el servidor la rechaza (el tope típico está entre 8
 *    y 16 KB). Por eso se parte en lotes.
 *
 * 2. `clasificacion_original` guarda de dónde venía cada factura, pero un
 *    UPDATE masivo escribe el mismo valor en todas las filas que toca. Por eso
 *    se agrupa por `clasificacion` actual y se hace un UPDATE por grupo: las
 *    de mercancía guardan 'mercancia', las de gasto guardan 'gasto'.
 *
 * 3. Una factura YA sistematizada tiene `clasificacion === 'sistematizada'`.
 *    Volver a procesarla escribiría `clasificacion_original = 'sistematizada'`
 *    y se perdería para siempre el dato de qué era antes. Se omiten.
 */

/** Cuántos ids entran por UPDATE. 150 UUIDs ≈ 5,5 KB de URL: margen de sobra. */
const TAMANO_LOTE = 150;

export interface FacturaSistematizable {
  id: string;
  numero_factura?: string;
  clasificacion?: string | null;
}

export interface ResultadoSistematizacion {
  /** Facturas efectivamente marcadas como sistematizadas. */
  actualizadas: number;
  /** Facturas que ya estaban sistematizadas y no se tocaron. */
  omitidas: number;
  /** Lotes que la base rechazó, con el motivo. */
  fallidas: Array<{ cantidad: number; motivo: string }>;
}

function partirEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

/**
 * Cuenta cuántas facturas de la selección se van a tocar realmente.
 * Sirve para que el diálogo de confirmación diga la verdad antes de escribir.
 */
export function resumirSeleccion(facturas: FacturaSistematizable[]) {
  const pendientes = facturas.filter(f => f.clasificacion !== 'sistematizada');
  const porClasificacion = new Map<string, number>();

  for (const f of pendientes) {
    const clave = f.clasificacion ?? 'sin clasificar';
    porClasificacion.set(clave, (porClasificacion.get(clave) ?? 0) + 1);
  }

  return {
    aProcesar: pendientes.length,
    yaSistematizadas: facturas.length - pendientes.length,
    porClasificacion: Array.from(porClasificacion, ([clasificacion, cantidad]) => ({
      clasificacion,
      cantidad,
    })).sort((a, b) => b.cantidad - a.cantidad),
  };
}

/**
 * Marca las facturas como sistematizadas, preservando de dónde venía cada una.
 *
 * No aborta ante el primer error: sigue con los lotes restantes y devuelve el
 * detalle de qué se pudo y qué no. Con 800 facturas, cortar a la mitad y no
 * decir dónde quedó sería peor que fallar del todo.
 */
export async function sistematizarEnLote(
  facturas: FacturaSistematizable[],
  onProgress?: (procesadas: number, total: number) => void
): Promise<ResultadoSistematizacion> {
  const resultado: ResultadoSistematizacion = {
    actualizadas: 0,
    omitidas: 0,
    fallidas: [],
  };

  // Trampa 3: las que ya están sistematizadas se dejan como están.
  const pendientes = facturas.filter(f => f.clasificacion !== 'sistematizada');
  resultado.omitidas = facturas.length - pendientes.length;

  if (pendientes.length === 0) return resultado;

  // Trampa 2: un UPDATE por cada clasificación de origen.
  const grupos = new Map<string | null, string[]>();
  for (const factura of pendientes) {
    const origen = factura.clasificacion ?? null;
    const ids = grupos.get(origen);
    if (ids) ids.push(factura.id);
    else grupos.set(origen, [factura.id]);
  }

  const total = pendientes.length;
  let procesadas = 0;

  for (const [clasificacionOriginal, ids] of grupos) {
    // Trampa 1: partir para que la URL no explote.
    for (const lote of partirEnLotes(ids, TAMANO_LOTE)) {
      const { error } = await supabase
        .from('facturas')
        .update({
          clasificacion: 'sistematizada',
          clasificacion_original: clasificacionOriginal,
        })
        .in('id', lote);

      if (error) {
        resultado.fallidas.push({ cantidad: lote.length, motivo: error.message });
      } else {
        resultado.actualizadas += lote.length;
      }

      procesadas += lote.length;
      onProgress?.(procesadas, total);
    }
  }

  return resultado;
}
