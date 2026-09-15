export interface FacturaData {
  total_a_pagar: number;
  total_sin_iva?: number | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  factura_iva?: number | null;
  factura_iva_5?: number | null;
  factura_iva_5_porcentaje?: number | null;
  notas?: string | null;
  clasificacion?: string | null;
  descuentos_antes_iva?: string | null;
  uso_pronto_pago?: boolean | null;
  estado_nota_credito?: 'pendiente' | 'aplicada' | 'anulada' | null;
}

/**
 * Redondeo único para montos de dinero.
 *
 * Las columnas de la base son DECIMAL(x,2). Antes cada flujo de pago
 * redondeaba distinto — NotaCreditoDialog con Math.round, PaymentMethodDialog
 * y MultiplePaymentDialog escribían el float crudo — y convivían registros en
 * pesos enteros con registros con centavos residuales. Eso hacía fallar las
 * comparaciones `===` entre valores que deberían ser iguales.
 */
export function redondearMonto(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.round(valor * 100) / 100;
}

interface NotasCreditoTotales {
  totalNotasCredito: number;
  totalNotasCreditoSinIVA: number;
  totalNotasCreditoIVA: number;
  retencionActual: number | null;
  totalSinIvaOriginal: number | null;
  totalOriginal: number | null;
  ivaOriginal: number | null;
  retencionPorcentaje: number | null;
}

/**
 * Calcula el valor antes de IVA SIN considerar descuentos
 * Para retención y pronto pago se debe calcular sobre el valor base ANTES de aplicar descuentos
 *
 * IMPORTANTE: Usa el campo total_sin_iva que contiene el valor ORIGINAL sin descuentos ni IVA
 * Si no existe, calcula restando el IVA del total
 */
function calcularValorOriginalAntesIVA(factura: FacturaData): number {
  if (factura.notas) {
    try {
      const notasData = JSON.parse(factura.notas);
      if (notasData.total_sin_iva_original !== undefined && notasData.total_sin_iva_original !== null) {
        return notasData.total_sin_iva_original;
      }
    } catch (error) {
      console.error('Error parsing total_sin_iva_original desde notas:', error);
    }
  }

  // Si existe total_sin_iva, usarlo directamente (este es el valor ORIGINAL sin descuentos)
  if (factura.total_sin_iva !== null && factura.total_sin_iva !== undefined) {
    return factura.total_sin_iva;
  }

  // Fallback: Si no existe total_sin_iva, calcular restando ambos IVAs (19% y 5%)
  // Esto NO considera descuentos, pero es mejor que nada
  return factura.total_a_pagar - (factura.factura_iva || 0) - (factura.factura_iva_5 || 0);
}

function obtenerTotalesNotasCredito(factura: FacturaData): NotasCreditoTotales {
  if (!factura.notas) {
    return {
      totalNotasCredito: 0,
      totalNotasCreditoSinIVA: 0,
      totalNotasCreditoIVA: 0,
      retencionActual: null,
      totalSinIvaOriginal: null,
      totalOriginal: null,
      ivaOriginal: null,
      retencionPorcentaje: null
    };
  }

  try {
    const notasData = JSON.parse(factura.notas);
    const notasCredito = Array.isArray(notasData?.notas_credito) ? notasData.notas_credito : [];

    const acumulado = notasCredito.reduce(
      (acc: { total: number; sinIva: number; iva: number }, nc: any) => {
        const valor = Number(nc?.valor_descuento) || 0;
        const sinIva = Number(nc?.descuento_sin_iva) || 0;
        const iva = Number(nc?.iva_descuento) || 0;
        return {
          total: acc.total + valor,
          sinIva: acc.sinIva + sinIva,
          iva: acc.iva + iva
        };
      },
      { total: 0, sinIva: 0, iva: 0 }
    );

    return {
      totalNotasCredito: acumulado.total,
      totalNotasCreditoSinIVA: acumulado.sinIva,
      totalNotasCreditoIVA: acumulado.iva,
      retencionActual: notasData?.retencion_actual ?? null,
      totalSinIvaOriginal: notasData?.total_sin_iva_original ?? null,
      totalOriginal: notasData?.total_original ?? null,
      ivaOriginal: notasData?.iva_original ?? null,
      retencionPorcentaje: notasData?.retencion_porcentaje ?? null
    };
  } catch (error) {
    console.error('Error parsing notas de crédito para totales:', error);
    return {
      totalNotasCredito: 0,
      totalNotasCreditoSinIVA: 0,
      totalNotasCreditoIVA: 0,
      retencionActual: null,
      totalSinIvaOriginal: null,
      totalOriginal: null,
      ivaOriginal: null,
      retencionPorcentaje: null
    };
  }
}

