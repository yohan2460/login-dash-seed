export interface FacturaData {
  total_a_pagar: number;
  total_sin_iva?: number | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  factura_iva?: number | null;
  notas?: string | null;
  clasificacion?: string | null;
  descuentos_antes_iva?: string | null;
  estado_nota_credito?: 'pendiente' | 'aplicada' | 'anulada' | null;
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

  // Fallback: Si no existe total_sin_iva, calcular restando el IVA
  // Esto NO considera descuentos, pero es mejor que nada
  return factura.total_a_pagar - (factura.factura_iva || 0);
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
  const baseDesdeFactura = factura.total_a_pagar - (factura.factura_iva || 0);

  if (Number.isFinite(baseDesdeFactura) && baseDesdeFactura >= 0) {
    return baseDesdeFactura;
  }

  const baseOriginal = calcularValorOriginalAntesIVA(factura);
  const { totalNotasCreditoSinIVA } = obtenerTotalesNotasCredito(factura);
  return Math.max(0, baseOriginal - totalNotasCreditoSinIVA);
}

export function calcularMontoRetencionReal(factura: FacturaData): number {
  if (!factura.monto_retencion || factura.monto_retencion === 0) return 0;
  const baseParaRetencion = obtenerBaseSinIVADespuesNotasCredito(factura);
  return baseParaRetencion * (factura.monto_retencion / 100);
}

export function calcularValorRealAPagar(factura: FacturaData): number {
  // IMPORTANTE: total_a_pagar es el valor ORIGINAL (con IVA, sin descuentos aplicados)
  // Debemos restar: descuentos + retención + pronto pago
  let valorReal = factura.total_a_pagar;

  // 1. Restar descuentos antes de IVA si existen
  if (factura.descuentos_antes_iva) {
    try {
      const descuentos = JSON.parse(factura.descuentos_antes_iva);
      const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
        if (desc.tipo === 'porcentaje') {
          // Los descuentos porcentuales se aplican sobre total_a_pagar
          return sum + (factura.total_a_pagar * desc.valor / 100);
        }
        return sum + desc.valor;
      }, 0);
      valorReal -= totalDescuentos;
    } catch (error) {
      console.error('Error parsing descuentos_antes_iva:', error);
    }
  }

  // 2. Restar retención si aplica
  // La retención se recalcula considerando notas de crédito aplicadas
  if (factura.tiene_retencion && factura.monto_retencion) {
    valorReal -= calcularMontoRetencionReal(factura);
  }

  // 3. Restar descuento por pronto pago si está disponible
  // El pronto pago se calcula sobre la base original sin IVA (no se afecta con notas de crédito)
  if (factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0) {
    const baseParaDescuento = calcularValorOriginalAntesIVA(factura);
    const descuento = baseParaDescuento * (factura.porcentaje_pronto_pago / 100);
    valorReal -= descuento;
  }

  return valorReal;
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

  // PRIORIDAD 1: Para facturas con notas de crédito aplicadas, usar total_con_descuentos
  if (factura.notas && factura.clasificacion !== 'nota_credito') {
    try {
      const notasData = JSON.parse(factura.notas);

      // Si existe total_con_descuentos, usarlo directamente (YA incluye todo calculado)
      if (notasData.total_con_descuentos !== undefined && notasData.total_con_descuentos !== null) {
        console.log('✅ Usando total_con_descuentos:', notasData.total_con_descuentos, 'para factura', factura);
        return notasData.total_con_descuentos;
      }

      // FALLBACK: Si no existe total_con_descuentos pero sí array de notas_credito
      if (notasData.notas_credito && notasData.notas_credito.length > 0) {
        const totalDescuentos = notasData.notas_credito.reduce((sum: number, nc: any) => {
          return sum + (nc.valor_descuento || 0);
        }, 0);
        const resultado = factura.total_a_pagar - totalDescuentos;
        console.log('✅ Calculando total con NC:', {
          total_original: factura.total_a_pagar,
          descuentos: totalDescuentos,
          resultado
        });
        return resultado;
      }
    } catch (error) {
      console.error('Error parsing notas:', error);
    }
  }

  // PRIORIDAD 2: Calcular con descuentos antes de IVA
  let totalReal = factura.total_a_pagar;

  if (factura.descuentos_antes_iva) {
    try {
      const descuentos = JSON.parse(factura.descuentos_antes_iva);
      const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
        if (desc.tipo === 'porcentaje') {
          const base = calcularValorOriginalAntesIVA(factura);
          return sum + (base * desc.valor / 100);
        }
        return sum + desc.valor;
      }, 0);
      totalReal -= totalDescuentos;
    } catch (error) {
      console.error('Error parsing descuentos_antes_iva:', error);
    }
  }

  return totalReal;
}

export function obtenerBaseSinIVAOriginal(factura: FacturaData): number {
  return calcularValorOriginalAntesIVA(factura);
}
