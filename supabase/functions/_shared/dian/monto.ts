// Parseo estricto de montos DIAN (siempre con '.' decimal). Espeja `parseMonto`
// de webhook-facturas: nada de parseFloat("1,5") === 1. Acá somos todavía más
// estrictos con el formato porque el XML es de una máquina: si no es un decimal
// plano, es señal de que algo cambió y preferimos fallar a adivinar.
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function parsearMontoDian(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const texto = String(raw).trim();
  if (!DECIMAL.test(texto)) return null;
  const n = Number(texto);
  if (!Number.isFinite(n)) return null;
  // Las columnas son DECIMAL(x,2): redondeamos acá, igual que el webhook.
  return Math.round(n * 100) / 100;
}