export function obtenerBaseSinIVADespuesNotasCredito(factura: FacturaData): number {
  // Restar ambos IVAs (19% y 5%) del total
  const baseDesdeFactura = factura.total_a_pagar - (factura.factura_iva || 0) - (factura.factura_iva_5 || 0);

  if (Number.isFinite(baseDesdeFactura) && baseDesdeFactura >= 0) {
    return baseDesdeFactura;
  }

  const baseOriginal = calcularValorOriginalAntesIVA(factura);
  const { totalNotasCreditoSinIVA } = obtenerTotalesNotasCredito(factura);
  return Math.max(0, baseOriginal - totalNotasCreditoSinIVA);
}

/**
 * Descuentos de `descuentos_antes_iva`, calculados SIEMPRE sobre la base SIN IVA.
 *
 * FUENTE ÚNICA DE VERDAD. Antes esta lógica estaba duplicada en
 * calcularValorRealAPagar (que usaba total_a_pagar, o sea CON IVA) y en
 * calcularTotalReal (que usaba la base SIN IVA). Sobre una factura de
 * $1.000.000 + IVA 19% con 10% de descuento, una restaba $119.000 y la otra
 * $100.000: se guardaba un número y se le mostraba otro al proveedor.
 *
 * La base correcta es SIN IVA — es lo que dice el nombre del campo y lo que
 * ya venían mostrando los comprobantes y PDFs.
 */
function calcularDescuentosAntesIVA(factura: FacturaData): number {
  if (!factura.descuentos_antes_iva) return 0;

  try {
    const descuentos = JSON.parse(factura.descuentos_antes_iva);
    if (!Array.isArray(descuentos)) return 0;

    const baseSinIVA = calcularValorOriginalAntesIVA(factura);

    return descuentos.reduce((sum: number, desc: any) => {
      const valor = Number(desc?.valor) || 0;
      if (desc?.tipo === 'porcentaje') {
        return sum + (baseSinIVA * valor / 100);
      }
      return sum + valor;
    }, 0);
  } catch (error) {
    console.error('Error parsing descuentos_antes_iva:', error);
    return 0;
  }
}

export function calcularMontoRetencionReal(factura: FacturaData): number {
  // El guard de `tiene_retencion` vive acá adentro a propósito: GastosPendientes,
  // MercanciaPendiente y ModernDashboard llamaban a esta función sin chequearlo,
  // así que una factura con monto_retencion residual y tiene_retencion=false
  // inflaba el KPI "Total Retenciones" por encima de lo que mostraba el detalle.
  if (!factura.tiene_retencion) return 0;
  if (!factura.monto_retencion || factura.monto_retencion === 0) return 0;
  const baseParaRetencion = obtenerBaseSinIVADespuesNotasCredito(factura);
  return baseParaRetencion * (factura.monto_retencion / 100);
}

