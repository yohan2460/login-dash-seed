import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CreditCard, Building2, Percent, Banknote, Calendar, Download, Plus, Trash2, User, Wallet, CheckCircle, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calcularValorRealAPagar, obtenerBaseSinIVAOriginal, obtenerBaseSinIVADespuesNotasCredito } from '@/utils/calcularValorReal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  pdf_file_path: string | null;
  clasificacion?: string | null;
  created_at: string;
  factura_iva?: number | null;
  factura_iva_porcentaje?: number | null;
  descripcion?: string | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  numero_serie?: string | null;
  estado_mercancia?: string | null;
  fecha_pago?: string | null;
  valor_real_a_pagar?: number | null;
  descuentos_antes_iva?: string | null;
  total_sin_iva?: number | null;
  notas?: string | null;
  estado_nota_credito?: 'pendiente' | 'aplicada' | 'anulada' | null;
  valor_nota_credito?: number | null;
  factura_original_id?: string | null;
  total_con_descuento?: number | null;
}

interface PaymentMethodDialogProps {
  factura: Factura | null;
  isOpen: boolean;
  onClose: () => void;
  onPaymentProcessed: () => void;
}

interface MetodoPagoPartido {
  metodo: string;
  monto: number;
}

type MedioPago = 'Pago Banco' | 'Pago Tobías' | 'Caja';

interface SaldoFavor {
  id: string;
  monto_inicial: number;
  saldo_disponible: number;
  motivo: string;
  numero_factura_origen: string | null;
  fecha_generacion: string;
  medio_pago: MedioPago;
}

