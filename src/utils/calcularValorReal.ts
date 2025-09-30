interface FacturaData {
  total_a_pagar: number;
  total_sin_iva?: number | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  factura_iva?: number | null;
  notas?: string | null;
  clasificacion?: string | null;
  descuentos_antes_iva?: string | null;
}

export function calcularMontoRetencionReal(factura: FacturaData): number {
  if (!factura.monto_retencion || factura.monto_retencion === 0) return 0;
  const baseParaRetencion = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
  return baseParaRetencion * (factura.monto_retencion / 100);
}

export function calcularValorRealAPagar(factura: FacturaData): number {
  let valorReal = factura.total_a_pagar;

  // Restar descuentos antes de IVA si existen
  if (factura.descuentos_antes_iva) {
    try {
      const descuentos = JSON.parse(factura.descuentos_antes_iva);
      const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
        if (desc.tipo === 'porcentaje') {
          const base = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
          return sum + (base * desc.valor / 100);
        }
        return sum + desc.valor;
      }, 0);
      valorReal -= totalDescuentos;
    } catch (error) {
      console.error('Error parsing descuentos_antes_iva:', error);
    }
  }

  // Restar retención si aplica
  if (factura.tiene_retencion && factura.monto_retencion) {
    const retencion = calcularMontoRetencionReal(factura);
    valorReal -= retencion;
  }

  // Restar descuento por pronto pago si está disponible
  // El descuento se calcula sobre el total sin IVA
  if (factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0) {
    const baseParaDescuento = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
    const descuento = baseParaDescuento * (factura.porcentaje_pronto_pago / 100);
    valorReal -= descuento;
  }

  return valorReal;
}

export function calcularTotalReal(factura: FacturaData): number {
  // Para notas de crédito relacionadas, mostrar $0
  if (factura.clasificacion === 'nota_credito' && factura.notas) {
    try {
      const notasData = JSON.parse(factura.notas);
      if (notasData.tipo === 'nota_credito' && notasData.factura_original_id) {
        return 0; // Nota de crédito relacionada muestra $0
      }
    } catch (error) {
      // Si no se puede parsear, usar total original
    }
  }

  let totalReal = factura.total_a_pagar;

  // Restar descuentos antes de IVA si existen
  if (factura.descuentos_antes_iva) {
    try {
      const descuentos = JSON.parse(factura.descuentos_antes_iva);
      const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
        if (desc.tipo === 'porcentaje') {
          const base = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
          return sum + (base * desc.valor / 100);
        }
        return sum + desc.valor;
      }, 0);
      totalReal -= totalDescuentos;
    } catch (error) {
      console.error('Error parsing descuentos_antes_iva:', error);
    }
  }

  // Para facturas normales, verificar si tiene notas de crédito aplicadas
  if (factura.notas && factura.clasificacion !== 'nota_credito') {
    try {
      const notasData = JSON.parse(factura.notas);

      // Buscar si tiene notas de crédito aplicadas
      if (notasData.notas_credito && notasData.notas_credito.length > 0) {
        // Calcular el total de descuentos
        const totalDescuentos = notasData.notas_credito.reduce((sum: number, nc: any) => {
          return sum + (nc.valor_descuento || 0);
        }, 0);

        // Restar los descuentos de notas de crédito
        totalReal -= totalDescuentos;
        return totalReal;
      }

      // Si existe total_con_descuentos (método alternativo)
      if (notasData.total_con_descuentos !== undefined) {
        return notasData.total_con_descuentos;
      }
    } catch (error) {
      console.error('Error parsing notas:', error);
    }
  }

  return totalReal;
}