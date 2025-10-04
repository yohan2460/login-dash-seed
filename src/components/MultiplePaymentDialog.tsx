import { useState } from 'react';
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
import { CreditCard, Package, Calculator, X, CheckCircle, TrendingDown, Percent, CalendarIcon, Building2, User, Wallet, Download } from 'lucide-react';
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
}

interface MultiplePaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  facturas: Factura[];
  onPaymentProcessed: () => void;
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

  // Calcular descuentos y retenciones por factura individual
  const calcularDetallesFactura = (factura: Factura) => {
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

    // Calcular valor real considerando si se aplica pronto pago o no
    let valorReal = factura.total_a_pagar;

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
      aplicarProntoPago
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

  // Función para generar y descargar PDF
  const generarPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let currentY = 15;

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

      // Fila de detalles (retención y pronto pago) - SOLO si hay algo que mostrar
      if (detalles.retencion > 0 || detalles.prontoPago > 0 || detalles.totalDescuento > 0) {
        let detallesText = '';

        if (detalles.retencion > 0) {
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

        if (detallesText) {
          rows.push([
            {
              content: detallesText,
              colSpan: 5,
              styles: { fontSize: 7, textColor: [107, 114, 128], fillColor: [249, 250, 251] }
            }
          ]);
        }
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

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // ========== DETALLES DEL PAGO ==========
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DETALLES DEL PAGO', 18, currentY + 7);
    currentY += 15;

    // Caja de detalles
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(14, currentY, pageWidth - 28, 25, 3, 3, 'S');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Método de pago:', 20, currentY + 8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(metodoPago, 60, currentY + 8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Fecha de Pago:', 20, currentY + 16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(new Date(fechaPago).toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }), 60, currentY + 16);

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
    let fileName: string;
    if (esProveedorUnico) {
      // Limpiar el nombre del proveedor para usar en archivo
      const nombreLimpio = proveedoresUnicos[0]
        .replace(/[^a-zA-Z0-9\s]/g, '') // Eliminar caracteres especiales
        .replace(/\s+/g, '_') // Reemplazar espacios con guiones bajos
        .substring(0, 40); // Limitar longitud
      fileName = `Pago_${nombreLimpio}_${new Date().toISOString().split('T')[0]}.pdf`;
    } else {
      fileName = `Pago_Multiple_${new Date().toISOString().split('T')[0]}_${facturas.length}_facturas.pdf`;
    }

    doc.save(fileName);

    toast({
      title: "PDF generado exitosamente",
      description: `Se descargó: ${fileName}`,
    });
  };

  const handlePayment = async () => {
    if (!metodoPago) {
      toast({
        title: "Error",
        description: "Selecciona un método de pago",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Convertir la fecha seleccionada a ISO string con hora actual
      const fechaPagoISO = new Date(fechaPago + 'T00:00:00').toISOString();

      // Actualizar todas las facturas
      const updates = facturas.map(factura => {
        const detalles = calcularDetallesFactura(factura);
        return {
          id: factura.id,
          estado_mercancia: 'pagada',
          metodo_pago: metodoPago,
          fecha_pago: fechaPagoISO,
          uso_pronto_pago: facturasConProntoPago.has(factura.id),
          monto_pagado: detalles.valorReal
        };
      });

      // Procesar todas las actualizaciones
      const updatePromises = updates.map(update =>
        supabase
          .from('facturas')
          .update(update)
          .eq('id', update.id)
      );

      const results = await Promise.all(updatePromises);

      // Verificar si hubo errores
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        throw new Error(`Error en ${errors.length} facturas`);
      }

      toast({
        title: "Pago múltiple procesado",
        description: `Se procesaron ${facturas.length} facturas por un total de ${formatCurrency(calcularTotalReal())}`,
      });

      onPaymentProcessed();
      onClose();
    } catch (error) {
      console.error('Error processing multiple payment:', error);
      toast({
        title: "Error en el pago múltiple",
        description: "No se pudieron procesar todas las facturas. Inténtalo de nuevo.",
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
                      {(detalles.retencion > 0 || factura.porcentaje_pronto_pago) && (
                        <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
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
              {/* Método de Pago con Cards */}
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
              disabled={!metodoPago}
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
                disabled={!metodoPago || isProcessing}
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