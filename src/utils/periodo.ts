/**
 * Filtrado por período (año / mes).
 *
 * POR QUÉ NO USAMOS `new Date(fecha).getFullYear()`
 * Las fechas llegan de Postgres como 'YYYY-MM-DD' o ISO completo. `new Date()`
 * interpreta una fecha sin hora como UTC medianoche. En Colombia (UTC-5) eso
 * corre el día hacia atrás: `new Date('2026-01-01').getFullYear()` devuelve
 * **2025**, porque local son las 19:00 del 31 de diciembre.
 *
 * O sea: filtrar por año con `getFullYear()` manda cada factura del 1 de enero
 * al año anterior. Por eso leemos los dígitos directamente del string, que es
 * exactamente lo que ya hacen FacturasTable y PagosProximos al formatear.
 */

export const TODOS = 'todos';

export const MESES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export interface Periodo {
  /** Año como string de 4 dígitos, o TODOS. */
  anio: string;
  /** Mes como string de 2 dígitos ('01'..'12'), o TODOS. */
  mes: string;
}

export const PERIODO_VACIO: Periodo = { anio: TODOS, mes: TODOS };

/** Extrae año y mes de una fecha sin pasar por `new Date()`. */
export function extraerAnioMes(fecha?: string | null): { anio: string; mes: string } | null {
  if (!fecha) return null;
  const match = /^(\d{4})-(\d{2})/.exec(String(fecha));
  if (!match) return null;
  return { anio: match[1], mes: match[2] };
}

/**
 * Años presentes en los datos, de más reciente a más antiguo.
 *
 * Se derivan de la data real y no de un rango fijo: si mañana cargás una
 * factura de 2027 aparece sola, y no se ofrecen años vacíos que al
 * seleccionarlos muestran una tabla en blanco.
 */
export function obtenerAniosDisponibles<T>(
  items: T[],
  obtenerFecha: (item: T) => string | null | undefined
): string[] {
  const anios = new Set<string>();

  for (const item of items) {
    const parsed = extraerAnioMes(obtenerFecha(item));
    if (parsed) anios.add(parsed.anio);
  }

  return Array.from(anios).sort((a, b) => b.localeCompare(a));
}

/** ¿La fecha cae dentro del período elegido? */
export function coincidePeriodo(fecha: string | null | undefined, periodo: Periodo): boolean {
  const filtraAnio = periodo.anio !== TODOS;
  const filtraMes = periodo.mes !== TODOS;

  if (!filtraAnio && !filtraMes) return true;

  const parsed = extraerAnioMes(fecha);

  // Sin fecha no se puede ubicar en un período: queda fuera cuando se filtra.
  if (!parsed) return false;

  if (filtraAnio && parsed.anio !== periodo.anio) return false;
  if (filtraMes && parsed.mes !== periodo.mes) return false;

  return true;
}

/** Filtra una lista por período usando el campo de fecha que le indiques. */
export function filtrarPorPeriodo<T>(
  items: T[],
  periodo: Periodo,
  obtenerFecha: (item: T) => string | null | undefined
): T[] {
  if (periodo.anio === TODOS && periodo.mes === TODOS) return items;
  return items.filter(item => coincidePeriodo(obtenerFecha(item), periodo));
}

/** ¿Hay algún filtro de período activo? Para mostrar el botón de limpiar. */
export function hayPeriodoActivo(periodo: Periodo): boolean {
  return periodo.anio !== TODOS || periodo.mes !== TODOS;
}

/**
 * Convierte un período en un rango de fechas 'YYYY-MM-DD' inclusivo.
 *
 * Sirve para pantallas que ya filtran por rango (Informes): ahí el selector de
 * año no debe sumarse como filtro extra, porque chocaría con el rango que la
 * pantalla trae por defecto y daría cero resultados sin explicación. En vez de
 * eso, elegir un período REESCRIBE el rango.
 *
 * Devuelve null si no hay año elegido (un mes suelto no define un rango).
 */
export function rangoDePeriodo(periodo: Periodo): { inicio: string; fin: string } | null {
  if (periodo.anio === TODOS) return null;

  if (periodo.mes === TODOS) {
    return { inicio: `${periodo.anio}-01-01`, fin: `${periodo.anio}-12-31` };
  }

  const anio = Number(periodo.anio);
  const mes = Number(periodo.mes);

  // Día 0 del mes siguiente = último día de este mes. Construido con Date
  // local y formateado a mano: `toISOString()` lo pasaría a UTC y en
  // Colombia (UTC-5) devolvería el día anterior.
  const ultimoDia = new Date(anio, mes, 0).getDate();

  return {
    inicio: `${periodo.anio}-${periodo.mes}-01`,
    fin: `${periodo.anio}-${periodo.mes}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

/** Etiqueta legible del período, para encabezados y estados vacíos. */
export function describirPeriodo(periodo: Periodo): string {
  const mes = MESES.find(m => m.value === periodo.mes)?.label;

  if (periodo.anio === TODOS && periodo.mes === TODOS) return 'Todos los períodos';
  if (periodo.anio === TODOS) return `${mes} (todos los años)`;
  if (periodo.mes === TODOS) return `Año ${periodo.anio}`;
  return `${mes} ${periodo.anio}`;
}