export function PaymentMethodDialog({ factura, isOpen, onClose, onPaymentProcessed }: PaymentMethodDialogProps) {
  const [processing, setProcessing] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [usedProntoPago, setUsedProntoPago] = useState<string>('');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Estados para pagos partidos
  const [usarPagoPartido, setUsarPagoPartido] = useState(false);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoPartido[]>([
    { metodo: '', monto: 0 }
  ]);

  // Estados para saldos a favor
  const [saldosDisponibles, setSaldosDisponibles] = useState<SaldoFavor[]>([]);
  const [saldosSeleccionados, setSaldosSeleccionados] = useState<{[key: string]: number}>({});
  const [loadingSaldos, setLoadingSaldos] = useState(false);
  const [saldosAplicados, setSaldosAplicados] = useState(false);
  const [aplicandoSaldos, setAplicandoSaldos] = useState(false);
  const [soporteFile, setSoporteFile] = useState<File | null>(null);
  const soporteInputRef = useRef<HTMLInputElement | null>(null);

  const { toast } = useToast();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const obtenerNotasCreditoAplicadas = (facturaActual: Factura | null) => {
    if (!facturaActual?.notas) {
      console.log('📝 No hay campo notas en la factura');
      return { notasCredito: [] as { numero: string; valor: number; fecha?: string | null }[], totalNotasCredito: 0 };
    }

    try {
      const notasData = JSON.parse(facturaActual.notas);
      console.log('📝 Datos de notas parseados:', notasData);
      console.log('📝 Keys:', Object.keys(notasData));
      console.log('📝 notas_credito value:', notasData?.notas_credito);
      console.log('📝 ¿Es array?:', Array.isArray(notasData?.notas_credito));

      if (Array.isArray(notasData?.notas_credito) && notasData.notas_credito.length > 0) {
        console.log('✅ Encontradas notas de crédito:', notasData.notas_credito);
        const notasCredito = notasData.notas_credito
          .filter((nc: any) => nc)
          .map((nc: any) => ({
            numero: nc.numero_factura || notasData.numero_factura_aplicada || 'Nota Crédito',
            valor: nc.valor_descuento ?? nc.valor_aplicado ?? 0,
            fecha: nc.fecha_aplicacion || notasData.fecha_aplicacion || null
          }));
        const totalNotasCredito = notasCredito.reduce((sum, nc) => sum + (nc.valor || 0), 0);
        console.log('✅ Notas de crédito procesadas:', notasCredito, 'Total:', totalNotasCredito);
        return { notasCredito, totalNotasCredito };
      } else {
        console.log('⚠️ No se encontró array notas_credito o está vacío');
      }
    } catch (error) {
      console.error('❌ Error parsing notas de crédito:', error);
    }

    return { notasCredito: [] as { numero: string; valor: number; fecha?: string | null }[], totalNotasCredito: 0 };
  };

  const obtenerValoresOriginales = (facturaActual: Factura | null) => {
    if (!facturaActual?.notas) {
      return {
        totalOriginal: null as number | null,
        ivaOriginal: null as number | null,
        totalSinIvaOriginal: null as number | null
      };
    }

    try {
      const notasData = JSON.parse(facturaActual.notas);
      return {
        totalOriginal: notasData.total_original ?? null,
        ivaOriginal: notasData.iva_original ?? null,
        totalSinIvaOriginal: notasData.total_sin_iva_original ?? null
      };
    } catch (error) {
      console.error('Error parsing valores originales:', error);
      return {
        totalOriginal: null,
        ivaOriginal: null,
        totalSinIvaOriginal: null
      };
    }
  };

  // Obtener valor real disponible - SIEMPRE recalcular para incluir descuentos
  const obtenerValorRealDisponible = (factura: Factura) => {
    // Si los saldos ya fueron aplicados, usar el valor_real_a_pagar de la base de datos
    if (saldosAplicados && factura.valor_real_a_pagar !== null && factura.valor_real_a_pagar !== undefined) {
      return factura.valor_real_a_pagar;
    }

    // IMPORTANTE: Siempre recalcular para asegurar que los descuentos estén incluidos
    // La función calcularValorRealAPagar maneja: descuentos + retención + pronto pago
    return calcularValorRealAPagar(factura);
  };

  // Obtener valor final basado en la selección del usuario
  const obtenerValorFinal = (factura: Factura) => {
    // Si los saldos ya fueron aplicados, usar el valor de la BD directamente
    if (saldosAplicados && factura.valor_real_a_pagar !== null && factura.valor_real_a_pagar !== undefined) {
      return factura.valor_real_a_pagar;
    }

    // Si el usuario no ha seleccionado aún, usar el valor de la BD
    if (!usedProntoPago) {
      return obtenerValorRealDisponible(factura);
    }

    // Si el usuario seleccionó "Sí, con descuento", usar el valor real a pagar (que ya incluye descuento)
    if (usedProntoPago === 'yes') {
      return obtenerValorRealDisponible(factura);
    }

    // Si el usuario seleccionó "No, sin descuento", recalcular SIN el descuento de pronto pago
    if (usedProntoPago === 'no') {
      // Calcular dinámicamente sin el descuento de pronto pago
      const facturaParaCalculo = {
        ...factura,
        porcentaje_pronto_pago: null // Anular el pronto pago
      };

      return calcularValorRealAPagar(facturaParaCalculo);
    }

    return obtenerValorRealDisponible(factura);
  };

  // Cargar saldos a favor disponibles para el proveedor
  useEffect(() => {
    if (factura && isOpen) {
      fetchSaldosDisponibles();
    }
  }, [factura, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSoporteFile(null);
      if (soporteInputRef.current) {
        soporteInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const fetchSaldosDisponibles = async () => {
    if (!factura) return;
    setLoadingSaldos(true);
    try {
      const { data, error } = await supabase
        .from('saldos_favor')
        .select('*')
        .eq('emisor_nit', factura.emisor_nit)
        .eq('estado', 'activo')
        .gt('saldo_disponible', 0)
        .order('fecha_generacion', { ascending: true });

      if (error) throw error;
      setSaldosDisponibles(data || []);
    } catch (error) {
      console.error('Error al cargar saldos a favor:', error);
    } finally {
      setLoadingSaldos(false);
    }
  };

  // Calcular total de saldos aplicados
  const calcularTotalSaldosAplicados = (): number => {
    return Object.values(saldosSeleccionados).reduce((sum, monto) => sum + monto, 0);
  };

  const sanitizeFileName = (name: string) => {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9.-]+/g, '_')
      .toLowerCase();
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
  };

  const handleSoporteChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSoporteFile(null);
      return;
    }

    const maxSizeBytes = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSizeBytes) {
      toast({
        title: 'Archivo demasiado grande',
        description: 'El soporte no puede superar los 10 MB.',
        variant: 'destructive'
      });
      if (soporteInputRef.current) {
        soporteInputRef.current.value = '';
      }
      return;
    }

    setSoporteFile(file);
  };

  const handleRemoveSoporte = () => {
    setSoporteFile(null);
    if (soporteInputRef.current) {
      soporteInputRef.current.value = '';
    }
  };

  // Aplicar saldos a favor a la factura
  const aplicarSaldosAFavor = async () => {
    if (!factura) return;

    const totalSaldos = calcularTotalSaldosAplicados();
    if (totalSaldos === 0) {
      toast({
        title: "No hay saldos seleccionados",
        description: "Selecciona al menos un saldo a favor para aplicar",
        variant: "destructive"
      });
      return;
    }

    const valorTotal = obtenerValorFinal(factura);
    if (totalSaldos > valorTotal) {
      toast({
        title: "Saldos exceden el total",
        description: `Los saldos aplicados (${formatCurrency(totalSaldos)}) no pueden ser mayores al total a pagar (${formatCurrency(valorTotal)})`,
        variant: "destructive"
      });
      return;
    }

    setAplicandoSaldos(true);
    try {
      const fechaSaldoAplicacion = (() => {
        if (!paymentDate) return new Date().toISOString();
        const [y, m, d] = paymentDate.split('-').map(Number);
        if ([y, m, d].some(val => Number.isNaN(val))) {
          return new Date().toISOString();
        }
        return new Date(y, m - 1, d, 12, 0, 0).toISOString();
      })();

      // Aplicar cada saldo a favor usando la función de la base de datos
      for (const [saldoId, montoAplicado] of Object.entries(saldosSeleccionados)) {
        if (montoAplicado > 0) {
          const saldoInfo = saldosDisponibles.find((saldo) => saldo.id === saldoId);

          const { error: saldoError } = await supabase.rpc('aplicar_saldo_favor', {
            p_saldo_favor_id: saldoId,
            p_factura_destino_id: factura.id,
            p_monto_aplicado: montoAplicado
          });

          if (saldoError) {
            throw new Error(`Error al aplicar saldo a favor: ${saldoError.message}`);
          }

          const medioPago = saldoInfo?.medio_pago ?? 'Pago Banco';
          const { error: saldoPagoError } = await supabase
            .from('pagos_partidos')
            .insert({
              factura_id: factura.id,
              metodo_pago: medioPago,
              monto: montoAplicado,
              fecha_pago: fechaSaldoAplicacion
            });

          if (saldoPagoError) {
            throw saldoPagoError;
          }
        }
      }

      // Actualizar valor_real_a_pagar en la factura
      const nuevoValorReal = valorTotal - totalSaldos;
      const { error: updateError } = await supabase
        .from('facturas')
        .update({
          valor_real_a_pagar: nuevoValorReal
        })
        .eq('id', factura.id);

      if (updateError) throw updateError;

      setSaldosAplicados(true);
      setSaldosSeleccionados({});

      // Recargar los datos de la factura desde la BD para obtener el valor actualizado
      const { data: facturaActualizada, error: fetchError } = await supabase
        .from('facturas')
        .select('*')
        .eq('id', factura.id)
        .single();

      if (fetchError) {
        console.error('Error al recargar factura:', fetchError);
      } else if (facturaActualizada) {
        // Actualizar el objeto factura en memoria con los nuevos datos
        Object.assign(factura, facturaActualizada);
      }

      toast({
        title: "✅ Saldos aplicados exitosamente",
        description: `Se aplicaron ${formatCurrency(totalSaldos)} en saldos a favor. Nuevo valor real a pagar: ${formatCurrency(nuevoValorReal)}`,
      });

      await fetchSaldosDisponibles();

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

  // Actualizar automáticamente el monto pagado cuando cambie el pronto pago o saldos
  useEffect(() => {
    if (factura) {
      const valorReal = obtenerValorFinal(factura);

      // Si los saldos ya fueron aplicados, el valorReal YA incluye la reducción de saldos
      // Por lo tanto, NO debemos restar los saldos nuevamente
      let montoAPagar;
      if (saldosAplicados) {
        // Los saldos ya están aplicados en la BD, usar el valor directamente
        montoAPagar = valorReal;
      } else {
        // Los saldos NO están aplicados, restarlos del valor real
        const totalSaldos = calcularTotalSaldosAplicados();
        montoAPagar = Math.max(0, valorReal - totalSaldos);
      }

      setAmountPaid(new Intl.NumberFormat('es-CO').format(montoAPagar));
    }
  }, [usedProntoPago, factura, saldosSeleccionados, saldosAplicados]);

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
      const montoStr = valor.toString().replace(/[^0-9.]/g, '');
      nuevosMetodos[index].monto = montoStr ? parseFloat(montoStr) : 0;
    }
    setMetodosPago(nuevosMetodos);
  };

  const calcularTotalMetodosPago = (): number => {
    return metodosPago.reduce((total, mp) => total + (mp.monto || 0), 0);
  };

  const validarPagoPartido = (): boolean => {
    if (!usarPagoPartido || !factura) return true;

    const totalReal = obtenerValorFinal(factura);
    const totalMetodos = calcularTotalMetodosPago();

    const todosCompletos = metodosPago.every(mp => mp.metodo && mp.monto > 0);
    const sumaCorrecta = Math.abs(totalMetodos - totalReal) < 1;

    return todosCompletos && sumaCorrecta;
  };

  // Función para generar PDF manualmente (botón de descarga)
  const generarPDF = async () => {
    if (!factura) return;

    // Validar que haya método de pago
    if (!usarPagoPartido && !selectedPaymentMethod) {
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

  // Función auxiliar para generar y guardar el PDF del comprobante
  const generarYGuardarComprobantePDF = async () => {
    if (!factura) return null;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const topMargin = 20;
    const bottomMargin = 30;
    let currentY = 15;
    const timestamp = Date.now();
    let soportePagoPath: string | null = null;

    const ensureSpace = (height: number) => {
      if (currentY + height > pageHeight - bottomMargin) {
        doc.addPage();
        currentY = topMargin;
      }
    };

    // Si los saldos fueron aplicados, obtener las aplicaciones desde la BD
    let saldosAplicadosDesdeDB: any[] = [];
    if (saldosAplicados) {
      try {
        const { data: aplicaciones, error } = await supabase
        .from('aplicaciones_saldo')
        .select(`
          *,
          saldos_favor (
            emisor_nombre,
            emisor_nit,
            numero_factura_origen,
            motivo,
            medio_pago
          )
        `)
          .eq('factura_destino_id', factura.id);

        if (!error && aplicaciones) {
          saldosAplicadosDesdeDB = aplicaciones;
          console.log('Saldos aplicados desde BD:', saldosAplicadosDesdeDB);
        }
      } catch (error) {
        console.error('Error al cargar saldos aplicados:', error);
      }
    }

    // Calcular valores
    const valoresOriginales = obtenerValoresOriginales(factura);
    const totalOriginalDisplay = valoresOriginales.totalOriginal ?? factura.total_a_pagar;
    const totalSinIvaAjustado = obtenerBaseSinIVADespuesNotasCredito(factura);
    const totalSinIvaOriginal = valoresOriginales.totalSinIvaOriginal ?? obtenerBaseSinIVAOriginal(factura);
    const retencion = factura.tiene_retencion && factura.monto_retencion
      ? totalSinIvaAjustado * ((factura.monto_retencion || 0) / 100)
      : 0;
    const valorFinal = obtenerValorFinal(factura);

    // Para pago partido, siempre aplicar pronto pago si está disponible
    // Para pago normal, respetar la decisión del usuario
    const aplicarProntoPago = usarPagoPartido
      ? factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0
      : usedProntoPago === 'yes' && factura.porcentaje_pronto_pago;

    const prontoPago = aplicarProntoPago
      ? totalSinIvaOriginal * ((factura.porcentaje_pronto_pago || 0) / 100)
      : 0;
    const totalDescuentosResumen = Math.max(0, totalOriginalDisplay - valorFinal);

    // Calcular descuentos adicionales antes de IVA
    let descuentosAdicionales: any[] = [];
    let totalDescuentosAdicionales = 0;
    if (factura.descuentos_antes_iva) {
      try {
        descuentosAdicionales = JSON.parse(factura.descuentos_antes_iva);
        totalDescuentosAdicionales = descuentosAdicionales.reduce((sum, desc) => {
          if (desc.tipo === 'porcentaje') {
            return sum + (totalSinIvaOriginal * desc.valor / 100);
          }
          return sum + desc.valor;
        }, 0);
      } catch (error) {
        console.error('Error parsing descuentos_antes_iva:', error);
      }
    }
    const { notasCredito, totalNotasCredito } = obtenerNotasCreditoAplicadas(factura);

    // ========== ENCABEZADO ==========
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageWidth, 45, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    const nombreProveedor = factura.emisor_nombre.length > 35
      ? factura.emisor_nombre.substring(0, 32) + '...'
      : factura.emisor_nombre;
    doc.text(`PAGO - ${nombreProveedor}`, pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Factura #${factura.numero_factura}`, pageWidth / 2, 28, { align: 'center' });

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(pageWidth / 2 - 30, 32, pageWidth / 2 + 30, 32);

    currentY = 50;

    // ========== RESUMEN DEL PAGO ==========
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DEL PAGO', 18, currentY + 7);
    currentY += 15;

    // Caja del resumen
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, currentY, pageWidth - 28, 60, 3, 3, 'S');

    // Primera fila
    const colWidth = (pageWidth - 28) / 3;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Total Original', 14 + colWidth / 2, currentY + 8, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(formatCurrency(totalOriginalDisplay), 14 + colWidth / 2, currentY + 18, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Total a Pagar', 14 + colWidth * 1.5, currentY + 8, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94);
    doc.text(formatCurrency(valorFinal), 14 + colWidth * 1.5, currentY + 18, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Descuentos', 14 + colWidth * 2.5, currentY + 8, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94);
    doc.text(formatCurrency(totalDescuentosResumen), 14 + colWidth * 2.5, currentY + 18, { align: 'center' });

    // Línea separadora
    currentY += 28;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(18, currentY, pageWidth - 18, currentY);
    currentY += 2;

    // Segunda fila
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('IVA Total', 14 + colWidth / 2, currentY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(formatCurrency(factura.factura_iva || 0), 14 + colWidth / 2, currentY + 16, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Retenciones', 14 + colWidth * 1.5, currentY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 115, 22);
    doc.text(`-${formatCurrency(retencion)}`, 14 + colWidth * 1.5, currentY + 16, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Pronto Pago', 14 + colWidth * 2.5, currentY + 8, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94);
    doc.text(`-${formatCurrency(prontoPago)}`, 14 + colWidth * 2.5, currentY + 16, { align: 'center' });

    currentY += 36;

    // ========== DETALLES DE LA FACTURA ==========
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DETALLES DE LA FACTURA', 18, currentY + 7);
    currentY += 15;

    // Tabla de detalles
    const tableData: any[] = [];

    tableData.push(['N° Factura', factura.numero_factura]);
    tableData.push(['Proveedor', factura.emisor_nombre]);
    tableData.push(['NIT', factura.emisor_nit]);
    tableData.push(['Clasificacion', factura.clasificacion === 'mercancia' ? 'Mercancia' : 'Gasto']);

    if (retencion > 0) {
      tableData.push([`Retencion (${factura.monto_retencion}%)`, `-${formatCurrency(retencion)}`]);
    }

    if (prontoPago > 0) {
      tableData.push([`Pronto Pago (${factura.porcentaje_pronto_pago}%)`, `-${formatCurrency(prontoPago)}`]);
    }

    // Agregar descuentos adicionales si existen
    if (descuentosAdicionales.length > 0) {
      descuentosAdicionales.forEach((desc) => {
        const valorDescuento = desc.tipo === 'porcentaje'
          ? totalSinIvaOriginal * (desc.valor / 100)
          : desc.valor;
        const textoDescuento = desc.tipo === 'porcentaje'
          ? `${desc.concepto} (${desc.valor}%)`
          : desc.concepto;
        tableData.push([textoDescuento, `-${formatCurrency(valorDescuento)}`]);
      });
    }

    if (notasCredito.length > 0) {
      notasCredito.forEach((nc) => {
        const etiqueta = nc.numero ? `Nota Crédito ${nc.numero}` : 'Nota Crédito';
        tableData.push([etiqueta, `-${formatCurrency(nc.valor || 0)}`]);
      });
    }

    autoTable(doc, {
      startY: currentY,
      body: tableData,
      theme: 'striped',
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold', fillColor: [245, 247, 250] },
        1: { cellWidth: 112 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // ========== SALDOS A FAVOR APLICADOS ==========
    // Calcular total de saldos aplicados (desde selección o desde BD)
    let totalSaldosAplicados = 0;
    const saldosData: any[] = [];

    if (saldosAplicados && saldosAplicadosDesdeDB.length > 0) {
      // Usar los saldos aplicados desde la base de datos
      console.log('Usando saldos desde BD para PDF');

      saldosAplicadosDesdeDB.forEach((aplicacion: any) => {
        const saldo = aplicacion.saldos_favor;
        if (saldo) {
          const medio = aplicacion.medio_pago || saldo.medio_pago || 'Pago Banco';
          const origen = saldo.numero_factura_origen
            ? `Factura: ${saldo.numero_factura_origen} · ${medio}`
            : `Motivo: ${saldo.motivo || 'Crédito'} · ${medio}`;
          saldosData.push([origen, `-${formatCurrency(aplicacion.monto_aplicado)}`]);
          totalSaldosAplicados += aplicacion.monto_aplicado;
        }
      });
    } else {
      // Usar los saldos seleccionados (antes de aplicar)
      console.log('Usando saldos seleccionados para PDF');
      totalSaldosAplicados = calcularTotalSaldosAplicados();

      Object.entries(saldosSeleccionados).forEach(([saldoId, monto]) => {
        const saldo = saldosDisponibles.find(s => s.id === saldoId);
        if (saldo && monto > 0) {
          const origen = saldo.numero_factura_origen
            ? `Factura: ${saldo.numero_factura_origen} · ${saldo.medio_pago}`
            : `Motivo: ${saldo.motivo} · ${saldo.medio_pago}`;
          saldosData.push([origen, `-${formatCurrency(monto)}`]);
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
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;

      // Total de saldos aplicados
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text('Total Saldos Aplicados:', pageWidth - 100, currentY);
      doc.text(`-${formatCurrency(totalSaldosAplicados)}`, pageWidth - 14, currentY, { align: 'right' });

      currentY += 15;
    }

    if (notasCredito.length > 0) {
      ensureSpace(20 + notasCredito.length * 8);
      doc.setFillColor(255, 247, 237); // Naranja claro
      doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(249, 115, 22);
      doc.text('NOTAS DE CRÉDITO APLICADAS', 18, currentY + 7);
      currentY += 15;

      autoTable(doc, {
        startY: currentY,
        body: notasCredito.map((nc) => [
          nc.numero || 'Nota Crédito',
          `-${formatCurrency(nc.valor || 0)}`
        ]),
        theme: 'plain',
        styles: {
          fontSize: 9,
          cellPadding: 3,
          textColor: [249, 115, 22]
        },
        columnStyles: {
          0: { cellWidth: 100, fontStyle: 'bold' },
          1: { cellWidth: 60, halign: 'right', fontStyle: 'bold' }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(249, 115, 22);
      doc.text('Total Notas Crédito Aplicadas:', pageWidth - 110, currentY);
      doc.text(`-${formatCurrency(totalNotasCredito)}`, pageWidth - 14, currentY, { align: 'right' });

      currentY += 15;
    }

    // ========== DETALLES DEL PAGO ==========
    const valorFinalDisponible = valorFinal;
    const esPagadoConSoloSaldos = totalSaldosAplicados > 0 && valorFinalDisponible - totalSaldosAplicados < 1;
    const detalleBoxHeight = esPagadoConSoloSaldos
      ? 20
      : usarPagoPartido ? 35 + (metodosPago.length * 8) : 25;

    ensureSpace(15 + detalleBoxHeight);

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DETALLES DEL PAGO', 18, currentY + 7);
    currentY += 15;

    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(14, currentY, pageWidth - 28, detalleBoxHeight, 3, 3, 'S');

    if (esPagadoConSoloSaldos) {
      // Pago cubierto completamente con saldos a favor
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Método de pago:', 20, currentY + 8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text('Pagado con Saldos a Favor', 60, currentY + 8);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Fecha de Pago:', 20, currentY + 14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      const [yearPdf, monthPdf, dayPdf] = paymentDate.split('-');
      const fechaCorrecta = new Date(parseInt(yearPdf), parseInt(monthPdf) - 1, parseInt(dayPdf), 12, 0, 0);
      doc.text(fechaCorrecta.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }), 60, currentY + 14);
    } else if (usarPagoPartido) {
      // Pago Partido
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Metodo de pago:', 20, currentY + 8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(59, 130, 246);
      doc.text('Pago Partido', 60, currentY + 8);

      currentY += 18;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Distribución:', 20, currentY);

      currentY += 5;
      metodosPago.forEach((mp) => {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(`${mp.metodo}:`, 25, currentY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(formatCurrency(mp.monto), 80, currentY, { align: 'left' });
        currentY += 6;
      });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Fecha de Pago:', 20, currentY + 5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      // Convertir fecha correctamente evitando problemas de zona horaria
      const [yearPdf, monthPdf, dayPdf] = paymentDate.split('-');
      const fechaCorrecta = new Date(parseInt(yearPdf), parseInt(monthPdf) - 1, parseInt(dayPdf), 12, 0, 0);
      doc.text(fechaCorrecta.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }), 60, currentY + 5);
    } else {
      // Pago Normal
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Metodo de pago:', 20, currentY + 8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(selectedPaymentMethod, 60, currentY + 8);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Fecha de Pago:', 20, currentY + 16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      // Convertir fecha correctamente evitando problemas de zona horaria
      const [yearPdf2, monthPdf2, dayPdf2] = paymentDate.split('-');
      const fechaCorrecta2 = new Date(parseInt(yearPdf2), parseInt(monthPdf2) - 1, parseInt(dayPdf2), 12, 0, 0);
      doc.text(fechaCorrecta2.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }), 60, currentY + 16);
    }

    // Pie de página
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(14, 280, pageWidth - 14, 280);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(
      `Generado el ${new Date().toLocaleDateString('es-CO')} a las ${new Date().toLocaleTimeString('es-CO')}`,
      14,
      285
    );

    // Nombre del archivo
    const nombreLimpio = factura.emisor_nombre
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 40);
    const fileName = `Pago_${nombreLimpio}_${factura.numero_factura}_${timestamp}.pdf`;

    // Descargar el PDF
    doc.save(fileName);

    // Guardar el PDF en Supabase Storage
    try {
      console.log('💾 Iniciando guardado de comprobante para factura:', factura.id);

      if (soporteFile) {
        const soporteFileName = sanitizeFileName(soporteFile.name);
        const soporteStoragePath = `soportes-pago/${timestamp}_${soporteFileName}`;

        const { data: soporteUploadData, error: soporteUploadError } = await supabase.storage
          .from('facturas-pdf')
          .upload(soporteStoragePath, soporteFile, {
            contentType: soporteFile.type || 'application/octet-stream',
            upsert: false
          });

        if (soporteUploadError) {
          throw soporteUploadError;
        }

        soportePagoPath = soporteUploadData?.path || soporteStoragePath;
      }

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

      // Obtener user_id
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      console.log('👤 User ID:', userId);

      // Convertir la fecha correctamente
      const [year, month, day] = paymentDate.split('-');
      const fechaPagoComprobante = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0).toISOString();

      // Preparar información de saldos aplicados
      const saldosAplicadosInfo =
        saldosAplicados && saldosAplicadosDesdeDB.length > 0
          ? saldosAplicadosDesdeDB.map((aplicacion: any) => ({
              saldo_id: aplicacion.saldo_favor_id,
              monto: aplicacion.monto_aplicado,
              origen:
                aplicacion.saldos_favor?.numero_factura_origen ||
                aplicacion.saldos_favor?.motivo ||
                'N/A',
              medio_pago: aplicacion.medio_pago || aplicacion.saldos_favor?.medio_pago || null
            }))
          : Object.entries(saldosSeleccionados)
              .filter(([_, monto]) => monto > 0)
              .map(([saldoId, monto]) => {
                const saldo = saldosDisponibles.find(s => s.id === saldoId);
                return {
                  saldo_id: saldoId,
                  monto,
                  origen: saldo?.numero_factura_origen || saldo?.motivo || 'N/A',
                  medio_pago: saldo?.medio_pago || null
                };
              });

      const totalSaldosInfo = saldosAplicadosInfo.reduce((sum, info) => sum + (info.monto || 0), 0);
      const metodoPagoFinal = esPagadoConSoloSaldos
        ? (() => {
            const medios = Array.from(
              new Set<string>(
                saldosAplicadosInfo
                  .map(info => info.medio_pago)
                  .filter((medio): medio is string => Boolean(medio))
              )
            );
            if (medios.length === 1) {
              return medios[0];
            }
            if (medios.length > 1) {
              return 'Pago Partido';
            }
            return 'Pago Banco';
          })()
        : usarPagoPartido ? 'Pago Partido' : selectedPaymentMethod;

      const comprobanteData = {
        user_id: userId,
        tipo_comprobante: 'pago_individual' as const,
        metodo_pago: metodoPagoFinal,
        fecha_pago: fechaPagoComprobante,
        total_pagado: valorFinal,
        cantidad_facturas: 1,
        pdf_file_path: storagePath,
        soporte_pago_file_path: soportePagoPath,
        facturas_ids: [factura.id],
        detalles: {
          factura_numero: factura.numero_factura,
          proveedor: factura.emisor_nombre,
          nit: factura.emisor_nit,
          total_original: totalOriginalDisplay,
          retencion: retencion,
          pronto_pago: prontoPago,
          descuentos_adicionales: totalDescuentosAdicionales,
          total_descuentos: totalDescuentosResumen,
          pagos_partidos: usarPagoPartido ? metodosPago.filter(p => p.monto > 0) : null,
          saldos_aplicados: saldosAplicadosInfo.length > 0 ? saldosAplicadosInfo : null,
          total_saldos_aplicados: totalSaldosInfo,
          soporte_pago: soportePagoPath ? {
            file_path: soportePagoPath,
            nombre_original: soporteFile?.name || null,
            tamano: soporteFile?.size || null,
            tipo: soporteFile?.type || null
          } : null,
          notas_credito: notasCredito.length > 0 ? notasCredito : null,
          total_notas_credito: totalNotasCredito
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

      if (soporteFile) {
        setSoporteFile(null);
        if (soporteInputRef.current) {
          soporteInputRef.current.value = '';
        }
      }

      return fileName;
    } catch (error: any) {
      console.error('❌ Error al guardar PDF:', error);
      console.error('Error completo:', JSON.stringify(error, null, 2));
      throw error;
    }
  };

  const handlePayment = async () => {
    // Validaciones básicas
    if (!factura) return;

    // Validar saldos seleccionados
    const totalSaldos = calcularTotalSaldosAplicados();
    const valorTotal = obtenerValorFinal(factura);

    // Validar que los saldos no excedan el total
    if (totalSaldos > valorTotal) {
      toast({
        title: "Saldos exceden el total",
        description: `Los saldos aplicados (${formatCurrency(totalSaldos)}) no pueden ser mayores al total a pagar (${formatCurrency(valorTotal)})`,
        variant: "destructive"
      });
      return;
    }

    // Si el pago se cubre completamente con saldos, no se requiere método de pago
    const montoRestante = valorTotal - totalSaldos;
    const esPagadoCompleto = montoRestante < 1;

    // Validar pago partido
    if (usarPagoPartido && !esPagadoCompleto) {
      if (!validarPagoPartido()) {
        const totalReal = montoRestante;
        const totalMetodos = calcularTotalMetodosPago();
        toast({
          title: "Error en pago partido",
          description: `La suma de los métodos (${formatCurrency(totalMetodos)}) debe ser igual al monto restante (${formatCurrency(totalReal)})`,
          variant: "destructive"
        });
        return;
      }
    } else if (!esPagadoCompleto) {
      // Validar pago normal solo si queda monto por pagar
      if (!selectedPaymentMethod || !usedProntoPago) {
        toast({
          title: "Campos requeridos",
          description: "Por favor completa todos los campos requeridos",
          variant: "destructive"
        });
        return;
      }
    }

    setProcessing(true);
    try {
      // Calcular el valor real a pagar basado en la decisión final del usuario
      let valorRealAPagar: number;

      if (usarPagoPartido) {
        // En pago partido, siempre usar el valor con descuento de pronto pago si existe
        valorRealAPagar = calcularValorRealAPagar(factura);
      } else {
        // En pago normal, respetar la decisión del usuario
        const facturaParaCalculo = {
          ...factura,
          porcentaje_pronto_pago: usedProntoPago === 'yes' ? factura.porcentaje_pronto_pago : null
        };
        valorRealAPagar = calcularValorRealAPagar(facturaParaCalculo);
      }

      // PASO 1: Generar y guardar el comprobante PDF
      console.log('🎯 PASO 1: Generando y guardando comprobante PDF...');
      const pdfFileName = await generarYGuardarComprobantePDF();
      console.log('✅ PDF guardado:', pdfFileName);

      // Convertir la fecha correctamente para evitar problemas de zona horaria
      const [year, month, day] = paymentDate.split('-');
      const fechaPagoISO = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0).toISOString();

      // PASO 2: Actualizar el estado de la factura
      console.log('🎯 PASO 2: Actualizando estado de factura...');
      if (usarPagoPartido) {
        // Pago partido - usar pronto pago automáticamente si está disponible
        const { error: updateError } = await supabase
          .from('facturas')
          .update({
            estado_mercancia: 'pagada',
            metodo_pago: 'Pago Partido',
            uso_pronto_pago: factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0,
            fecha_pago: fechaPagoISO,
            valor_real_a_pagar: valorRealAPagar
          })
          .eq('id', factura.id);

        if (updateError) throw updateError;

        // Insertar registros de pagos partidos
        console.log('📝 Intentando insertar pagos partidos:', {
          factura_id: factura.id,
          metodos: metodosPago,
          fecha: fechaPagoISO
        });

        const pagoPartidoPromises = metodosPago.map(mp =>
          supabase
            .from('pagos_partidos')
            .insert({
              factura_id: factura.id,
              metodo_pago: mp.metodo,
              monto: mp.monto,
              fecha_pago: fechaPagoISO
            })
        );

        const pagoResults = await Promise.all(pagoPartidoPromises);
        const pagoErrors = pagoResults.filter(result => result.error);
        if (pagoErrors.length > 0) {
          console.error('❌ Errores detallados de pagos partidos:', pagoErrors.map(r => ({
            error: r.error,
            errorDetails: JSON.stringify(r.error, null, 2)
          })));
          throw new Error(`Error al crear registros de pago partido: ${JSON.stringify(pagoErrors[0].error)}`);
        }

        console.log('✅ Pagos partidos insertados correctamente:', pagoResults);

        toast({
          title: "✅ Factura pagada exitosamente",
          description: `Factura ${factura.numero_factura} pagada con pago partido. Comprobante: ${pdfFileName}`,
        });

      } else {
        // Pago normal - también guardarlo en pagos_partidos
        const { error: updateError } = await supabase
          .from('facturas')
          .update({
            estado_mercancia: 'pagada',
            metodo_pago: selectedPaymentMethod,
            uso_pronto_pago: usedProntoPago === 'yes',
            fecha_pago: fechaPagoISO,
            valor_real_a_pagar: valorRealAPagar
          })
          .eq('id', factura.id);

        if (updateError) throw updateError;

        // Insertar registro en pagos_partidos para mantener consistencia
        console.log('📝 Insertando pago normal en pagos_partidos:', {
          factura_id: factura.id,
          metodo_pago: selectedPaymentMethod,
          monto: valorRealAPagar
        });

        const { error: pagoError } = await supabase
          .from('pagos_partidos')
          .insert({
            factura_id: factura.id,
            metodo_pago: selectedPaymentMethod,
            monto: valorRealAPagar,
            fecha_pago: fechaPagoISO
          });

        if (pagoError) {
          console.error('❌ Error al insertar pago normal:', pagoError);
          console.error('❌ Error detallado:', JSON.stringify(pagoError, null, 2));
          throw pagoError;
        }

        console.log('✅ Pago normal insertado en pagos_partidos');

        const prontoPagoText = usedProntoPago === 'yes' ? ' con descuento pronto pago' : ' sin descuento pronto pago';

        toast({
          title: "✅ Factura pagada exitosamente",
          description: `Factura ${factura.numero_factura} pagada via ${selectedPaymentMethod}${prontoPagoText}. Comprobante: ${pdfFileName}`,
        });
      }

      console.log('✅ Factura actualizada correctamente');

      onPaymentProcessed();
      onClose();
      // Reset form
      setSelectedPaymentMethod('');
      setUsedProntoPago('');
      setAmountPaid('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setUsarPagoPartido(false);
      setMetodosPago([{ metodo: '', monto: 0 }]);
    } catch (error: any) {
      console.error('❌ Error en el proceso de pago:', error);
      toast({
        title: "Error al procesar el pago",
        description: error?.message || "No se pudo completar el pago. Por favor intenta nuevamente.",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!factura) return null;

  const baseSinIVAActual = obtenerBaseSinIVADespuesNotasCredito(factura);
  const baseSinIVAOriginal = obtenerBaseSinIVAOriginal(factura);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">¿Cómo fue el pago de la factura {factura.numero_factura}?</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Columna Izquierda - Información de la factura */}
          <div className="space-y-4">
            {/* Info básica */}
            <Card>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Emisor:</span>
                    <span className="text-sm">{factura.emisor_nombre}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">NIT:</span>
                    <span className="text-sm">{factura.emisor_nit}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Desglose */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold mb-3">Desglose de la factura:</p>

                {(() => {
                  console.log('Valores de la factura:', {
                    total_a_pagar: factura.total_a_pagar,
                    factura_iva: factura.factura_iva,
                    total_sin_iva: factura.total_sin_iva,
                    valorAntesIVAOriginal: baseSinIVAOriginal,
                    valorAntesIVAActual: baseSinIVAActual,
                    descuentos_antes_iva: factura.descuentos_antes_iva
                  });
                  return null;
                })()}

                <div className="flex justify-between text-sm">
                  <span>Valor antes de IVA:</span>
                  <span className="font-medium">
                    {formatCurrency(baseSinIVAActual)}
                  </span>
                </div>
                {Math.round(baseSinIVAOriginal) !== Math.round(baseSinIVAActual) && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Base original sin IVA:</span>
                    <span>{formatCurrency(baseSinIVAOriginal)}</span>
                  </div>
                )}

                {/* Mostrar descuentos antes de IVA si existen */}
                {factura.descuentos_antes_iva && (() => {
                  try {
                    console.log('Descuentos antes de IVA (raw):', factura.descuentos_antes_iva);
                    const descuentos = JSON.parse(factura.descuentos_antes_iva);
                    console.log('Descuentos parseados:', descuentos);
                    if (!descuentos || descuentos.length === 0) {
                      console.log('No hay descuentos en el array');
                      return null;
                    }
                    const baseCalculada = baseSinIVAOriginal;
                    const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
                      if (desc.tipo === 'porcentaje') {
                        return sum + (baseCalculada * desc.valor / 100);
                      }
                      return sum + desc.valor;
                    }, 0);

                    return (
                      <div className="text-purple-600 text-xs space-y-1 p-2 bg-purple-50 dark:bg-purple-900/20 rounded my-2">
                        <p className="font-semibold">Descuentos aplicados:</p>
                        {descuentos.map((desc: any, index: number) => (
                          <div key={index} className="flex justify-between ml-2">
                            <span>• {desc.concepto}:</span>
                            <span>
                              {desc.tipo === 'porcentaje' ? `${desc.valor}%` : formatCurrency(desc.valor)}
                              {desc.tipo === 'porcentaje' && ` = ${formatCurrency(baseCalculada * desc.valor / 100)}`}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between font-semibold mt-1 pt-1 border-t border-purple-200">
                          <span>Total descuentos:</span>
                          <span>-{formatCurrency(totalDescuentos)}</span>
                        </div>
                      </div>
                    );
                  } catch {
                    return null;
                  }
                })()}

                {factura.factura_iva && factura.factura_iva > 0 && (
                  <div className="flex justify-between text-sm text-blue-600 pt-2 border-t">
                    <span>IVA ({factura.factura_iva_porcentaje || 19}%):</span>
                    <span className="font-medium">+{formatCurrency(factura.factura_iva)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm pt-2 border-t font-semibold">
                  <span>Total con IVA:</span>
                  <span>{formatCurrency(factura.total_a_pagar)}</span>
                </div>

                {factura.tiene_retencion && factura.monto_retencion && (
                  <div className="text-orange-600 text-sm pt-2 border-t">
                    <strong>Retención ({factura.monto_retencion}%):</strong> -{formatCurrency(baseSinIVAActual * ((factura.monto_retencion || 0) / 100))}
                  </div>
                )}

                {factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0 && (
                  <div className="text-green-600 text-sm font-semibold">
                    Descuento pronto pago disponible: {factura.porcentaje_pronto_pago}% (-{formatCurrency(baseSinIVAOriginal * (factura.porcentaje_pronto_pago || 0) / 100)})
                  </div>
                )}

                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border-l-4 border-red-500">
                  <div className="text-red-700 dark:text-red-300">
                    <div className="font-bold text-base">
                      Valor Real a Pagar: {formatCurrency(obtenerValorRealDisponible(factura))}
                    </div>
                    <p className="text-xs mt-1">
                      (Valor óptimo con retenciones{factura.porcentaje_pronto_pago ? ' y descuento por pronto pago aplicados' : ' aplicadas'})
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Columna Derecha - Formulario de pago */}
          <div className="space-y-4">
            {/* Saldos a Favor Disponibles */}
            {saldosDisponibles.length > 0 && (
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
                    <div className="space-y-2">
                      {saldosDisponibles.map((saldo) => (
                        <div key={saldo.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {formatCurrency(saldo.saldo_disponible)} disponible
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {saldo.numero_factura_origen ? `Factura: ${saldo.numero_factura_origen}` : `Origen: ${saldo.motivo}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Medio: <span className="font-semibold text-foreground">{saldo.medio_pago}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              placeholder="0"
                              value={saldosSeleccionados[saldo.id] ? new Intl.NumberFormat('es-CO').format(saldosSeleccionados[saldo.id]) : ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '');
                                const montoNum = value ? parseInt(value) : 0;
                                const montoMax = Math.min(saldo.saldo_disponible, obtenerValorFinal(factura) - calcularTotalSaldosAplicados() + (saldosSeleccionados[saldo.id] || 0));
                                const montoFinal = Math.min(montoNum, montoMax);

                                const nuevos = { ...saldosSeleccionados };
                                if (montoFinal > 0) {
                                  nuevos[saldo.id] = montoFinal;
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
                                  obtenerValorFinal(factura) - calcularTotalSaldosAplicados() + (saldosSeleccionados[saldo.id] || 0)
                                );
                                setSaldosSeleccionados({
                                  ...saldosSeleccionados,
                                  [saldo.id]: montoMax
                                });
                              }}
                              disabled={saldosAplicados}
                            >
                              Max
                            </Button>
                          </div>
                        </div>
                      ))}

                      {!saldosAplicados && calcularTotalSaldosAplicados() > 0 && (
                        <div className="space-y-2">
                          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded border border-green-300 mt-2">
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
                                {formatCurrency(Math.max(0, obtenerValorFinal(factura) - calcularTotalSaldosAplicados()))}
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

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Soporte del Pago</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Adjunta un comprobante externo (recibo bancario, pantallazo, etc.) para futuras consultas.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  ref={soporteInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleSoporteChange}
                />
                <p className="text-xs text-muted-foreground">
                  Se admite un solo archivo por pago. Formatos sugeridos: PDF o imagen (máx. 10&nbsp;MB).
                </p>
                {soporteFile && (
                  <div className="flex items-center justify-between rounded-md border border-muted p-3 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium">{soporteFile.name}</span>
                      <span className="text-xs text-muted-foreground">{formatFileSize(soporteFile.size)}</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={handleRemoveSoporte}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Quitar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Toggle para Pago Partido */}
            {obtenerValorFinal(factura) - calcularTotalSaldosAplicados() > 0 && (
              <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                <Checkbox
                  id="pago-partido-single"
                  checked={usarPagoPartido}
                  onCheckedChange={(checked) => {
                    setUsarPagoPartido(checked as boolean);
                    if (checked) {
                      setSelectedPaymentMethod('');
                      setMetodosPago([{ metodo: '', monto: 0 }]);
                    }
                  }}
                />
                <label
                  htmlFor="pago-partido-single"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Usar pago partido (dividir entre varios métodos)
                </label>
              </div>
            )}

            {/* Método de pago (Solo si NO es pago partido y queda saldo por pagar) */}
            {!usarPagoPartido && obtenerValorFinal(factura) - calcularTotalSaldosAplicados() > 0 && (
              <div>
                <Label className="text-base font-medium mb-3 block">Método de pago:</Label>
                <RadioGroup value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                <div className="grid grid-cols-3 gap-2">
                  <Card className={`cursor-pointer transition-all ${selectedPaymentMethod === 'Pago Banco' ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-accent/20'}`}>
                    <CardContent className="p-3">
                      <Label htmlFor="banco" className="cursor-pointer flex flex-col items-center space-y-2 w-full">
                        <RadioGroupItem value="Pago Banco" id="banco" className="sr-only" />
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Building2 className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-xs">Banco</div>
                        </div>
                      </Label>
                    </CardContent>
                  </Card>

                  <Card className={`cursor-pointer transition-all ${selectedPaymentMethod === 'Pago Tobías' ? 'ring-2 ring-green-500 bg-green-50' : 'hover:bg-accent/20'}`}>
                    <CardContent className="p-3">
                      <Label htmlFor="tobias" className="cursor-pointer flex flex-col items-center space-y-2 w-full">
                        <RadioGroupItem value="Pago Tobías" id="tobias" className="sr-only" />
                        <div className="p-2 bg-green-100 rounded-lg">
                          <CreditCard className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-xs">Tobías</div>
                        </div>
                      </Label>
                    </CardContent>
                  </Card>

                  <Card className={`cursor-pointer transition-all ${selectedPaymentMethod === 'Caja' ? 'ring-2 ring-orange-500 bg-orange-50' : 'hover:bg-accent/20'}`}>
                    <CardContent className="p-3">
                      <Label htmlFor="caja" className="cursor-pointer flex flex-col items-center space-y-2 w-full">
                        <RadioGroupItem value="Caja" id="caja" className="sr-only" />
                        <div className="p-2 bg-orange-100 rounded-lg">
                          <Banknote className="w-5 h-5 text-orange-600" />
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-xs">Caja</div>
                        </div>
                      </Label>
                    </CardContent>
                  </Card>
                </div>
              </RadioGroup>
              </div>
            )}

            {/* Interface para Pago Partido */}
            {usarPagoPartido && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Métodos de Pago:</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={agregarMetodoPago}
                    className="h-8"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar
                  </Button>
                </div>

                {/* Lista de métodos de pago */}
                <div className="space-y-2">
                  {metodosPago.map((mp, index) => (
                    <div key={index} className="flex gap-2 items-start p-3 bg-muted/30 rounded-lg">
                      <div className="flex-1 space-y-2">
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
                      Math.abs(calcularTotalMetodosPago() - obtenerValorFinal(factura)) < 1
                        ? 'text-green-600'
                        : 'text-orange-600'
                    }`}>
                      {formatCurrency(calcularTotalMetodosPago())}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total a pagar:</span>
                    <span className="font-semibold">{formatCurrency(obtenerValorFinal(factura))}</span>
                  </div>
                  {Math.abs(calcularTotalMetodosPago() - obtenerValorFinal(factura)) >= 1 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Diferencia:</span>
                      <span className="font-semibold text-destructive">
                        {formatCurrency(Math.abs(calcularTotalMetodosPago() - obtenerValorFinal(factura)))}
                      </span>
                    </div>
                  )}
                  {Math.abs(calcularTotalMetodosPago() - obtenerValorFinal(factura)) < 1 && (
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span>Los montos coinciden correctamente</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ¿Se aplicó pronto pago? - Solo si queda saldo por pagar */}
            {!usarPagoPartido && obtenerValorFinal(factura) - calcularTotalSaldosAplicados() > 0 && (
              <div>
              <Label className="text-base font-medium mb-3 block">¿Se aplicó descuento por pronto pago?</Label>
              <RadioGroup value={usedProntoPago} onValueChange={setUsedProntoPago}>
                <div className="grid grid-cols-2 gap-3">
                  <Card className={`cursor-pointer transition-all ${usedProntoPago === 'yes' ? 'ring-2 ring-green-500 bg-green-50' : 'hover:bg-accent/20'}`}>
                    <CardContent className="p-3">
                      <Label htmlFor="pronto-si" className="cursor-pointer flex items-center space-x-2 w-full">
                        <RadioGroupItem value="yes" id="pronto-si" />
                        <Percent className="w-4 h-4 text-green-600" />
                        <span className="text-sm">Sí, con descuento</span>
                      </Label>
                    </CardContent>
                  </Card>

                  <Card className={`cursor-pointer transition-all ${usedProntoPago === 'no' ? 'ring-2 ring-gray-500 bg-gray-50' : 'hover:bg-accent/20'}`}>
                    <CardContent className="p-3">
                      <Label htmlFor="pronto-no" className="cursor-pointer flex items-center space-x-2 w-full">
                        <RadioGroupItem value="no" id="pronto-no" />
                        <span className="text-sm">No, sin descuento</span>
                      </Label>
                    </CardContent>
                  </Card>
                </div>
              </RadioGroup>
              </div>
            )}

            {/* Fecha de pago */}
            <div>
              <Label className="text-base font-medium mb-2 block">Fecha de pago:</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Monto pagado */}
            <div>
              <Label className="text-base font-medium mb-2 block">Monto pagado:</Label>
              <Input
                type="text"
                placeholder="Ej: 1,250,000"
                value={amountPaid}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.,]/g, '');
                  setAmountPaid(value);
                }}
                className="text-lg font-semibold"
              />

              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-800">💡 Monto sugerido:</span>
                  <span className="text-lg font-bold text-blue-700">
                    {formatCurrency(obtenerValorFinal(factura))}
                  </span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  {usedProntoPago === 'no'
                    ? 'Sin descuento de pronto pago'
                    : usedProntoPago === 'yes'
                      ? 'Con descuento de pronto pago'
                      : 'Selecciona si usaste el descuento'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full border-blue-300 text-blue-700 hover:bg-blue-100"
                  onClick={() => {
                    const valorReal = obtenerValorFinal(factura);
                    setAmountPaid(new Intl.NumberFormat('es-CO').format(valorReal));
                  }}
                >
                  Usar este monto
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="space-y-3 pt-4 border-t mt-6">
          {/* Botón para descargar PDF */}
          <Button
            variant="outline"
            onClick={generarPDF}
            className="w-full border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20"
          >
            <Download className="w-4 h-4 mr-2" />
            Descargar Soporte PDF
          </Button>

          {/* Botones principales */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={onClose} disabled={processing}>
              Cancelar
            </Button>
            <Button
              onClick={handlePayment}
              disabled={
                processing ||
                (usarPagoPartido
                  ? !validarPagoPartido()
                  : !selectedPaymentMethod)
              }
              className="min-w-[140px]"
              size="lg"
            >
              {processing ? "Procesando..." : "Confirmar Pago"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
