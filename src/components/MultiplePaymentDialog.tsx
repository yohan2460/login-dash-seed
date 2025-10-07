import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Package, Calculator, X, CheckCircle, TrendingDown, Percent, CalendarIcon, Building2, User, Wallet, Download, Plus, Trash2, DollarSign } from 'lucide-react';
import { calcularValorRealAPagar, calcularMontoRetencionReal } from '@/utils/calcularValorReal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  clasificacion?: string | null;
  factura_iva?: number | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  valor_real_a_pagar?: number | null;
  total_sin_iva?: number | null;
  uso_pronto_pago?: boolean | null;
  descuentos_antes_iva?: string | null;
}

interface MultiplePaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  facturas: Factura[];
  onPaymentProcessed: () => void;
}

interface MetodoPagoPartido {
  metodo: string;
  monto: number;
}

interface SaldoFavor {
  id: string;
  emisor_nit: string;
  emisor_nombre: string;
  monto_inicial: number;
  saldo_disponible: number;
  motivo: string;
  numero_factura_origen: string | null;
  fecha_generacion: string;
}

export function MultiplePaymentDialog({
  isOpen,
  onClose,
  facturas,
  onPaymentProcessed
}: MultiplePaymentDialogProps) {
  const [metodoPago, setMetodoPago] = useState<string>('');
  const [fechaPago, setFechaPago] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  // Estado para controlar qué facturas usan pronto pago (por defecto todas las que lo tienen disponible)
  const [facturasConProntoPago, setFacturasConProntoPago] = useState<Set<string>>(
    new Set(facturas.filter(f => f.porcentaje_pronto_pago && f.porcentaje_pronto_pago > 0).map(f => f.id))
  );

  // Estados para pagos partidos
  const [usarPagoPartido, setUsarPagoPartido] = useState(false);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoPartido[]>([
    { metodo: '', monto: 0 }
  ]);

  // Estados para saldos a favor por proveedor
  const [saldosPorProveedor, setSaldosPorProveedor] = useState<{[nit: string]: SaldoFavor[]}>({});
  const [saldosSeleccionados, setSaldosSeleccionados] = useState<{[saldoId: string]: {monto: number, proveedorNit: string}}>({});
  const [loadingSaldos, setLoadingSaldos] = useState(false);
  const [saldosAplicados, setSaldosAplicados] = useState(false);
  const [aplicandoSaldos, setAplicandoSaldos] = useState(false);

  const { toast } = useToast();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularTotalOriginal = () => {
    return facturas.reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalReal = () => {
    return facturas.reduce((total, factura) => {
      const detalles = calcularDetallesFactura(factura);
      return total + detalles.valorReal;
    }, 0);
  };

  const calcularTotalIVA = () => {
    return facturas.reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const calcularTotalRetenciones = () => {
    return facturas.reduce((total, factura) => {
      if (!factura.tiene_retencion || !factura.monto_retencion) return total;
      return total + calcularMontoRetencionReal(factura);
    }, 0);
  };

  const calcularTotalProntoPago = () => {
    return facturas.reduce((total, factura) => {
      // Solo sumar si la factura está marcada para usar pronto pago
      if (!facturasConProntoPago.has(factura.id)) return total;
      if (!factura.porcentaje_pronto_pago || factura.porcentaje_pronto_pago === 0) return total;
      const baseParaDescuento = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
      const descuento = baseParaDescuento * (factura.porcentaje_pronto_pago / 100);
      return total + descuento;
    }, 0);
  };

  // Calcular total de saldos aplicados
  const calcularTotalSaldosAplicados = () => {
    return Object.values(saldosSeleccionados).reduce((sum, saldo) => sum + saldo.monto, 0);
  };

  // Calcular total final a pagar (después de aplicar saldos a favor)
  const calcularTotalFinalAPagar = () => {
    const totalReal = calcularTotalReal();
    const totalSaldos = calcularTotalSaldosAplicados();
    return Math.max(0, totalReal - totalSaldos);
  };

  // Aplicar saldos a favor a las facturas
  const aplicarSaldosAFavor = async () => {
    const totalSaldos = calcularTotalSaldosAplicados();
    if (totalSaldos === 0) {
      toast({
        title: "No hay saldos seleccionados",
        description: "Selecciona al menos un saldo a favor para aplicar",
        variant: "destructive"
      });
      return;
    }

    const totalReal = calcularTotalReal();
    if (totalSaldos > totalReal) {
      toast({
        title: "Saldos exceden el total",
        description: `Los saldos aplicados (${formatCurrency(totalSaldos)}) no pueden ser mayores al total a pagar (${formatCurrency(totalReal)})`,
        variant: "destructive"
      });
      return;
    }

    setAplicandoSaldos(true);
    try {
      // Aplicar cada saldo a favor a las facturas correspondientes del proveedor
      for (const [saldoId, saldoInfo] of Object.entries(saldosSeleccionados)) {
        if (saldoInfo.monto > 0) {
          // Encontrar facturas de este proveedor en el lote
          const facturasProveedor = facturas.filter(f => f.emisor_nit === saldoInfo.proveedorNit);

          if (facturasProveedor.length === 0) continue;

          // Aplicar el saldo proporcionalmente a todas las facturas del proveedor
          const montoPorFactura = saldoInfo.monto / facturasProveedor.length;

          for (const factura of facturasProveedor) {
            const { error: saldoError } = await supabase.rpc('aplicar_saldo_favor', {
              p_saldo_favor_id: saldoId,
              p_factura_destino_id: factura.id,
              p_monto_aplicado: montoPorFactura
            });

            if (saldoError) {
              throw new Error(`Error al aplicar saldo a favor: ${saldoError.message}`);
            }

            // Actualizar valor_real_a_pagar de la factura
            const detalles = calcularDetallesFactura(factura);
            const nuevoValorReal = detalles.valorReal - montoPorFactura;

            const { error: updateError } = await supabase
              .from('facturas')
              .update({
                valor_real_a_pagar: nuevoValorReal
              })
              .eq('id', factura.id);

            if (updateError) throw updateError;
          }
        }
      }

      setSaldosAplicados(true);

      // Recargar todas las facturas desde la BD para obtener los valores actualizados
      const facturasIds = facturas.map(f => f.id);
      const { data: facturasActualizadas, error: fetchError } = await supabase
        .from('facturas')
        .select('*')
        .in('id', facturasIds);

      if (fetchError) {
        console.error('Error al recargar facturas:', fetchError);
      } else if (facturasActualizadas) {
        // Actualizar los objetos factura en memoria con los nuevos datos
        facturas.forEach(factura => {
          const facturaActualizada = facturasActualizadas.find(f => f.id === factura.id);
          if (facturaActualizada) {
            Object.assign(factura, facturaActualizada);
          }
        });
      }

      toast({
        title: "✅ Saldos aplicados exitosamente",
        description: `Se aplicaron ${formatCurrency(totalSaldos)} en saldos a favor. Las facturas han sido actualizadas.`,
      });

      // Recargar saldos disponibles
      await fetchSaldosDisponibles();
    } catch (error: any) {
      console.error('Error al aplicar saldos:', error);
      toast({
        title: "Error al aplicar saldos",
        description: error?.message || "No se pudieron aplicar los saldos a favor",
        variant: "destructive"
      });
    } finally {
      setAplicandoSaldos(false);
    }
  };

  // Cargar saldos disponibles para cada proveedor al abrir el dialog
  useEffect(() => {
    if (isOpen && facturas.length > 0) {
      fetchSaldosDisponibles();
    }
  }, [isOpen, facturas]);

  const fetchSaldosDisponibles = async () => {
    setLoadingSaldos(true);
    try {
      // Obtener NITs únicos de proveedores
      const nitsUnicos = [...new Set(facturas.map(f => f.emisor_nit))];

      const saldosPorNit: {[nit: string]: SaldoFavor[]} = {};

      // Cargar saldos para cada proveedor
      for (const nit of nitsUnicos) {
        const { data, error } = await supabase
          .from('saldos_favor')
          .select('*')
          .eq('emisor_nit', nit)
          .eq('estado', 'activo')
          .gt('saldo_disponible', 0)
          .order('fecha_generacion', { ascending: true });

        if (error) {
          console.error(`Error al cargar saldos para NIT ${nit}:`, error);
          continue;
        }

        if (data && data.length > 0) {
          saldosPorNit[nit] = data;
        }
      }

      setSaldosPorProveedor(saldosPorNit);
    } catch (error) {
      console.error('Error al cargar saldos a favor:', error);
    } finally {
      setLoadingSaldos(false);
    }
  };

  // Calcular descuentos y retenciones por factura individual
  const calcularDetallesFactura = (factura: Factura) => {
    // Si los saldos ya fueron aplicados, usar el valor_real_a_pagar de la base de datos
    // que ya tiene los saldos descontados
    if (saldosAplicados && factura.valor_real_a_pagar !== null && factura.valor_real_a_pagar !== undefined) {
      // Calcular retención
      const retencion = factura.tiene_retencion && factura.monto_retencion
        ? calcularMontoRetencionReal(factura)
        : 0;

      // Calcular pronto pago SOLO si está habilitado para esta factura
      const aplicarProntoPago = facturasConProntoPago.has(factura.id);
      const prontoPago = aplicarProntoPago && factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0
        ? (() => {
            const baseParaDescuento = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
            return baseParaDescuento * (factura.porcentaje_pronto_pago / 100);
          })()
        : 0;

      // Calcular descuentos adicionales antes de IVA
      let descuentosAdicionales: any[] = [];
      let totalDescuentosAdicionales = 0;
      if (factura.descuentos_antes_iva) {
        try {
          descuentosAdicionales = JSON.parse(factura.descuentos_antes_iva);
          totalDescuentosAdicionales = descuentosAdicionales.reduce((sum, desc) => {
            if (desc.tipo === 'porcentaje') {
              const base = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
              return sum + (base * desc.valor / 100);
            }
            return sum + desc.valor;
          }, 0);
        } catch (error) {
          console.error('Error parsing descuentos_antes_iva:', error);
        }
      }

      // Usar el valor_real_a_pagar actualizado de la BD (ya incluye saldos aplicados)
      const valorReal = factura.valor_real_a_pagar;
      const totalDescuento = factura.total_a_pagar - valorReal;

      return {
        valorReal,
        retencion,
        prontoPago,
        totalDescuento,
        aplicarProntoPago,
        descuentosAdicionales,
        totalDescuentosAdicionales
      };
    }

    // Si NO se han aplicado saldos, calcular normalmente
    // Calcular retención
    const retencion = factura.tiene_retencion && factura.monto_retencion
      ? calcularMontoRetencionReal(factura)
      : 0;

    // Calcular pronto pago SOLO si está habilitado para esta factura
    const aplicarProntoPago = facturasConProntoPago.has(factura.id);
    const prontoPago = aplicarProntoPago && factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0
      ? (() => {
          const baseParaDescuento = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
          return baseParaDescuento * (factura.porcentaje_pronto_pago / 100);
        })()
      : 0;

    // Calcular descuentos adicionales antes de IVA
    let descuentosAdicionales: any[] = [];
    let totalDescuentosAdicionales = 0;
    if (factura.descuentos_antes_iva) {
      try {
        descuentosAdicionales = JSON.parse(factura.descuentos_antes_iva);
        totalDescuentosAdicionales = descuentosAdicionales.reduce((sum, desc) => {
          if (desc.tipo === 'porcentaje') {
            const base = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
            return sum + (base * desc.valor / 100);
          }
          return sum + desc.valor;
        }, 0);
      } catch (error) {
        console.error('Error parsing descuentos_antes_iva:', error);
      }
    }

    // Calcular valor real considerando si se aplica pronto pago o no
    let valorReal = factura.total_a_pagar;

    // Restar descuentos adicionales
    if (totalDescuentosAdicionales > 0) {
      valorReal -= totalDescuentosAdicionales;
    }

    // Restar retención
    if (retencion > 0) {
      valorReal -= retencion;
    }

    // Restar pronto pago solo si está habilitado
    if (prontoPago > 0) {
      valorReal -= prontoPago;
    }

    // Total descuento = diferencia entre total original y valor real
    const totalDescuento = factura.total_a_pagar - valorReal;

    return {
      valorReal,
      retencion,
      prontoPago,
      totalDescuento,
      aplicarProntoPago,
      descuentosAdicionales,
      totalDescuentosAdicionales
    };
  };

  // Función para toggle pronto pago de una factura
  const toggleProntoPago = (facturaId: string) => {
    setFacturasConProntoPago(prev => {
      const newSet = new Set(prev);
      if (newSet.has(facturaId)) {
        newSet.delete(facturaId);
      } else {
        newSet.add(facturaId);
      }
      return newSet;
    });
  };

  // Funciones para pagos partidos
  const agregarMetodoPago = () => {
    setMetodosPago([...metodosPago, { metodo: '', monto: 0 }]);
  };

  const eliminarMetodoPago = (index: number) => {
    if (metodosPago.length > 1) {
      setMetodosPago(metodosPago.filter((_, i) => i !== index));
    }
  };

  const actualizarMetodoPago = (index: number, campo: 'metodo' | 'monto', valor: string | number) => {
    const nuevosMetodos = [...metodosPago];
    if (campo === 'metodo') {
      nuevosMetodos[index].metodo = valor as string;
    } else {
      // Parsear el monto, permitir decimales
      const montoStr = valor.toString().replace(/[^0-9.]/g, '');
      nuevosMetodos[index].monto = montoStr ? parseFloat(montoStr) : 0;
    }
    setMetodosPago(nuevosMetodos);
  };

  const calcularTotalMetodosPago = (): number => {
    return metodosPago.reduce((total, mp) => total + (mp.monto || 0), 0);
  };

  const validarPagoPartido = (): boolean => {
    if (!usarPagoPartido) return true;

    const totalReal = calcularTotalReal();
    const totalMetodos = calcularTotalMetodosPago();

    // Verificar que todos los métodos estén seleccionados y tengan monto
    const todosCompletos = metodosPago.every(mp => mp.metodo && mp.monto > 0);

    // Verificar que la suma sea igual al total (con margen de error de 1 peso)
    const sumaCorrecta = Math.abs(totalMetodos - totalReal) < 1;

    return todosCompletos && sumaCorrecta;
  };

  // Función auxiliar para generar y guardar el PDF del comprobante múltiple
  const generarYGuardarComprobantePDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let currentY = 15;

    // Si los saldos fueron aplicados, obtener las aplicaciones desde la BD
    let saldosAplicadosDesdeDB: any[] = [];
    if (saldosAplicados) {
      try {
        const facturasIds = facturas.map(f => f.id);
        const { data: aplicaciones, error } = await supabase
          .from('aplicaciones_saldo')
          .select(`
            *,
            saldos_favor (
              emisor_nombre,
              emisor_nit,
              numero_factura_origen,
              motivo
            )
          `)
          .in('factura_destino_id', facturasIds);

        if (!error && aplicaciones) {
          saldosAplicadosDesdeDB = aplicaciones;
          console.log('Saldos aplicados desde BD:', saldosAplicadosDesdeDB);
        }
      } catch (error) {
        console.error('Error al cargar saldos aplicados:', error);
      }
    }

    // ========== ENCABEZADO ==========
    // Fondo del encabezado
    doc.setFillColor(59, 130, 246); // Azul
    doc.rect(0, 0, pageWidth, 45, 'F');

    // Determinar si hay un único proveedor o múltiples
    const proveedoresUnicos = [...new Set(facturas.map(f => f.emisor_nombre))];
    const esProveedorUnico = proveedoresUnicos.length === 1;

    // Título principal
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    if (esProveedorUnico) {
      // Truncar el nombre si es muy largo
      const nombreProveedor = proveedoresUnicos[0].length > 35
        ? proveedoresUnicos[0].substring(0, 32) + '...'
        : proveedoresUnicos[0];
      doc.text(`PAGO - ${nombreProveedor}`, pageWidth / 2, 20, { align: 'center' });
    } else {
      doc.text('PAGO MULTIPLE', pageWidth / 2, 20, { align: 'center' });
    }

    // Subtítulo
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    if (esProveedorUnico) {
      doc.text(`${facturas.length} ${facturas.length === 1 ? 'Factura' : 'Facturas'}`, pageWidth / 2, 28, { align: 'center' });
    } else {
      doc.text(`${facturas.length} Facturas - ${proveedoresUnicos.length} Proveedores`, pageWidth / 2, 28, { align: 'center' });
    }

    // Línea decorativa
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(pageWidth / 2 - 30, 32, pageWidth / 2 + 30, 32);

    currentY = 50;

    // ========== RESUMEN DEL PAGO (Card grande) ==========
    doc.setTextColor(0, 0, 0);

    // Título de sección
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DEL PAGO', 18, currentY + 7);
    currentY += 15;

    // Caja del resumen AMPLIADA (incluye todo)
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, currentY, pageWidth - 28, 60, 3, 3, 'S');

    // Grid de 4 columnas - Primera fila
    const colWidth = (pageWidth - 28) / 4;

    // Facturas
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Facturas', 14 + colWidth / 2, currentY + 8, { align: 'center' });
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246);
    doc.text(facturas.length.toString(), 14 + colWidth / 2, currentY + 18, { align: 'center' });

    // Total Original
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Total Original', 14 + colWidth * 1.5, currentY + 8, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(formatCurrency(calcularTotalOriginal()), 14 + colWidth * 1.5, currentY + 18, { align: 'center' });

    // Total a Pagar
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Total a Pagar', 14 + colWidth * 2.5, currentY + 8, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94); // Verde
    doc.text(formatCurrency(calcularTotalReal()), 14 + colWidth * 2.5, currentY + 18, { align: 'center' });

    // Descuentos Factura
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Descuentos Factura', 14 + colWidth * 3.5, currentY + 8, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94);
    doc.text(formatCurrency(calcularTotalOriginal() - calcularTotalReal()), 14 + colWidth * 3.5, currentY + 18, { align: 'center' });

    // Línea separadora dentro de la caja
    currentY += 28;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(18, currentY, pageWidth - 18, currentY);
    currentY += 2;

    // Segunda fila de detalles (dentro de la misma caja)
    const col3Width = (pageWidth - 28) / 3;

    // IVA Total
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('IVA Total', 14 + col3Width / 2, currentY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(formatCurrency(calcularTotalIVA()), 14 + col3Width / 2, currentY + 16, { align: 'center' });

    // Retenciones
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Retenciones', 14 + col3Width * 1.5, currentY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 115, 22); // Naranja
    doc.text(`-${formatCurrency(calcularTotalRetenciones())}`, 14 + col3Width * 1.5, currentY + 16, { align: 'center' });

    // Pronto Pago (ahora muestra el descuento)
    const totalProntoPago = calcularTotalProntoPago();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Pronto Pago', 14 + col3Width * 2.5, currentY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94); // Verde
    if (totalProntoPago > 0) {
      doc.text(`-${formatCurrency(totalProntoPago)}`, 14 + col3Width * 2.5, currentY + 16, { align: 'center' });
    } else {
      doc.text('-$ 0,00', 14 + col3Width * 2.5, currentY + 16, { align: 'center' });
    }

    currentY += 28;

    // ========== FACTURAS SELECCIONADAS ==========
    // Agregar espacio adicional antes del título
    currentY += 8;

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('FACTURAS SELECCIONADAS', 18, currentY + 7);
    currentY += 15;

    // Tabla detallada de facturas
    const tableData = facturas.map((factura, index) => {
      const detalles = calcularDetallesFactura(factura);
      const rows: any[] = [];

      // Fila principal
      rows.push([
        {
          content: `#${factura.numero_factura}`,
          styles: { fontStyle: 'bold', fontSize: 9 }
        },
        {
          content: factura.emisor_nombre,
          styles: { fontSize: 8 }
        },
        {
          content: factura.clasificacion === 'mercancia' ? 'Mercancía' : 'Gasto',
          styles: { fontSize: 7, halign: 'center', fillColor: [243, 244, 246] }
        },
        {
          content: formatCurrency(factura.total_a_pagar),
          styles: { halign: 'right', fontSize: 9 }
        },
        {
          content: formatCurrency(detalles.valorReal),
          styles: { halign: 'right', fontStyle: 'bold', fontSize: 9, textColor: [34, 197, 94] }
        }
      ]);

      // Fila de detalles (retención, pronto pago y descuentos adicionales) - SOLO si hay algo que mostrar
      let detallesText = '';

      // Descuentos adicionales PRIMERO
      if (detalles.descuentosAdicionales && detalles.descuentosAdicionales.length > 0) {
        const descuentosTexto = detalles.descuentosAdicionales.map((desc: any) => {
          const valorDesc = desc.tipo === 'porcentaje'
            ? (factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0))) * (desc.valor / 100)
            : desc.valor;
          return `${desc.concepto} (${desc.tipo === 'porcentaje' ? desc.valor + '%' : formatCurrency(desc.valor)}): -${formatCurrency(valorDesc)}`;
        }).join('  |  ');
        detallesText += descuentosTexto;
      }

      if (detalles.retencion > 0) {
        if (detallesText) detallesText += '  |  ';
        detallesText += `Retencion (${factura.monto_retencion}%): -${formatCurrency(detalles.retencion)}`;
      }

      if (detalles.prontoPago > 0) {
        if (detallesText) detallesText += '  |  ';
        detallesText += `Pronto Pago (${factura.porcentaje_pronto_pago}%): -${formatCurrency(detalles.prontoPago)}`;
      }

      if (detalles.totalDescuento > 0) {
        if (detallesText) detallesText += '  |  ';
        detallesText += `Total Descuento: -${formatCurrency(detalles.totalDescuento)}`;
      }

      // Agregar la fila de detalles si hay contenido
      if (detallesText) {
        rows.push([
          {
            content: detallesText,
            colSpan: 5,
            styles: { fontSize: 7, textColor: [107, 114, 128], fillColor: [249, 250, 251] }
          }
        ]);
      }

      return rows;
    }).flat();

    autoTable(doc, {
      startY: currentY,
      head: [[
        { content: 'N° Factura', styles: { halign: 'left' } },
        'Proveedor',
        'Tipo',
        { content: 'Total', styles: { halign: 'right' } },
        { content: 'A Pagar', styles: { halign: 'right' } }
      ]],
      body: tableData,
      theme: 'striped',
      styles: {
        fontSize: 8,
        cellPadding: 4,
        lineColor: [229, 231, 235],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 5
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251]
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 70 },
        2: { cellWidth: 22 },
        3: { cellWidth: 30 },
        4: { cellWidth: 32 }
      },
      margin: { left: 14, right: 14 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // ========== SALDOS A FAVOR APLICADOS ==========
    // Calcular total de saldos aplicados (desde selección o desde BD)
    let totalSaldosAplicados = 0;
    const saldosData: any[] = [];

    if (saldosAplicados && saldosAplicadosDesdeDB.length > 0) {
      // Usar los saldos aplicados desde la base de datos
      console.log('Usando saldos desde BD para PDF');

      // Agrupar por proveedor para evitar duplicados
      const saldosPorProveedor: {[key: string]: number} = {};

      saldosAplicadosDesdeDB.forEach((aplicacion: any) => {
        const saldo = aplicacion.saldos_favor;
        if (saldo) {
          const key = saldo.emisor_nit;
          if (!saldosPorProveedor[key]) {
            saldosPorProveedor[key] = 0;
          }
          saldosPorProveedor[key] += aplicacion.monto_aplicado;
        }
        totalSaldosAplicados += aplicacion.monto_aplicado;
      });

      // Crear las filas para la tabla
      Object.entries(saldosPorProveedor).forEach(([nit, monto]) => {
        const aplicacion = saldosAplicadosDesdeDB.find((a: any) => a.saldos_favor?.emisor_nit === nit);
        if (aplicacion && aplicacion.saldos_favor) {
          const saldo = aplicacion.saldos_favor;
          const origen = saldo.numero_factura_origen
            ? `${saldo.emisor_nombre} - Factura: ${saldo.numero_factura_origen}`
            : `${saldo.emisor_nombre} - ${saldo.motivo || 'Crédito'}`;
          saldosData.push([origen, `-${formatCurrency(monto)}`]);
        }
      });
    } else {
      // Usar los saldos seleccionados (antes de aplicar)
      console.log('Usando saldos seleccionados para PDF');
      totalSaldosAplicados = Object.values(saldosSeleccionados).reduce((sum, saldo) => sum + saldo.monto, 0);

      Object.entries(saldosSeleccionados).forEach(([saldoId, saldoInfo]) => {
        if (saldoInfo.monto > 0) {
          const saldo = saldosPorProveedor[saldoInfo.proveedorNit]?.find(s => s.id === saldoId);
          if (saldo) {
            const proveedor = facturas.find(f => f.emisor_nit === saldoInfo.proveedorNit);
            const origen = saldo.numero_factura_origen
              ? `${proveedor?.emisor_nombre} - Factura: ${saldo.numero_factura_origen}`
              : `${proveedor?.emisor_nombre} - ${saldo.motivo}`;
            saldosData.push([origen, `-${formatCurrency(saldoInfo.monto)}`]);
          }
        }
      });
    }

    if (totalSaldosAplicados > 0 && saldosData.length > 0) {
      doc.setFillColor(240, 253, 244); // Verde claro
      doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74); // Verde
      doc.text('✓ SALDOS A FAVOR APLICADOS', 18, currentY + 7);
      currentY += 15;

      autoTable(doc, {
        startY: currentY,
        body: saldosData,
        theme: 'plain',
        styles: {
          fontSize: 9,
          cellPadding: 3,
          textColor: [22, 163, 74]
        },
        columnStyles: {
          0: { cellWidth: 140, fontStyle: 'bold' },
          1: { cellWidth: 42, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;

      // Total de saldos aplicados
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text('Total Saldos Aplicados:', pageWidth - 100, currentY);
      doc.text(`-${formatCurrency(totalSaldosAplicados)}`, pageWidth - 14, currentY, { align: 'right' });

      currentY += 20;
    }

    // ========== DETALLES DEL PAGO ==========
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DETALLES DEL PAGO', 18, currentY + 7);
    currentY += 18;

    // Caja de detalles - ajustar altura según el tipo de pago
    const totalReal = calcularTotalReal();
    const esPagadoConSoloSaldos = totalSaldosAplicados > 0 && (totalReal - totalSaldosAplicados) < 1;
    const detalleBoxHeight = esPagadoConSoloSaldos
      ? 28
      : usarPagoPartido ? 45 + (metodosPago.length * 8) : 35;
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(14, currentY, pageWidth - 28, detalleBoxHeight, 3, 3, 'S');

    if (esPagadoConSoloSaldos) {
      // Pago cubierto completamente con saldos a favor
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Método de pago:', 20, currentY + 10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text('Pagado con Saldos a Favor', 70, currentY + 10);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Fecha de Pago:', 20, currentY + 20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      const [yearPdf, monthPdf, dayPdf] = fechaPago.split('-');
      const fechaCorrecta = new Date(parseInt(yearPdf), parseInt(monthPdf) - 1, parseInt(dayPdf), 12, 0, 0);
      doc.text(fechaCorrecta.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }), 70, currentY + 20);
    } else if (usarPagoPartido) {
      // Pago Partido
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Método de pago:', 20, currentY + 10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(59, 130, 246);
      doc.text('Pago Partido', 70, currentY + 10);

      currentY += 20;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Distribución:', 20, currentY);

      currentY += 6;
      metodosPago.forEach((mp) => {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(`• ${mp.metodo}:`, 25, currentY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(formatCurrency(mp.monto), 90, currentY, { align: 'left' });
        currentY += 7;
      });

      currentY += 3;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Fecha de Pago:', 20, currentY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      // Convertir fecha correctamente evitando problemas de zona horaria
      const [yearPdf, monthPdf, dayPdf] = fechaPago.split('-');
      const fechaCorrecta = new Date(parseInt(yearPdf), parseInt(monthPdf) - 1, parseInt(dayPdf), 12, 0, 0);
      doc.text(fechaCorrecta.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }), 70, currentY);
    } else {
      // Pago Normal
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Método de pago:', 20, currentY + 10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(metodoPago || 'Sin especificar', 70, currentY + 10);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Fecha de Pago:', 20, currentY + 22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      // Convertir fecha correctamente evitando problemas de zona horaria
      const [yearPdf2, monthPdf2, dayPdf2] = fechaPago.split('-');
      const fechaCorrecta2 = new Date(parseInt(yearPdf2), parseInt(monthPdf2) - 1, parseInt(dayPdf2), 12, 0, 0);
      doc.text(fechaCorrecta2.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }), 70, currentY + 22);
    }

    // ========== PIE DE PÁGINA ==========
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      // Línea superior del pie
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 280, pageWidth - 14, 280);

      // Texto del pie
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text(
        `Generado el ${new Date().toLocaleDateString('es-CO')} a las ${new Date().toLocaleTimeString('es-CO')}`,
        14,
        285
      );
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - 14,
        285,
        { align: 'right' }
      );
    }

    // Descargar PDF con nombre basado en proveedor
    const timestamp = new Date().getTime();
    let fileName: string;
    if (esProveedorUnico) {
      // Limpiar el nombre del proveedor para usar en archivo
      const nombreLimpio = proveedoresUnicos[0]
        .replace(/[^a-zA-Z0-9\s]/g, '') // Eliminar caracteres especiales
        .replace(/\s+/g, '_') // Reemplazar espacios con guiones bajos
        .substring(0, 40); // Limitar longitud
      fileName = `Pago_${nombreLimpio}_${timestamp}.pdf`;
    } else {
      fileName = `Pago_Multiple_${timestamp}_${facturas.length}_facturas.pdf`;
    }

    doc.save(fileName);

    // Guardar el PDF en Supabase Storage
    try {
      console.log('💾 Iniciando guardado de comprobante múltiple para', facturas.length, 'facturas');

      const pdfBlob = doc.output('blob');
      const storagePath = `comprobantes-pago/${fileName}`;

      console.log('📤 Subiendo PDF a storage:', storagePath);

      // Subir a Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('facturas-pdf')
        .upload(storagePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ Error al subir PDF:', uploadError);
        throw uploadError;
      }

      console.log('✅ PDF subido correctamente:', uploadData);

      // Calcular resumen de totales
      const totalOriginal = facturas.reduce((sum, f) => sum + f.total_a_pagar, 0);
      const totalPagado = facturas.reduce((sum, f) => {
        const detalles = calcularDetallesFactura(f);
        return sum + detalles.valorReal;
      }, 0);

      // Obtener user_id
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      console.log('👤 User ID:', userId);

      const facturasIds = facturas.map(f => f.id);
      console.log('📋 IDs de facturas:', facturasIds);

      // Convertir la fecha correctamente
      const [year, month, day] = fechaPago.split('-');
      const fechaPagoComprobante = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0).toISOString();

      // Preparar información de saldos aplicados
      const saldosAplicadosInfo = Object.entries(saldosSeleccionados)
        .filter(([_, saldoInfo]) => saldoInfo.monto > 0)
        .map(([saldoId, saldoInfo]) => {
          const saldo = saldosPorProveedor[saldoInfo.proveedorNit]?.find(s => s.id === saldoId);
          const proveedor = facturas.find(f => f.emisor_nit === saldoInfo.proveedorNit);
          return {
            saldo_id: saldoId,
            monto: saldoInfo.monto,
            proveedor_nit: saldoInfo.proveedorNit,
            proveedor_nombre: proveedor?.emisor_nombre || 'N/A',
            origen: saldo?.numero_factura_origen || saldo?.motivo || 'N/A'
          };
        });

      const totalSaldosInfo = calcularTotalSaldosAplicados();
      const totalFinalPagado = calcularTotalFinalAPagar();
      const esPagadoConSoloSaldos = totalSaldosInfo > 0 && totalFinalPagado < 1;
      const metodoPagoFinal = esPagadoConSoloSaldos
        ? 'Saldos a Favor'
        : usarPagoPartido ? 'Pago Partido' : metodoPago;

      const comprobanteData = {
        user_id: userId,
        tipo_comprobante: 'pago_multiple' as const,
        metodo_pago: metodoPagoFinal,
        fecha_pago: fechaPagoComprobante,
        total_pagado: totalPagado,
        cantidad_facturas: facturas.length,
        pdf_file_path: storagePath,
        facturas_ids: facturasIds,
        detalles: {
          proveedor_unico: esProveedorUnico ? proveedoresUnicos[0] : null,
          total_original: totalOriginal,
          pagos_partidos: usarPagoPartido ? metodosPago.filter(p => p.monto > 0) : null,
          saldos_aplicados: saldosAplicadosInfo.length > 0 ? saldosAplicadosInfo : null,
          total_saldos_aplicados: totalSaldosInfo,
          facturas: facturas.map(f => {
            const detalles = calcularDetallesFactura(f);
            return {
              id: f.id,
              numero: f.numero_factura,
              proveedor: f.emisor_nombre,
              total_original: f.total_a_pagar,
              total_pagado: detalles.valorReal,
              descuentos: detalles.totalDescuento
            };
          })
        }
      };

      console.log('📝 Datos del comprobante a insertar:', comprobanteData);

      // Registrar el comprobante en la base de datos
      const { data: insertData, error: dbError } = await supabase
        .from('comprobantes_pago')
        .insert(comprobanteData)
        .select();

      if (dbError) {
        console.error('❌ Error al insertar en BD:', dbError);
        throw dbError;
      }

      console.log('✅ Comprobante guardado en BD:', insertData);

      return fileName;
    } catch (error: any) {
      console.error('❌ Error al guardar PDF:', error);
      console.error('Error completo:', JSON.stringify(error, null, 2));
      throw error;
    }
  };

  // Función para generar PDF manualmente (botón de descarga)
  const generarPDF = async () => {
    // Validar que haya método de pago
    if (!usarPagoPartido && !metodoPago) {
      toast({
        title: "Error",
        description: "Selecciona un método de pago antes de generar el PDF",
        variant: "destructive"
      });
      return;
    }

    if (usarPagoPartido && !validarPagoPartido()) {
      toast({
        title: "Error en pago partido",
        description: "La suma de los métodos debe igualar el total a pagar",
        variant: "destructive"
      });
      return;
    }

    try {
      const fileName = await generarYGuardarComprobantePDF();
      toast({
        title: "PDF generado y guardado exitosamente",
        description: `Se descargó: ${fileName}`,
      });
    } catch (error: any) {
      toast({
        title: "PDF descargado",
        description: error?.message || "El PDF se descargó pero hubo un error al guardarlo en el sistema",
        variant: "destructive"
      });
    }
  };

  const handlePayment = async () => {
    // Calcular el total final después de aplicar saldos
    const totalFinal = calcularTotalFinalAPagar();
    const totalSaldos = calcularTotalSaldosAplicados();
    const esPagadoCompleto = totalFinal < 1;

    // Validar método de pago solo si queda saldo por pagar
    if (!esPagadoCompleto && !usarPagoPartido && !metodoPago) {
      toast({
        title: "Error",
        description: "Selecciona un método de pago",
        variant: "destructive"
      });
      return;
    }

    // Validar pago partido
    if (!esPagadoCompleto && usarPagoPartido && !validarPagoPartido()) {
      const totalMetodos = calcularTotalMetodosPago();
      toast({
        title: "Error en pago partido",
        description: `La suma de los métodos (${formatCurrency(totalMetodos)}) debe ser igual al monto restante (${formatCurrency(totalFinal)})`,
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      // PASO 1: Generar y guardar el comprobante PDF
      console.log('🎯 PASO 1: Generando y guardando comprobante PDF múltiple...');
      const pdfFileName = await generarYGuardarComprobantePDF();
      console.log('✅ PDF guardado:', pdfFileName);

      // PASO 2: Actualizar el estado de las facturas
      console.log('🎯 PASO 2: Actualizando estado de facturas...');

      // Convertir la fecha seleccionada a ISO string manteniendo la fecha correcta
      // Agregar la zona horaria local para evitar que se reste un día al convertir a UTC
      const [year, month, day] = fechaPago.split('-');
      const fechaPagoISO = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0).toISOString();

      // Si es pago partido, procesamos diferente
      if (usarPagoPartido) {
        // Actualizar todas las facturas sin método de pago específico
        const updatePromises = facturas.map(factura => {
          const detalles = calcularDetallesFactura(factura);
          return supabase
            .from('facturas')
            .update({
              estado_mercancia: 'pagada',
              metodo_pago: 'Pago Partido', // Marcador especial
              fecha_pago: fechaPagoISO,
              uso_pronto_pago: facturasConProntoPago.has(factura.id),
              valor_real_a_pagar: detalles.valorReal
            })
            .eq('id', factura.id);
        });

        const results = await Promise.all(updatePromises);

        // Verificar errores en actualización
        const errors = results.filter(result => result.error);
        if (errors.length > 0) {
          throw new Error(`Error al actualizar facturas`);
        }

        // Insertar registros de pago partido para CADA factura
        const pagoPartidoPromises = facturas.flatMap(factura =>
          metodosPago.map(mp =>
            supabase
              .from('pagos_partidos')
              .insert({
                factura_id: factura.id,
                metodo_pago: mp.metodo,
                monto: mp.monto / facturas.length, // Dividir proporcionalmente
                fecha_pago: fechaPagoISO
              })
          )
        );

        const pagoResults = await Promise.all(pagoPartidoPromises);

        // Verificar errores en inserción
        const pagoErrors = pagoResults.filter(result => result.error);
        if (pagoErrors.length > 0) {
          throw new Error(`Error al crear registros de pago partido`);
        }

      } else {
        // Pago normal (un solo método) - también guardarlo en pagos_partidos
        const updates = facturas.map(factura => {
          const detalles = calcularDetallesFactura(factura);
          return {
            id: factura.id,
            estado_mercancia: 'pagada',
            metodo_pago: metodoPago,
            fecha_pago: fechaPagoISO,
            uso_pronto_pago: facturasConProntoPago.has(factura.id),
            valor_real_a_pagar: detalles.valorReal
          };
        });

        const updatePromises = updates.map(update =>
          supabase
            .from('facturas')
            .update(update)
            .eq('id', update.id)
        );

        const results = await Promise.all(updatePromises);

        // Verificar si hubo errores en actualización de facturas
        const errors = results.filter(result => result.error);
        if (errors.length > 0) {
          throw new Error(`Error en ${errors.length} facturas`);
        }

        // Insertar registros en pagos_partidos para cada factura
        const pagoPartidoPromises = facturas.map(factura => {
          const detalles = calcularDetallesFactura(factura);
          return supabase
            .from('pagos_partidos')
            .insert({
              factura_id: factura.id,
              metodo_pago: metodoPago,
              monto: detalles.valorReal,
              fecha_pago: fechaPagoISO
            });
        });

        const pagoResults = await Promise.all(pagoPartidoPromises);

        // Verificar errores en inserción de pagos
        const pagoErrors = pagoResults.filter(result => result.error);
        if (pagoErrors.length > 0) {
          throw new Error(`Error al crear registros de pago en ${pagoErrors.length} facturas`);
        }
      }

      console.log('✅ Facturas actualizadas correctamente');

      toast({
        title: "✅ Pago múltiple procesado exitosamente",
        description: `Se procesaron ${facturas.length} facturas por un total de ${formatCurrency(calcularTotalReal())}. Comprobante: ${pdfFileName}`,
      });

      onPaymentProcessed();
      onClose();
    } catch (error: any) {
      console.error('❌ Error en el proceso de pago múltiple:', error);
      toast({
        title: "Error al procesar el pago múltiple",
        description: error?.message || "No se pudieron procesar todas las facturas. Inténtalo de nuevo.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Pago Múltiple - {facturas.length} Facturas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Resumen General */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Resumen del Pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Facturas</p>
                  <p className="text-2xl font-bold text-blue-600">{facturas.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Total Original</p>
                  <p className="text-lg font-semibold">{formatCurrency(calcularTotalOriginal())}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Total a Pagar</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(calcularTotalReal())}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Descuentos Factura</p>
                  <p className="text-lg font-semibold text-green-500">
                    {formatCurrency(calcularTotalOriginal() - calcularTotalReal())}
                  </p>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground">IVA Total</p>
                  <p className="font-semibold">{formatCurrency(calcularTotalIVA())}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Retenciones</p>
                  <p className="font-semibold text-orange-600">-{formatCurrency(calcularTotalRetenciones())}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Pronto Pago</p>
                  <p className="font-semibold text-green-600">-{formatCurrency(calcularTotalProntoPago())}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Facturas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Facturas Seleccionadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto space-y-3">
                {facturas.map((factura, index) => {
                  const detalles = calcularDetallesFactura(factura);

                  return (
                    <div key={factura.id} className="border rounded-lg p-3 bg-muted/30">
                      {/* Header de la factura */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">#{factura.numero_factura}</span>
                            <Badge variant="outline" className="text-xs">
                              {factura.clasificacion === 'mercancia' ? 'Mercancía' : 'Gasto'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {factura.emisor_nombre}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">
                            {formatCurrency(detalles.valorReal)}
                          </p>
                          {detalles.totalDescuento > 0 && (
                            <p className="text-xs text-muted-foreground line-through">
                              {formatCurrency(factura.total_a_pagar)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Detalles de descuentos y retenciones */}
                      {(detalles.retencion > 0 || factura.porcentaje_pronto_pago || detalles.descuentosAdicionales.length > 0) && (
                        <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                          {/* Descuentos adicionales */}
                          {detalles.descuentosAdicionales.length > 0 && (
                            <div className="bg-purple-50 dark:bg-purple-950/20 p-2 rounded space-y-1">
                              <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">Descuentos adicionales:</p>
                              {detalles.descuentosAdicionales.map((desc: any, idx: number) => {
                                const valorDesc = desc.tipo === 'porcentaje'
                                  ? (factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0))) * (desc.valor / 100)
                                  : desc.valor;
                                return (
                                  <div key={idx} className="flex items-center justify-between text-xs ml-2">
                                    <span className="text-purple-600 dark:text-purple-400">• {desc.concepto}:</span>
                                    <span className="font-medium text-purple-700 dark:text-purple-300">
                                      {desc.tipo === 'porcentaje' ? `${desc.valor}%` : ''} -{formatCurrency(valorDesc)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {detalles.retencion > 0 && (
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1 text-orange-600">
                                <TrendingDown className="w-3 h-3" />
                                <span>Retención ({factura.monto_retencion}%)</span>
                              </div>
                              <span className="font-medium text-orange-600">
                                -{formatCurrency(detalles.retencion)}
                              </span>
                            </div>
                          )}

                          {/* Checkbox para pronto pago */}
                          {factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0 && (
                            <div className="flex items-center justify-between text-xs bg-green-50 dark:bg-green-950/20 p-2 rounded">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={`pronto-pago-${factura.id}`}
                                  checked={detalles.aplicarProntoPago}
                                  onCheckedChange={() => toggleProntoPago(factura.id)}
                                />
                                <label
                                  htmlFor={`pronto-pago-${factura.id}`}
                                  className="flex items-center gap-1 text-green-700 dark:text-green-400 cursor-pointer"
                                >
                                  <Percent className="w-3 h-3" />
                                  <span>Aplicar Pronto Pago ({factura.porcentaje_pronto_pago}%)</span>
                                </label>
                              </div>
                              {detalles.prontoPago > 0 && (
                                <span className="font-medium text-green-700 dark:text-green-400">
                                  -{formatCurrency(detalles.prontoPago)}
                                </span>
                              )}
                            </div>
                          )}

                          {detalles.totalDescuento > 0 && (
                            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                              <span className="font-medium text-muted-foreground">Total Descuento:</span>
                              <span className="font-semibold text-green-600">
                                -{formatCurrency(detalles.totalDescuento)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Método de Pago y Fecha */}
          <Card>
            <CardHeader>
              <CardTitle>Detalles del Pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Saldos a Favor Disponibles */}
              {Object.keys(saldosPorProveedor).length > 0 && (
                <Card className="border-green-300 bg-green-50 dark:bg-green-950/20">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <Label className="text-base font-medium text-green-700 dark:text-green-400">
                        Saldos a Favor Disponibles
                      </Label>
                    </div>

                    {loadingSaldos ? (
                      <p className="text-sm text-muted-foreground">Cargando saldos...</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(saldosPorProveedor).map(([nit, saldos]) => {
                          const proveedor = facturas.find(f => f.emisor_nit === nit);
                          if (!proveedor) return null;

                          return (
                            <div key={nit} className="space-y-2">
                              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                                {proveedor.emisor_nombre}
                              </p>
                              {saldos.map((saldo) => (
                                <div key={saldo.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">
                                      {formatCurrency(saldo.saldo_disponible)} disponible
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {saldo.numero_factura_origen ? `Factura: ${saldo.numero_factura_origen}` : `Motivo: ${saldo.motivo}`}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="text"
                                      placeholder="0"
                                      value={saldosSeleccionados[saldo.id]?.monto ? new Intl.NumberFormat('es-CO').format(saldosSeleccionados[saldo.id].monto) : ''}
                                      onChange={(e) => {
                                        const value = e.target.value.replace(/[^0-9]/g, '');
                                        const montoNum = value ? parseInt(value) : 0;
                                        const montoMax = Math.min(saldo.saldo_disponible, calcularTotalReal() - calcularTotalSaldosAplicados() + (saldosSeleccionados[saldo.id]?.monto || 0));
                                        const montoFinal = Math.min(montoNum, montoMax);

                                        const nuevos = { ...saldosSeleccionados };
                                        if (montoFinal > 0) {
                                          nuevos[saldo.id] = { monto: montoFinal, proveedorNit: nit };
                                        } else {
                                          delete nuevos[saldo.id];
                                        }
                                        setSaldosSeleccionados(nuevos);
                                      }}
                                      disabled={saldosAplicados}
                                      className="w-32 text-sm"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const montoMax = Math.min(
                                          saldo.saldo_disponible,
                                          calcularTotalReal() - calcularTotalSaldosAplicados() + (saldosSeleccionados[saldo.id]?.monto || 0)
                                        );
                                        setSaldosSeleccionados({
                                          ...saldosSeleccionados,
                                          [saldo.id]: { monto: montoMax, proveedorNit: nit }
                                        });
                                      }}
                                      disabled={saldosAplicados}
                                    >
                                      Max
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}

                        {!saldosAplicados && calcularTotalSaldosAplicados() > 0 && (
                          <div className="space-y-2">
                            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded border border-green-300 mt-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                  Total saldos seleccionados:
                                </span>
                                <span className="text-sm font-bold text-green-700 dark:text-green-400">
                                  {formatCurrency(calcularTotalSaldosAplicados())}
                                </span>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-green-600 dark:text-green-500">
                                  Monto restante a pagar:
                                </span>
                                <span className="text-sm font-bold text-green-600 dark:text-green-500">
                                  {formatCurrency(calcularTotalFinalAPagar())}
                                </span>
                              </div>
                            </div>

                            {!saldosAplicados ? (
                              <Button
                                type="button"
                                onClick={aplicarSaldosAFavor}
                                disabled={aplicandoSaldos || calcularTotalSaldosAplicados() === 0}
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {aplicandoSaldos ? "Aplicando..." : "APLICAR SALDOS A FAVOR"}
                              </Button>
                            ) : (
                              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-300">
                                <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                                  <CheckCircle className="w-5 h-5" />
                                  <span className="text-sm font-semibold">Saldos aplicados exitosamente</span>
                                </div>
                                <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                                  El valor real a pagar se ha actualizado en la base de datos
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Toggle para Pago Partido - Solo si queda saldo por pagar */}
              {calcularTotalFinalAPagar() > 0 && (
                <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                <Checkbox
                  id="pago-partido"
                  checked={usarPagoPartido}
                  onCheckedChange={(checked) => {
                    setUsarPagoPartido(checked as boolean);
                    if (checked) {
                      setMetodoPago(''); // Limpiar método simple
                      setMetodosPago([{ metodo: '', monto: 0 }]); // Reset
                    }
                  }}
                />
                <label
                  htmlFor="pago-partido"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Usar pago partido (dividir entre varios métodos)
                </label>
                </div>
              )}

              {/* Método de Pago con Cards (Solo si NO es pago partido y queda saldo por pagar) */}
              {!usarPagoPartido && calcularTotalFinalAPagar() > 0 && (
                <div className="space-y-2">
                  <Label>Método de pago:</Label>
                  <div className="grid grid-cols-3 gap-3">
                  {/* Pago Banco */}
                  <button
                    type="button"
                    onClick={() => setMetodoPago('Pago Banco')}
                    className={`
                      relative flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all
                      ${metodoPago === 'Pago Banco'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'border-border bg-background hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/10'
                      }
                    `}
                  >
                    <Building2 className={`w-8 h-8 mb-2 ${metodoPago === 'Pago Banco' ? 'text-blue-600' : 'text-muted-foreground'}`} />
                    <span className={`text-sm font-medium ${metodoPago === 'Pago Banco' ? 'text-blue-700 dark:text-blue-400' : 'text-foreground'}`}>
                      Banco
                    </span>
                    {metodoPago === 'Pago Banco' && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle className="w-4 h-4 text-blue-600 fill-blue-600" />
                      </div>
                    )}
                  </button>

                  {/* Pago Tobías */}
                  <button
                    type="button"
                    onClick={() => setMetodoPago('Pago Tobías')}
                    className={`
                      relative flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all
                      ${metodoPago === 'Pago Tobías'
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                        : 'border-border bg-background hover:border-green-300 hover:bg-green-50/50 dark:hover:bg-green-950/10'
                      }
                    `}
                  >
                    <User className={`w-8 h-8 mb-2 ${metodoPago === 'Pago Tobías' ? 'text-green-600' : 'text-muted-foreground'}`} />
                    <span className={`text-sm font-medium ${metodoPago === 'Pago Tobías' ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>
                      Tobías
                    </span>
                    {metodoPago === 'Pago Tobías' && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle className="w-4 h-4 text-green-600 fill-green-600" />
                      </div>
                    )}
                  </button>

                  {/* Caja */}
                  <button
                    type="button"
                    onClick={() => setMetodoPago('Caja')}
                    className={`
                      relative flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all
                      ${metodoPago === 'Caja'
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
                        : 'border-border bg-background hover:border-orange-300 hover:bg-orange-50/50 dark:hover:bg-orange-950/10'
                      }
                    `}
                  >
                    <Wallet className={`w-8 h-8 mb-2 ${metodoPago === 'Caja' ? 'text-orange-600' : 'text-muted-foreground'}`} />
                    <span className={`text-sm font-medium ${metodoPago === 'Caja' ? 'text-orange-700 dark:text-orange-400' : 'text-foreground'}`}>
                      Caja
                    </span>
                    {metodoPago === 'Caja' && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle className="w-4 h-4 text-orange-600 fill-orange-600" />
                      </div>
                    )}
                  </button>
                </div>
                </div>
              )}

              {/* Interface para Pago Partido - Solo si queda saldo por pagar */}
              {usarPagoPartido && calcularTotalFinalAPagar() > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Métodos de Pago:</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={agregarMetodoPago}
                      className="h-8"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Agregar Método
                    </Button>
                  </div>

                  {/* Lista de métodos de pago */}
                  <div className="space-y-2">
                    {metodosPago.map((mp, index) => (
                      <div key={index} className="flex gap-2 items-start p-3 bg-muted/30 rounded-lg">
                        <div className="flex-1 space-y-2">
                          {/* Selector de método */}
                          <Select
                            value={mp.metodo}
                            onValueChange={(value) => actualizarMetodoPago(index, 'metodo', value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Seleccionar método" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pago Banco">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-blue-600" />
                                  <span>Banco</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="Pago Tobías">
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-green-600" />
                                  <span>Tobías</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="Caja">
                                <div className="flex items-center gap-2">
                                  <Wallet className="w-4 h-4 text-orange-600" />
                                  <span>Caja</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          {/* Input de monto */}
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                              type="text"
                              placeholder="0"
                              value={mp.monto > 0 ? new Intl.NumberFormat('es-CO').format(mp.monto) : ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '');
                                actualizarMetodoPago(index, 'monto', value ? parseInt(value) : 0);
                              }}
                              className="pl-8"
                            />
                          </div>
                        </div>

                        {/* Botón eliminar */}
                        {metodosPago.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => eliminarMetodoPago(index)}
                            className="h-10 w-10 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Indicador de progreso */}
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total ingresado:</span>
                      <span className={`font-semibold ${
                        Math.abs(calcularTotalMetodosPago() - calcularTotalReal()) < 1
                          ? 'text-green-600'
                          : 'text-orange-600'
                      }`}>
                        {formatCurrency(calcularTotalMetodosPago())}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total a pagar:</span>
                      <span className="font-semibold">{formatCurrency(calcularTotalReal())}</span>
                    </div>
                    {Math.abs(calcularTotalMetodosPago() - calcularTotalReal()) >= 1 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Diferencia:</span>
                        <span className="font-semibold text-destructive">
                          {formatCurrency(Math.abs(calcularTotalMetodosPago() - calcularTotalReal()))}
                        </span>
                      </div>
                    )}
                    {Math.abs(calcularTotalMetodosPago() - calcularTotalReal()) < 1 && (
                      <div className="flex items-center gap-1 text-sm text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span>Los montos coinciden correctamente</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fecha de Pago */}
              <div className="space-y-2">
                <Label htmlFor="fecha-pago" className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  Fecha de Pago
                </Label>
                <Input
                  id="fecha-pago"
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </CardContent>
          </Card>

          {/* Botones */}
          <div className="flex flex-col gap-3">
            {/* Botón para generar PDF */}
            <Button
              variant="outline"
              onClick={generarPDF}
              className="w-full border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20"
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar Soporte PDF
            </Button>

            {/* Botones de acción */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isProcessing}
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
              <Button
                onClick={handlePayment}
                className="flex-1"
                disabled={
                  isProcessing ||
                  (usarPagoPartido ? !validarPagoPartido() : !metodoPago)
                }
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Pagar {formatCurrency(calcularTotalReal())}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}