export function calcularValorRealAPagar(factura: FacturaData): number {
  // IMPORTANTE: total_a_pagar es el valor ORIGINAL (con IVA, sin descuentos aplicados)
  // Debemos restar: descuentos + retención + pronto pago
  let valorReal = factura.total_a_pagar;

  // 1. Restar descuentos antes de IVA (base SIN IVA, igual que calcularTotalReal)
  valorReal -= calcularDescuentosAntesIVA(factura);

  // 2. Restar retención si aplica
  // La retención se recalcula considerando notas de crédito aplicadas
  valorReal -= calcularMontoRetencionReal(factura);

  // 3. Restar pronto pago SOLO si realmente se usó.
  // Antes acá alcanzaba con que existiera el porcentaje, sin mirar
  // uso_pronto_pago: una factura pendiente mostraba un total ya rebajado por
  // un descuento que todavía no se había ganado. El resto del sistema
  // (Informes, RegeneratePDFDialog, ModernDashboard) ya exigía este flag, y
  // la propia UI etiqueta el badge como "(disp.)" cuando está en false.
  if (factura.uso_pronto_pago && factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0) {
    const baseParaDescuento = calcularValorOriginalAntesIVA(factura);
    valorReal -= baseParaDescuento * (factura.porcentaje_pronto_pago / 100);
  }

  // Redondeo único y final: todos los flujos que persisten valor_real_a_pagar
  // pasan por acá, así que ya no hay registros con centavos residuales.
  return redondearMonto(Math.max(0, valorReal));
}

export function calcularTotalReal(factura: FacturaData): number {
  // NUEVO: Si es nota de crédito aplicada o anulada, mostrar $0
  if (factura.estado_nota_credito === 'aplicada' || factura.estado_nota_credito === 'anulada') {
    return 0;
  }

  // LEGACY: Mantener compatibilidad con sistema antiguo
  if (factura.clasificacion === 'nota_credito' && factura.notas) {
    try {
      const notasData = JSON.parse(factura.notas);
      if (notasData.tipo === 'nota_credito' && (notasData.factura_aplicada_id || notasData.factura_original_id)) {
        return 0; // Nota de crédito relacionada muestra $0
      }
    } catch (error) {
      // Si no se puede parsear, continuar con lógica normal
    }
  }

  // PRIORIDAD 1: facturas con notas de crédito aplicadas.
  //
  // Acá había antes una rama que leía `notasData.total_con_descuentos`
  // (plural). Esa clave NO se escribe en ningún lado del repo — lo que sí se
  // persiste es la columna `total_con_descuento` (singular), en
  // NotaCreditoDialog.tsx:439. La rama era código muerto que nunca se
  // ejecutaba y ocultaba que el cálculo real caía siempre al fallback.
  // Se eliminó en vez de "arreglarla": cablear la columna cambiaría los
  // montos mostrados y es una decisión de negocio aparte.
  if (factura.notas && factura.clasificacion !== 'nota_credito') {
    try {
      const notasData = JSON.parse(factura.notas);

      if (notasData.notas_credito && notasData.notas_credito.length > 0) {
        const totalDescuentos = notasData.notas_credito.reduce((sum: number, nc: any) => {
          return sum + (Number(nc.valor_descuento) || 0);
        }, 0);
        return redondearMonto(factura.total_a_pagar - totalDescuentos);
      }
    } catch (error) {
      console.error('Error parsing notas:', error);
    }
  }

  // PRIORIDAD 2: descuentos antes de IVA, con la MISMA fórmula que usa
  // calcularValorRealAPagar para persistir. Antes divergían.
  return redondearMonto(factura.total_a_pagar - calcularDescuentosAntesIVA(factura));
}

export function obtenerBaseSinIVAOriginal(factura: FacturaData): number {
  return calcularValorOriginalAntesIVA(factura);
}

/**
 * Obtiene el IVA total (suma de IVA 19% + IVA 5%)
 */
export function obtenerIVATotal(factura: FacturaData): number {
  return (factura.factura_iva || 0) + (factura.factura_iva_5 || 0);
}
