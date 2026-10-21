import { z } from 'zod';
import {
  calcularValorRealAPagar,
  redondearMonto,
  type FacturaData,
} from './calcularValorReal';

/** Largo mínimo del motivo (debe coincidir con el guard de la RPC). */
export const MOTIVO_MIN_LENGTH = 5;

export interface FacturaReversible extends FacturaData {
  id: string;
}

export interface ReversalFacturaPayload {
  id: string;
  valor_real_a_pagar: number;
}

/**
 * Arma el `p_facturas` de la RPC `reversar_pago`.
 *
 * Recalcula valor_real_a_pagar desde cero con uso_pronto_pago=false: el valor
 * guardado quedó rebajado por saldos y pronto pago (pérdida de información),
 * y la factura vuelve a pendiente con el pronto pago otra vez disponible.
 * No muta la entrada ni toca porcentaje_pronto_pago.
 */
export function buildReversalPayload(facturas: FacturaReversible[]): ReversalFacturaPayload[] {
  return facturas.map(f => ({
    id: f.id,
    valor_real_a_pagar: redondearMonto(
      calcularValorRealAPagar({ ...f, uso_pronto_pago: false })
    ),
  }));
}

export type ValidacionMotivo =
  | { valido: true; motivo: string }
  | { valido: false; motivo: string; error: string };

export function validarMotivo(raw: string | null | undefined): ValidacionMotivo {
  const motivo = (raw ?? '').trim();
  if (motivo.length < MOTIVO_MIN_LENGTH) {
    return {
      valido: false,
      motivo,
      error: `El motivo es requerido (mínimo ${MOTIVO_MIN_LENGTH} caracteres)`,
    };
  }
  return { valido: true, motivo };
}

interface ComprobanteRef {
  id: string;
  detalles?: Record<string, unknown> | null;
}

/**
 * Los comprobantes individuales regenerados desde un grupal apuntan a este
 * vía `detalles.regenerado_desde_grupal`; la RPC exige reversar el grupal.
 */
export function resolverComprobanteRaiz(comprobante: ComprobanteRef): string {
  const origen = comprobante.detalles?.regenerado_desde_grupal;
  return typeof origen === 'string' && origen.length > 0 ? origen : comprobante.id;
}

interface AplicacionSaldoRef {
  saldo_favor_id: string;
  monto_aplicado: number | string;
  saldos_favor?: { estado?: string | null } | null;
}

export interface SaldoADevolver {
  saldo_favor_id: string;
  monto: number;
  cancelado: boolean;
}

export interface ResumenSaldosADevolver {
  saldos: SaldoADevolver[];
  total: number;
  hayCancelados: boolean;
}

export function resumirSaldosADevolver(aplicaciones: AplicacionSaldoRef[]): ResumenSaldosADevolver {
  const porSaldo = new Map<string, SaldoADevolver>();
  for (const a of aplicaciones) {
    const previo = porSaldo.get(a.saldo_favor_id);
    const monto = Number(a.monto_aplicado) || 0;
    const cancelado = a.saldos_favor?.estado === 'cancelado';
    porSaldo.set(a.saldo_favor_id, {
      saldo_favor_id: a.saldo_favor_id,
      monto: redondearMonto((previo?.monto ?? 0) + monto),
      cancelado: (previo?.cancelado ?? false) || cancelado,
    });
  }
  const saldos = [...porSaldo.values()];
  return {
    saldos,
    total: redondearMonto(saldos.reduce((s, x) => s + x.monto, 0)),
    hayCancelados: saldos.some(s => s.cancelado),
  };
}

const reversarPagoResultSchema = z.object({
  comprobante_id: z.string(),
  facturas_restauradas: z.number(),
  pagos_partidos_eliminados: z.number(),
  aplicaciones_revertidas: z.number(),
  monto_saldo_devuelto: z.number(),
  derivados_reversados: z.number(),
  warnings: z
    .array(z.string())
    .nullish()
    .transform(w => w ?? []),
});

export type ReversarPagoResult = z.infer<typeof reversarPagoResultSchema>;

/** Valida la respuesta de la RPC (types.ts está vacío, el cliente no tiene tipos). */
export function parseReversarPagoResult(data: unknown): ReversarPagoResult {
  return reversarPagoResultSchema.parse(data);
}
