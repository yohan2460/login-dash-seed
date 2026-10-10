import type { DatosFactura } from './factura.ts';

// Payload JSON de webhook-facturas SIN user_id ni pdf (los agrega quien llama).
export interface PayloadWebhookFacturas {
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  factura_cufe: string;
  total_a_pagar: number;
  total_sin_iva: number;
  factura_iva: number;
  factura_iva_porcentaje: number;
  factura_iva_5: number;
  factura_iva_5_porcentaje: number;
  tiene_retencion: boolean;
  monto_retencion: number;
  fecha_emision: string;
  fecha_vencimiento?: string;
}

// Decisiones de semántica (verificadas contra webhook-facturas y la app):
//
// - total_a_pagar = PayableAmount. Es el valor BRUTO de la factura (base + IVA
//   + otros impuestos). La app lo usa como "total" (NotaCreditoDialog calcula
//   sin IVA como total_a_pagar - factura_iva). DIAN NO descuenta las retenciones
//   de PayableAmount (son informativas), por eso monto_retencion va aparte.
// - total_sin_iva = TaxExclusiveAmount (base gravable ya neta de descuentos).
//   LineExtensionAmount es la suma de líneas ANTES de descuentos globales y
//   puede ser mayor. OJO: webhook-facturas hoy no persiste este campo (lo calcula
//   el trigger calculate_total_sin_iva); se envía por completitud/auditoría.
// - factura_iva = IVA real al 19%; factura_iva_5 = IVA real al 5%. Cualquier otra
//   tarifa (iva.ivaOtros) no tiene columna: no se envía, queda dentro del total.
// - factura_iva_porcentaje = 19 solo si la factura tiene IVA 19%, si no 0.
//   factura_iva_5_porcentaje = 5 siempre (default del webhook).
export function mapearAWebhook(f: DatosFactura): PayloadWebhookFacturas {
  const payload: PayloadWebhookFacturas = {
    numero_factura: f.numeroFactura,
    emisor_nombre: f.emisorNombre,
    emisor_nit: f.emisorNit,
    factura_cufe: f.cufe,
    total_a_pagar: f.payable,
    total_sin_iva: f.taxExclusive,
    factura_iva: f.iva.iva19,
    factura_iva_porcentaje: f.iva.hayIva19 ? 19 : 0,
    factura_iva_5: f.iva.iva5,
    factura_iva_5_porcentaje: 5,
    tiene_retencion: f.retencion.total > 0,
    monto_retencion: f.retencion.total,
    fecha_emision: f.fechaEmision,
  };
  if (f.fechaVencimiento) payload.fecha_vencimiento = f.fechaVencimiento;
  return payload;
}
