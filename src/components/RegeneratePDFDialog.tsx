import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calcularValorRealAPagar, obtenerBaseSinIVADespuesNotasCredito, obtenerBaseSinIVAOriginal } from '@/utils/calcularValorReal';
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
  factura_iva_5?: number | null;
  factura_iva_5_porcentaje?: number | null;
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
  metodo_pago?: string | null;
  uso_pronto_pago?: boolean | null;
}

interface RegeneratePDFDialogProps {
  factura: Factura | null;
  isOpen: boolean;
  onClose: () => void;
  onPDFRegenerated?: () => void;
}

interface NotaCreditoRelacionada {
  id: string;
  numero_factura: string;
  total_a_pagar: number;
  fecha_aplicacion?: string;
}

export function RegeneratePDFDialog({ factura, isOpen, onClose, onPDFRegenerated }: RegeneratePDFDialogProps) {
  const [processing, setProcessing] = useState(false);
  const [facturaActualizada, setFacturaActualizada] = useState<Factura | null>(null);
  const [cargando, setCargando] = useState(false);
  const [notasCreditoRelacionadas, setNotasCreditoRelacionadas] = useState<NotaCreditoRelacionada[]>([]);
  const { toast } = useToast();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  // Recargar factura desde BD para obtener datos frescos y buscar notas de crédito relacionadas
  useEffect(() => {
    const recargarFactura = async () => {
      if (!factura?.id || !isOpen) {
        setFacturaActualizada(null);
        setNotasCreditoRelacionadas([]);
        return;
      }

      setCargando(true);
      try {
        // 1. Recargar la factura actual
        const { data, error } = await supabase
          .from('facturas')
          .select('*')
          .eq('id', factura.id)
          .single();

        if (error) {
          console.error('Error al recargar factura:', error);
          setFacturaActualizada(null);
        } else if (data) {
          console.log('Factura recargada para regenerar PDF:', data.numero_factura);
          console.log('Campo notas:', data.notas);
          setFacturaActualizada(data as Factura);
        }

        // 2. Buscar notas de crédito relacionadas en la BD
        // Buscar facturas con clasificacion='nota_credito' que tengan en su campo notas
        // una referencia a esta factura (factura_aplicada_id)
        const { data: notasCredito, error: errorNC } = await supabase
          .from('facturas')
          .select('id, numero_factura, total_a_pagar, notas, created_at')
          .eq('clasificacion', 'nota_credito')
          .eq('estado_nota_credito', 'aplicada');

        if (errorNC) {
          console.error('Error buscando notas de crédito:', errorNC);
        } else if (notasCredito && notasCredito.length > 0) {
          console.log('Notas de crédito encontradas en BD:', notasCredito.length);

          // Filtrar las que aplican a esta factura
          const ncRelacionadas: NotaCreditoRelacionada[] = [];

          for (const nc of notasCredito) {
            if (nc.notas) {
              try {
                const notasData = JSON.parse(nc.notas);
                // Verificar si esta NC aplica a la factura actual
                if (notasData.factura_aplicada_id === factura.id) {
                  console.log('✅ NC relacionada encontrada:', nc.numero_factura);
                  ncRelacionadas.push({
                    id: nc.id,
                    numero_factura: nc.numero_factura,
                    total_a_pagar: notasData.valor_aplicado || nc.total_a_pagar,
                    fecha_aplicacion: notasData.fecha_aplicacion
                  });
                }
              } catch (parseError) {
                console.error('Error parseando notas de NC:', parseError);
              }
            }
          }

          console.log('Notas de crédito que aplican a esta factura:', ncRelacionadas);
          setNotasCreditoRelacionadas(ncRelacionadas);
        } else {
          setNotasCreditoRelacionadas([]);
        }
      } catch (error) {
        console.error('Error al recargar factura:', error);
        setFacturaActualizada(null);
        setNotasCreditoRelacionadas([]);
      } finally {
        setCargando(false);
      }
    };

    recargarFactura();
  }, [factura?.id, isOpen]);

  // Limpiar al cerrar
  useEffect(() => {
    if (!isOpen) {
      setFacturaActualizada(null);
      setNotasCreditoRelacionadas([]);
    }
  }, [isOpen]);

  const obtenerNotasCreditoAplicadas = (facturaActual: Factura | null, ncRelacionadas: NotaCreditoRelacionada[]) => {
    const notasCredito: { numero: string; valor: number; fecha?: string | null }[] = [];

    // 1. Primero buscar en el campo notas de la factura (método antiguo)
    if (facturaActual?.notas) {
      try {
        const notasData = JSON.parse(facturaActual.notas);
        if (Array.isArray(notasData?.notas_credito) && notasData.notas_credito.length > 0) {
          notasData.notas_credito
            .filter((nc: any) => nc)
            .forEach((nc: any) => {
              notasCredito.push({
                numero: nc.numero_factura || notasData.numero_factura_aplicada || 'Nota Crédito',
                valor: nc.valor_descuento ?? nc.valor_aplicado ?? 0,
                fecha: nc.fecha_aplicacion || notasData.fecha_aplicacion || null
              });
            });
        }
      } catch (error) {
        console.error('Error parsing notas de crédito desde campo notas:', error);
      }
    }

    // 2. Agregar las notas de crédito encontradas en la BD (evitando duplicados)
    if (ncRelacionadas.length > 0) {
      ncRelacionadas.forEach(nc => {
        // Verificar si ya existe por número de factura
        const yaExiste = notasCredito.some(
          existing => existing.numero === nc.numero_factura
        );
        if (!yaExiste) {
          notasCredito.push({
            numero: nc.numero_factura,
            valor: nc.total_a_pagar,
            fecha: nc.fecha_aplicacion || null
          });
        }
      });
    }

    const totalNotasCredito = notasCredito.reduce((sum, nc) => sum + (nc.valor || 0), 0);
    return { notasCredito, totalNotasCredito };
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
      return {
        totalOriginal: null,
        ivaOriginal: null,
        totalSinIvaOriginal: null
      };
    }
  };

  const obtenerTotalOriginalDisplay = (facturaActual: Factura, totalNotasCredito: number) => {
    const valoresOriginales = obtenerValoresOriginales(facturaActual);
    if (valoresOriginales.totalOriginal) return valoresOriginales.totalOriginal;
    if (totalNotasCredito > 0) return facturaActual.total_a_pagar + totalNotasCredito;
    return facturaActual.total_a_pagar;
  };

  const parseDetalles = (detalles: any) => {
    if (!detalles) return null;
    if (typeof detalles === 'string') {
      try {
        return JSON.parse(detalles);
      } catch {
        return null;
      }
    }
    return detalles;
  };

  const regenerarComprobanteGrupalSiExiste = async (facturaId: string) => {
    const { data: comprobanteGrupal, error: errorComprobante } = await supabase
      .from('comprobantes_pago')
      .select('id, facturas_ids, pdf_file_path, metodo_pago, fecha_pago, detalles, cantidad_facturas, tipo_comprobante')
      .contains('facturas_ids', [facturaId])
      .eq('tipo_comprobante', 'pago_multiple')
      .gt('cantidad_facturas', 1)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errorComprobante || !comprobanteGrupal) return null;

    const facturasIds = Array.isArray((comprobanteGrupal as any).facturas_ids)
      ? ((comprobanteGrupal as any).facturas_ids as string[])
      : [];

    if (facturasIds.length === 0) return null;

    const { data: facturas, error: errorFacturas } = await supabase
      .from('facturas')
      .select('*')
      .in('id', facturasIds);

    if (errorFacturas || !facturas || facturas.length === 0) return null;

    const facturasOrdenadas = facturasIds
      .map((id) => facturas.find((f) => f.id === id))
      .filter(Boolean) as Factura[];

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const topMargin = 20;
    const bottomMargin = 30;
    let currentY = 15;
    const timestamp = Date.now();

    const ensureSpace = (height: number) => {
      if (currentY + height > pageHeight - bottomMargin) {
        doc.addPage();
        currentY = topMargin;
      }
    };

    const proveedoresUnicos = [...new Set(facturasOrdenadas.map((f) => f.emisor_nombre))];
    const esProveedorUnico = proveedoresUnicos.length === 1;

    const totalOriginal = facturasOrdenadas.reduce((sum, f) => {
      const { totalNotasCredito } = obtenerNotasCreditoAplicadas(f, []);
      return sum + obtenerTotalOriginalDisplay(f, totalNotasCredito);
    }, 0);

    const totalPagado = facturasOrdenadas.reduce((sum, f) => {
      const valor = f.valor_real_a_pagar ?? calcularValorRealAPagar(f);
      return sum + (valor || 0);
    }, 0);

    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageWidth, 45, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    if (esProveedorUnico) {
      const nombre = proveedoresUnicos[0].length > 35 ? `${proveedoresUnicos[0].substring(0, 32)}...` : proveedoresUnicos[0];
      doc.text(`PAGO - ${nombre}`, pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`${facturasOrdenadas.length} ${facturasOrdenadas.length === 1 ? 'Factura' : 'Facturas'}`, pageWidth / 2, 28, { align: 'center' });
    } else {
      doc.text('PAGO MULTIPLE', pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`${facturasOrdenadas.length} Facturas - ${proveedoresUnicos.length} Proveedores`, pageWidth / 2, 28, { align: 'center' });
    }

    doc.setFontSize(9);
    doc.text('(PDF Regenerado)', pageWidth / 2, 36, { align: 'center' });
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(pageWidth / 2 - 30, 40, pageWidth / 2 + 30, 40);

    currentY = 50;

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DEL PAGO', 18, currentY + 7);
    currentY += 15;

    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, currentY, pageWidth - 28, 35, 3, 3, 'S');

    const colWidth = (pageWidth - 28) / 3;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Total Original', 14 + colWidth / 2, currentY + 8, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(formatCurrency(totalOriginal), 14 + colWidth / 2, currentY + 18, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Total a Pagar', 14 + colWidth * 1.5, currentY + 8, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94);
    doc.text(formatCurrency(totalPagado), 14 + colWidth * 1.5, currentY + 18, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Total Descuentos', 14 + colWidth * 2.5, currentY + 8, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94);
    doc.text(formatCurrency(Math.max(0, totalOriginal - totalPagado)), 14 + colWidth * 2.5, currentY + 18, { align: 'center' });

    currentY += 45;

    ensureSpace(20);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('FACTURAS SELECCIONADAS', 18, currentY + 7);
    currentY += 15;

    const tableRows = facturasOrdenadas.map((f) => {
      const { notasCredito, totalNotasCredito } = obtenerNotasCreditoAplicadas(f, []);
      const totalOriginalFactura = obtenerTotalOriginalDisplay(f, totalNotasCredito);
      const valor = f.valor_real_a_pagar ?? calcularValorRealAPagar(f);
      const tipo = f.clasificacion === 'mercancia' ? 'Mercancía' : 'Gasto';
      const notasText = notasCredito.length > 0
        ? notasCredito.map((nc) => `${nc.numero}: -${formatCurrency(nc.valor || 0)}`).join('  |  ')
        : '';

      const mainRow = [
        { content: `#${f.numero_factura}`, styles: { fontStyle: 'bold', fontSize: 9 } },
        { content: f.emisor_nombre, styles: { fontSize: 8 } },
        { content: tipo, styles: { fontSize: 7, halign: 'center', fillColor: [243, 244, 246] } },
        { content: formatCurrency(totalOriginalFactura), styles: { halign: 'right', fontSize: 9 } },
        { content: formatCurrency(valor || 0), styles: { halign: 'right', fontStyle: 'bold', fontSize: 9, textColor: [34, 197, 94] } }
      ];

      const detailRow = notasText
        ? [{ content: `Notas de Crédito: ${notasText}`, colSpan: 5, styles: { fontSize: 7, textColor: [107, 114, 128], fillColor: [249, 250, 251] } }]
        : null;

      return detailRow ? [mainRow, detailRow] : [mainRow];
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
      body: tableRows as any,
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
        0: { cellWidth: 40 },
        1: { cellWidth: 60 },
        2: { cellWidth: 20 },
        3: { cellWidth: 30 },
        4: { cellWidth: 32 }
      },
      margin: { left: 14, right: 14 }
    });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(
      `Regenerado el ${new Date().toLocaleDateString('es-CO')} a las ${new Date().toLocaleTimeString('es-CO')}`,
      14,
      285
    );

    const fileName = `Pago_Multiple_regenerado_${timestamp}.pdf`;
    const pdfBlob = doc.output('blob');
    const storagePath = `comprobantes-pago/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('facturas-pdf')
      .upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: false });

    if (uploadError) throw uploadError;

    const oldPdfPath = (comprobanteGrupal as any).pdf_file_path as string | null;
    const { error: updateError } = await supabase
      .from('comprobantes_pago')
      .update({ pdf_file_path: storagePath })
      .eq('id', (comprobanteGrupal as any).id);

    if (updateError) throw updateError;

    if (oldPdfPath && oldPdfPath !== storagePath) {
      await supabase.storage.from('facturas-pdf').remove([oldPdfPath]);
    }

    doc.save(fileName);

    return {
      comprobanteId: (comprobanteGrupal as any).id as string,
      fileName,
      storagePath,
      detalles: parseDetalles((comprobanteGrupal as any).detalles)
    };
  };

  const regenerarPDF = async () => {
    const facturaParaPDF = facturaActualizada || factura;
    if (!facturaParaPDF) return;

    setProcessing(true);
    try {
      const regeneradoGrupal = await regenerarComprobanteGrupalSiExiste(facturaParaPDF.id);
      if (regeneradoGrupal) {
        toast({
          title: 'PDF Regenerado y Guardado',
          description: 'Se actualizó el comprobante de pago multiple con la información actual.'
        });
        if (onPDFRegenerated) onPDFRegenerated();
        onClose();
        return;
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const topMargin = 20;
      const bottomMargin = 30;
      let currentY = 15;
      const timestamp = Date.now();

      const ensureSpace = (height: number) => {
        if (currentY + height > pageHeight - bottomMargin) {
          doc.addPage();
          currentY = topMargin;
        }
      };

      // Obtener las notas de crédito (para mostrar en el desglose)
      const { notasCredito, totalNotasCredito } = obtenerNotasCreditoAplicadas(facturaParaPDF, notasCreditoRelacionadas);

      console.log('📊 Notas de crédito encontradas:', notasCredito);
      console.log('📊 Total notas de crédito:', totalNotasCredito);

      const totalOriginalDisplay = obtenerTotalOriginalDisplay(facturaParaPDF, totalNotasCredito);

      console.log('📊 Total original a mostrar:', totalOriginalDisplay);

      const valoresOriginales = obtenerValoresOriginales(facturaParaPDF);
      const totalSinIvaAjustado = obtenerBaseSinIVADespuesNotasCredito(facturaParaPDF);
      const totalSinIvaOriginal = valoresOriginales.totalSinIvaOriginal ?? obtenerBaseSinIVAOriginal(facturaParaPDF);

      const retencion = facturaParaPDF.tiene_retencion && facturaParaPDF.monto_retencion
        ? totalSinIvaAjustado * ((facturaParaPDF.monto_retencion || 0) / 100)
        : 0;

      // IMPORTANTE: El valor_real_a_pagar YA tiene las NC aplicadas (NotaCreditoDialog lo actualizó)
      // NO debemos restar las NC de nuevo, solo usarlas para el desglose
      const valorFinal = facturaParaPDF.valor_real_a_pagar ?? calcularValorRealAPagar(facturaParaPDF);

      console.log('📊 Total original:', totalOriginalDisplay, '-> Valor final:', valorFinal);

      const aplicarProntoPago = facturaParaPDF.uso_pronto_pago && facturaParaPDF.porcentaje_pronto_pago && facturaParaPDF.porcentaje_pronto_pago > 0;

      const prontoPago = aplicarProntoPago
        ? totalSinIvaOriginal * ((facturaParaPDF.porcentaje_pronto_pago || 0) / 100)
        : 0;

      const totalDescuentosResumen = Math.max(0, totalOriginalDisplay - valorFinal);

      // Calcular descuentos adicionales antes de IVA
      let descuentosAdicionales: any[] = [];
      let totalDescuentosAdicionales = 0;
      if (facturaParaPDF.descuentos_antes_iva) {
        try {
          descuentosAdicionales = JSON.parse(facturaParaPDF.descuentos_antes_iva);
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

      // ========== ENCABEZADO ==========
      doc.setFillColor(59, 130, 246);
      doc.rect(0, 0, pageWidth, 45, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      const nombreProveedor = facturaParaPDF.emisor_nombre.length > 35
        ? facturaParaPDF.emisor_nombre.substring(0, 32) + '...'
        : facturaParaPDF.emisor_nombre;
      doc.text(`PAGO - ${nombreProveedor}`, pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Factura #${facturaParaPDF.numero_factura}`, pageWidth / 2, 28, { align: 'center' });

      doc.setFontSize(9);
      doc.text('(PDF Regenerado)', pageWidth / 2, 36, { align: 'center' });

      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.line(pageWidth / 2 - 30, 40, pageWidth / 2 + 30, 40);

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
      doc.text('Total Descuentos', 14 + colWidth * 2.5, currentY + 8, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(34, 197, 94);
      doc.text(formatCurrency(totalDescuentosResumen), 14 + colWidth * 2.5, currentY + 18, { align: 'center' });

      currentY += 28;

      // ========== DESGLOSE DE DESCUENTOS Y AJUSTES ==========
      const tieneDescuentos = prontoPago > 0 || retencion > 0 || totalDescuentosAdicionales > 0 || totalNotasCredito > 0;

      if (tieneDescuentos) {
        ensureSpace(50);
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 163, 74);
        doc.text('DESGLOSE DE DESCUENTOS Y AJUSTES', 18, currentY + 7);
        currentY += 15;

        const descuentosData: any[] = [];

        if (prontoPago > 0) {
          descuentosData.push([
            `Descuento Pronto Pago (${facturaParaPDF.porcentaje_pronto_pago}%)`,
            `-${formatCurrency(prontoPago)}`,
            'Descuento'
          ]);
        }

        if (totalDescuentosAdicionales > 0 && descuentosAdicionales.length > 0) {
          descuentosAdicionales.forEach((desc) => {
            const valorDescuento = desc.tipo === 'porcentaje'
              ? totalSinIvaOriginal * (desc.valor / 100)
              : desc.valor;
            const textoDescuento = desc.tipo === 'porcentaje'
              ? `${desc.concepto} (${desc.valor}%)`
              : desc.concepto;
            descuentosData.push([
              textoDescuento,
              `-${formatCurrency(valorDescuento)}`,
              'Descuento'
            ]);
          });
        }

        // NOTAS DE CREDITO
        if (totalNotasCredito > 0 && notasCredito.length > 0) {
          notasCredito.forEach((nc) => {
            descuentosData.push([
              `Nota de Credito ${nc.numero || ''}`,
              `-${formatCurrency(nc.valor || 0)}`,
              'Nota Credito'
            ]);
          });
        }

        if (retencion > 0) {
          descuentosData.push([
            `Retencion en la Fuente (${facturaParaPDF.monto_retencion}%)`,
            `-${formatCurrency(retencion)}`,
            'Retencion'
          ]);
        }

        autoTable(doc, {
          startY: currentY,
          head: [['Concepto', 'Monto', 'Tipo']],
          body: descuentosData,
          theme: 'striped',
          headStyles: {
            fillColor: [34, 197, 94],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9
          },
          styles: {
            fontSize: 9,
            cellPadding: 3
          },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
            2: { cellWidth: 32, halign: 'center' }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 5;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 163, 74);
        doc.text('TOTAL DESCUENTOS Y AJUSTES:', pageWidth - 100, currentY);
        doc.text(`-${formatCurrency(totalDescuentosResumen)}`, pageWidth - 14, currentY, { align: 'right' });

        currentY += 15;
      } else {
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(18, currentY, pageWidth - 18, currentY);
        currentY += 10;
      }

      // ========== INFORMACION DE LA FACTURA ==========
      ensureSpace(30);
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('INFORMACION DE LA FACTURA', 18, currentY + 7);
      currentY += 15;

      const tableData: any[] = [];
      tableData.push(['N Factura', facturaParaPDF.numero_factura]);
      tableData.push(['Proveedor', facturaParaPDF.emisor_nombre]);
      tableData.push(['NIT', facturaParaPDF.emisor_nit]);
      tableData.push(['Clasificacion', facturaParaPDF.clasificacion === 'mercancia' ? 'Mercancia' : 'Gasto']);
      tableData.push(['Fecha de Emision', new Date(facturaParaPDF.created_at).toLocaleDateString('es-CO')]);
      if (facturaParaPDF.fecha_pago) {
        tableData.push(['Fecha de Pago', new Date(facturaParaPDF.fecha_pago).toLocaleDateString('es-CO')]);
      }
      if (facturaParaPDF.metodo_pago) {
        tableData.push(['Metodo de Pago', facturaParaPDF.metodo_pago]);
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

      // ========== PIE DE PAGINA ==========
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text(
        `Regenerado el ${new Date().toLocaleDateString('es-CO')} a las ${new Date().toLocaleTimeString('es-CO')}`,
        14,
        285
      );

      // Guardar PDF
      const nombreLimpio = facturaParaPDF.emisor_nombre
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 40);
      const fileName = `Pago_${nombreLimpio}_${facturaParaPDF.numero_factura}_regenerado_${timestamp}.pdf`;

      // Convertir PDF a blob para subir a storage
      const pdfBlob = doc.output('blob');
      const storagePath = `comprobantes-pago/${fileName}`;

      console.log('📤 Subiendo PDF regenerado a storage:', storagePath);

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

      // Buscar el comprobante de pago existente para esta factura
      // IMPORTANTE: Buscar primero un comprobante individual, y si solo hay grupal, crear uno nuevo
      const { data: comprobantes, error: comprobanteError } = await supabase
        .from('comprobantes_pago')
        .select('id, pdf_file_path, tipo_comprobante, cantidad_facturas')
        .contains('facturas_ids', [facturaParaPDF.id])
        .order('created_at', { ascending: false });

      if (comprobanteError) {
        console.error('Error buscando comprobante:', comprobanteError);
      }

      if (comprobantes && comprobantes.length > 0) {
        // Buscar primero un comprobante individual (1 sola factura)
        const comprobanteIndividual = comprobantes.find(
          c => c.tipo_comprobante === 'pago_individual' || c.cantidad_facturas === 1
        );
        // Si existe un comprobante individual, actualizar ese
        // Si solo hay un comprobante grupal, NO sobreescribirlo (crearíamos uno nuevo)
        const comprobanteGrupal = comprobantes.find(
          c => c.tipo_comprobante === 'pago_multiple' && (c.cantidad_facturas ?? 0) > 1
        );

        if (comprobanteIndividual) {
          // Actualizar el comprobante individual existente
          const oldPdfPath = comprobanteIndividual.pdf_file_path;
          console.log('📝 Actualizando comprobante individual:', comprobanteIndividual.id);

          const { error: updateError } = await supabase
            .from('comprobantes_pago')
            .update({ pdf_file_path: storagePath })
            .eq('id', comprobanteIndividual.id);

          if (updateError) {
            console.error('❌ Error actualizando comprobante:', updateError);
            throw updateError;
          }

          // Intentar eliminar el PDF anterior del storage
          if (oldPdfPath && oldPdfPath !== storagePath) {
            const { error: deleteError } = await supabase.storage
              .from('facturas-pdf')
              .remove([oldPdfPath]);
            if (deleteError) {
              console.warn('⚠️ No se pudo eliminar PDF anterior:', deleteError);
            } else {
              console.log('🗑️ PDF anterior eliminado:', oldPdfPath);
            }
          }

          console.log('✅ Comprobante individual actualizado con nuevo PDF');
           } else if (comprobanteGrupal) {
             // Solo existe comprobante grupal — NO sobreescribirlo
             // Crear un nuevo comprobante individual para esta factura
             console.log('📝 Comprobante grupal encontrado, creando comprobante individual nuevo...');

          const { data: userData } = await supabase.auth.getUser();
          const userId = userData?.user?.id;

           if (userId) {
             const fechaPagoComprobante = facturaParaPDF.fecha_pago || new Date().toISOString();
             const metodoPagoComprobante = facturaParaPDF.metodo_pago || null;
             const totalPagadoComprobante = facturaParaPDF.valor_real_a_pagar ?? calcularValorRealAPagar(facturaParaPDF);

             const { error: insertError } = await supabase
               .from('comprobantes_pago')
               .insert({
                 user_id: userId,
                 tipo_comprobante: 'pago_individual',
                 metodo_pago: metodoPagoComprobante,
                 fecha_pago: fechaPagoComprobante,
                 total_pagado: totalPagadoComprobante,
                 cantidad_facturas: 1,
                 pdf_file_path: storagePath,
                 facturas_ids: [facturaParaPDF.id],
                 detalles: {
                   factura_numero: facturaParaPDF.numero_factura,
                   proveedor: facturaParaPDF.emisor_nombre,
                   nit: facturaParaPDF.emisor_nit,
                   regenerado_desde_grupal: comprobanteGrupal.id
                 }
               });

            if (insertError) {
              console.error('❌ Error creando comprobante individual:', insertError);
              throw insertError;
            }
            console.log('✅ Nuevo comprobante individual creado (sin tocar el grupal)');
          } else {
            console.error('❌ No se pudo obtener el usuario para crear comprobante');
          }
        }
      } else {
        console.warn('⚠️ No se encontró comprobante de pago para esta factura');
      }

      // También descargar localmente
      doc.save(fileName);

      toast({
        title: "PDF Regenerado y Guardado",
        description: `El comprobante de pago ha sido actualizado en el sistema con las notas de credito.`,
      });

      if (onPDFRegenerated) {
        onPDFRegenerated();
      }
      onClose();

    } catch (error: any) {
      console.error('Error regenerando PDF:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo regenerar el PDF",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!factura) return null;

  const facturaParaMostrar = facturaActualizada || factura;
  const { notasCredito, totalNotasCredito } = obtenerNotasCreditoAplicadas(facturaParaMostrar, notasCreditoRelacionadas);
  const valoresOriginales = obtenerValoresOriginales(facturaParaMostrar);
  const tieneNotasCredito = notasCredito.length > 0;

  // Total original (antes de NC)
  // Si no hay total_original guardado, RECONSTRUIR sumando NC al total actual
  let totalOriginalParaMostrar = valoresOriginales.totalOriginal;
  if (!totalOriginalParaMostrar) {
    if (totalNotasCredito > 0) {
      // total_a_pagar ya tiene NC restadas, sumar para obtener original
      totalOriginalParaMostrar = facturaParaMostrar.total_a_pagar + totalNotasCredito;
    } else {
      totalOriginalParaMostrar = facturaParaMostrar.total_a_pagar;
    }
  }

  // El valor final YA tiene las NC aplicadas (NotaCreditoDialog lo actualizó)
  // NO restar de nuevo
  const valorFinalParaMostrar = facturaParaMostrar.valor_real_a_pagar ?? facturaParaMostrar.total_a_pagar;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Regenerar PDF de Comprobante
          </DialogTitle>
          <DialogDescription>
            Genera un nuevo PDF del comprobante de pago con la informacion actualizada
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info de la factura */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Factura:</span>
                  <span className="font-medium">{facturaParaMostrar.numero_factura}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Proveedor:</span>
                  <span className="font-medium">{facturaParaMostrar.emisor_nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Original:</span>
                  <span className="font-medium">{formatCurrency(totalOriginalParaMostrar)}</span>
                </div>
                {tieneNotasCredito && (
                  <div className="flex justify-between text-red-600">
                    <span>Notas de Crédito:</span>
                    <span className="font-medium">-{formatCurrency(totalNotasCredito)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="font-medium">Valor Final a Pagar:</span>
                  <span className="font-bold text-green-600">{formatCurrency(valorFinalParaMostrar)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info de notas de credito */}
          {cargando ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground">Cargando datos actualizados...</p>
            </div>
          ) : tieneNotasCredito ? (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800">Notas de Credito Encontradas</p>
                    <p className="text-sm text-green-700 mt-1">
                      Se incluiran {notasCredito.length} nota(s) de credito en el nuevo PDF:
                    </p>
                      <ul className="mt-2 space-y-1">
                       {notasCredito.map((nc) => (
                         <li key={`${nc.numero}-${nc.fecha ?? ''}`} className="text-sm text-green-700">
                           - {nc.numero}: {formatCurrency(nc.valor)}
                         </li>
                       ))}
                     </ul>
                    <p className="text-sm font-medium text-green-800 mt-2">
                      Total NC: {formatCurrency(totalNotasCredito)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">Sin Notas de Credito</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Esta factura no tiene notas de credito aplicadas. El PDF se generara con la informacion actual.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Botones */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={processing}>
              Cancelar
            </Button>
            <Button onClick={regenerarPDF} disabled={processing || cargando}>
              {processing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Regenerar PDF
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
