import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { CreditCard, Building2, Percent, Banknote, Calendar, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calcularValorRealAPagar, calcularMontoRetencionReal } from '@/utils/calcularValorReal';
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
}

interface PaymentMethodDialogProps {
  factura: Factura | null;
  isOpen: boolean;
  onClose: () => void;
  onPaymentProcessed: () => void;
}

export function PaymentMethodDialog({ factura, isOpen, onClose, onPaymentProcessed }: PaymentMethodDialogProps) {
  const [processing, setProcessing] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [usedProntoPago, setUsedProntoPago] = useState<string>('');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const { toast } = useToast();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };


  // Obtener valor real disponible - SIEMPRE recalcular para incluir descuentos
  const obtenerValorRealDisponible = (factura: Factura) => {
    // IMPORTANTE: Siempre recalcular para asegurar que los descuentos estén incluidos
    // La función calcularValorRealAPagar maneja: descuentos + retención + pronto pago
    return calcularValorRealAPagar(factura);
  };

  // Obtener valor final basado en la selección del usuario
  const obtenerValorFinal = (factura: Factura) => {
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

  // Actualizar automáticamente el monto pagado cuando cambie el pronto pago
  useEffect(() => {
    if (factura) {
      const valorReal = obtenerValorFinal(factura);
      setAmountPaid(new Intl.NumberFormat('es-CO').format(valorReal));
    }
  }, [usedProntoPago, factura]);

  // Función para generar PDF
  const generarPDF = () => {
    if (!factura || !selectedPaymentMethod) {
      toast({
        title: "Campos requeridos",
        description: "Por favor selecciona un método de pago",
        variant: "destructive"
      });
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let currentY = 15;

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

    // Calcular valores
    const valorFinal = obtenerValorFinal(factura);
    const retencion = factura.tiene_retencion && factura.monto_retencion
      ? calcularMontoRetencionReal(factura)
      : 0;
    const prontoPago = usedProntoPago === 'yes' && factura.porcentaje_pronto_pago
      ? (factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0))) * (factura.porcentaje_pronto_pago / 100)
      : 0;

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
    doc.text(formatCurrency(factura.total_a_pagar), 14 + colWidth / 2, currentY + 18, { align: 'center' });

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
    doc.text(formatCurrency(factura.total_a_pagar - valorFinal), 14 + colWidth * 2.5, currentY + 18, { align: 'center' });

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

    // ========== DETALLES DEL PAGO ==========
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DETALLES DEL PAGO', 18, currentY + 7);
    currentY += 15;

    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(14, currentY, pageWidth - 28, 25, 3, 3, 'S');

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
    doc.text(new Date(paymentDate).toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }), 60, currentY + 16);

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
    const fileName = `Pago_${nombreLimpio}_${factura.numero_factura}_${new Date().toISOString().split('T')[0]}.pdf`;

    doc.save(fileName);

    toast({
      title: "PDF generado exitosamente",
      description: `Se descargo: ${fileName}`,
    });
  };

  const handlePayment = async () => {
    if (!factura || !selectedPaymentMethod || !usedProntoPago || !amountPaid) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos requeridos",
        variant: "destructive"
      });
      return;
    }

    const cleanAmount = amountPaid.replace(/,/g, '');
    const amountNumber = parseFloat(cleanAmount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      toast({
        title: "Monto inválido",
        description: "Por favor ingresa un monto válido",
        variant: "destructive"
      });
      return;
    }

    setProcessing(true);
    try {
      // Calcular el valor real a pagar basado en la decisión final del usuario
      const facturaParaCalculo = {
        ...factura,
        porcentaje_pronto_pago: usedProntoPago === 'yes' ? factura.porcentaje_pronto_pago : null
      };
      const valorRealAPagar = calcularValorRealAPagar(facturaParaCalculo);

      const { error } = await supabase
        .from('facturas')
        .update({
          estado_mercancia: 'pagada',
          metodo_pago: selectedPaymentMethod,
          uso_pronto_pago: usedProntoPago === 'yes',
          fecha_pago: new Date(paymentDate).toISOString(),
          valor_real_a_pagar: valorRealAPagar
        })
        .eq('id', factura.id);

      if (error) throw error;

      const prontoPagoText = usedProntoPago === 'yes' ? ' con descuento pronto pago' : ' sin descuento pronto pago';

      toast({
        title: "Factura pagada",
        description: `Factura ${factura.numero_factura} marcada como pagada via ${selectedPaymentMethod}${prontoPagoText}`,
      });

      onPaymentProcessed();
      onClose();
      // Reset form
      setSelectedPaymentMethod('');
      setUsedProntoPago('');
      setAmountPaid('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast({
        title: "Error",
        description: "No se pudo procesar el pago",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!factura) return null;

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
                  const valorAntesIVA = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
                  console.log('Valores de la factura:', {
                    total_a_pagar: factura.total_a_pagar,
                    factura_iva: factura.factura_iva,
                    total_sin_iva: factura.total_sin_iva,
                    valorAntesIVA,
                    descuentos_antes_iva: factura.descuentos_antes_iva
                  });
                  return null;
                })()}

                <div className="flex justify-between text-sm">
                  <span>Valor antes de IVA:</span>
                  <span className="font-medium">
                    {formatCurrency(factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0)))}
                  </span>
                </div>

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
                    const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
                      if (desc.tipo === 'porcentaje') {
                        const base = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
                        return sum + (base * desc.valor / 100);
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
                              {desc.tipo === 'porcentaje' && ` = ${formatCurrency((factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0))) * desc.valor / 100)}`}
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
                    <strong>Retención ({factura.monto_retencion}%):</strong> -{formatCurrency(calcularMontoRetencionReal(factura))}
                  </div>
                )}

                {factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0 && (
                  <div className="text-green-600 text-sm font-semibold">
                    Descuento pronto pago disponible: {factura.porcentaje_pronto_pago}% (-{formatCurrency((factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0))) * factura.porcentaje_pronto_pago / 100)})
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
            {/* Método de pago */}
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

            {/* ¿Se aplicó pronto pago? */}
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
            disabled={!selectedPaymentMethod}
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
              disabled={processing || !selectedPaymentMethod || !usedProntoPago || !amountPaid}
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
