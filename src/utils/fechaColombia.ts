/**
 * Fechas en hora de Colombia (America/Bogota, UTC-5 sin horario de verano).
 *
 * POR QUÉ NO USAMOS `new Date().toISOString().split('T')[0]`
 * `toISOString()` devuelve la fecha en UTC. Desde las 7 p.m. de Colombia ya es
 * el día siguiente en UTC, así que el "hoy" salía como mañana: los pagos
 * registrados de noche quedaban con fecha_pago del día siguiente.
 *
 * Usamos Intl con la zona fija para no depender del reloj ni de la zona
 * configurada en el navegador de cada equipo.
 */

export const ZONA_COLOMBIA = 'America/Bogota';

// en-CA formatea como YYYY-MM-DD.
const formatoFechaISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_COLOMBIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha de hoy en Colombia como 'YYYY-MM-DD' (formato del <input type="date">). */
export function hoyColombia(ahora: Date = new Date()): string {
  return formatoFechaISO.format(ahora);
}
