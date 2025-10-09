import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Tag, CreditCard, Calendar, Clock, AlertTriangle, CheckCircle, Trash2, FileCheck, Download, Minus, Archive, Edit, Percent, Paperclip, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import * as XLSX from 'xlsx';
import { useState, useMemo, useCallback } from 'react';
import { calcularValorRealAPagar, calcularMontoRetencionReal, calcularTotalReal, obtenerBaseSinIVAOriginal } from '@/utils/calcularValorReal';
import { PDFViewer } from '@/components/PDFViewer';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  pdf_file_path: string | null;
  clasificacion?: string | null;
  clasificacion_original?: string | null;
  created_at: string;
  factura_iva?: number | null;
  factura_iva_porcentaje?: number | null;
  descripcion?: string | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  numero_serie?: string | null;
  estado_mercancia?: string | null;
  metodo_pago?: string | null;
  uso_pronto_pago?: boolean | null;
  monto_pagado?: number | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  user_id?: string;
  es_nota_credito?: boolean;
  factura_original_id?: string | null;
  valor_nota_credito?: number | null;
  total_con_descuento?: number | null;
  notas?: string | null;
  valor_real_a_pagar?: number | null;
  ingresado_sistema?: boolean | null;
  descuentos_antes_iva?: string | null;
  estado_nota_credito?: 'pendiente' | 'aplicada' | 'anulada' | null;
  total_sin_iva?: number | null;
}

interface FacturasTableProps {
  facturas: Factura[];
  onClassifyClick: (factura: Factura) => void;
  onPayClick?: (factura: Factura) => void;
  showPaymentInfo?: boolean;
  onDelete?: (facturaId: string) => void;
  onSistematizarClick?: (factura: Factura) => void;
  showSistematizarButton?: boolean;
  allowDelete?: boolean;
  showOriginalClassification?: boolean;
  onNotaCreditoClick?: (factura: Factura) => void;
  refreshData?: () => void;
  showActions?: boolean;
  showClassifyButton?: boolean;
  showValorRealAPagar?: boolean;
  showOriginalValueForNC?: boolean;
  showIngresoSistema?: boolean;
  onIngresoSistemaClick?: (factura: Factura) => void;
  showEditButton?: boolean;
  onEditClick?: (factura: Factura) => void;
  showMultiplePayment?: boolean;
  onMultiplePayClick?: (facturas: Factura[]) => void;
  highlightedId?: string | null;
}

export function FacturasTable({ facturas, onClassifyClick, onPayClick, showPaymentInfo = false, onDelete, onSistematizarClick, showSistematizarButton = false, allowDelete = true, showOriginalClassification = false, onNotaCreditoClick, refreshData, showActions = true, showClassifyButton = true, showValorRealAPagar = false, showOriginalValueForNC = false, showIngresoSistema = false, onIngresoSistemaClick, showEditButton = false, onEditClick, showMultiplePayment = false, onMultiplePayClick, highlightedId = null }: FacturasTableProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedFacturas, setSelectedFacturas] = useState<string[]>([]);
  const [deletingFactura, setDeletingFactura] = useState<string | null>(null);
  const [isPDFViewerOpen, setIsPDFViewerOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [selectedFacturaForPDF, setSelectedFacturaForPDF] = useState<Factura | null>(null);

  // Validar que facturas sea un array válido con protección contra null (MEMOIZADO)
  const validFacturas = useMemo(() => {
    return Array.isArray(facturas)
      ? facturas
          .filter(f => f && f.id && typeof f.id === 'string' && f.id.length > 0)
          .sort((a, b) => {
            // Ordenar por fecha de emisión (de más antigua a más nueva)
            const fechaA = a.fecha_emision || a.created_at;
            const fechaB = b.fecha_emision || b.created_at;
            return new Date(fechaA).getTime() - new Date(fechaB).getTime();
          })
      : [];
  }, [facturas]);

  // Cache para JSON.parse de notas - evita parsear repetidamente
  const notasCache = useMemo(() => {
    const cache = new Map<string, any>();
    validFacturas.forEach(factura => {
      if (factura.notas) {
        try {
          cache.set(factura.id, JSON.parse(factura.notas));
        } catch {
          cache.set(factura.id, null);
        }
      }
    });
    return cache;
  }, [validFacturas]);

  // Cache para descuentos parseados
  const descuentosCache = useMemo(() => {
    const cache = new Map<string, any>();
    validFacturas.forEach(factura => {
      if (factura.descuentos_antes_iva) {
        try {
          cache.set(factura.id, JSON.parse(factura.descuentos_antes_iva));
        } catch {
          cache.set(factura.id, null);
        }
      }
    });
    return cache;
  }, [validFacturas]);

  // Función segura para formatear fechas (evita problemas de zona horaria) - MEMOIZADA
  const formatFechaSafe = useCallback((fecha: string | null): string => {
    if (!fecha) return '';
    // Parsear como fecha local en lugar de UTC para evitar cambios de día
    const [year, month, day] = fecha.split('T')[0].split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('es-CO');
  }, []);

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  }, []);

  // Función para formatear moneda de manera compacta (sin símbolo de moneda) - MEMOIZADA
  const formatCompactCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(amount));
  }, []);

  // Función para obtener el valor original de una nota de crédito
  const getValorOriginalNotaCredito = (factura: Factura) => {
    // NUEVO: Usar estado_nota_credito y campo notas
    if ((factura.estado_nota_credito === 'aplicada' || factura.estado_nota_credito === 'anulada') && factura.notas) {
      try {
        const notasData = JSON.parse(factura.notas);
        if (notasData.tipo === 'nota_credito' && notasData.valor_original) {
          return notasData.valor_original;
        }
      } catch (error) {
        // Si no se puede parsear, continuar
      }
    }

    // LEGACY: Sistema antiguo
    if (factura.clasificacion === 'nota_credito' && calcularTotalReal(factura) === 0) {
      return factura.total_a_pagar; // Valor original de la nota de crédito
    }
    return null;
  };

  // Función para descargar comprobante de pago
  const obtenerComprobantePago = async (facturaId: string) => {
    console.log('🔍 Buscando comprobante para factura ID:', facturaId);

    const { data: comprobantes, error } = await supabase
      .from('comprobantes_pago')
      .select('*')
      .filter('facturas_ids', 'cs', `{${facturaId}}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('❌ Error en query de comprobantes:', error);
      throw error;
    }

    console.log('📄 Comprobantes encontrados:', comprobantes);
    console.log('📄 Primer comprobante:', comprobantes?.[0]);

    return comprobantes?.[0] ?? null;
  };

  const descargarComprobante = async (facturaId: string) => {
    try {
      console.log('📥 Iniciando descarga de comprobante para factura:', facturaId);
      const comprobante = await obtenerComprobantePago(facturaId);

      if (!comprobante) {
        console.warn('⚠️ No se encontró comprobante');
        toast({
          title: "Comprobante no encontrado",
          description: "No hay comprobante de pago asociado a esta factura. El comprobante se genera automáticamente al registrar el pago.",
          variant: "destructive"
        });
        return;
      }

      console.log('✅ Comprobante encontrado:', comprobante);
      console.log('📂 pdf_file_path:', comprobante.pdf_file_path);

      if (!comprobante.pdf_file_path) {
        console.error('❌ El comprobante no tiene pdf_file_path');
        toast({
          title: "Error en comprobante",
          description: "El comprobante existe pero no tiene archivo PDF asociado",
          variant: "destructive"
        });
        return;
      }

      console.log('🔗 Creando URL firmada para:', comprobante.pdf_file_path);
      const { data: urlData, error: urlError } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(comprobante.pdf_file_path, 3600);

      if (urlError) {
        console.error('❌ Error creando URL firmada:', urlError);
        throw urlError;
      }

      console.log('✅ URL firmada creada:', urlData?.signedUrl);

      if (urlData?.signedUrl) {
        // Abrir el PDF en una nueva pestaña
        window.open(urlData.signedUrl, '_blank');

        toast({
          title: "Comprobante abierto",
          description: "El comprobante de pago se abrió en una nueva pestaña"
        });
      } else {
        console.error('❌ No se pudo generar la URL firmada');
        toast({
          title: "Error",
          description: "No se pudo generar la URL del comprobante",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('❌ Error al descargar comprobante:', error);
      toast({
        title: "Error al descargar",
        description: `Error: ${error instanceof Error ? error.message : 'Desconocido'}`,
        variant: "destructive"
      });
    }
  };

  const descargarSoportePago = async (facturaId: string) => {
    try {
      const comprobante = await obtenerComprobantePago(facturaId);

      if (!comprobante || !comprobante.soporte_pago_file_path) {
        toast({
          title: "Soporte no disponible",
          description: "No se encontró un soporte de pago asociado a esta factura.",
          variant: "destructive"
        });
        return;
      }

      const { data: urlData, error: urlError } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(comprobante.soporte_pago_file_path, 3600);

      if (urlError) throw urlError;

      if (urlData?.signedUrl) {
        window.open(urlData.signedUrl, '_blank');
        toast({
          title: "Soporte abierto",
          description: "El soporte de pago se abrió en una nueva pestaña"
        });
      }
    } catch (error) {
      console.error('Error al descargar soporte:', error);
      toast({
        title: "Error al descargar",
        description: "Hubo un error al descargar el soporte de pago",
        variant: "destructive"
      });
    }
  };

  // Función para obtener información de notas de crédito aplicadas (OPTIMIZADA CON CACHE)
  const getNotasCreditoInfo = useCallback((factura: Factura) => {
    const notasData = notasCache.get(factura.id);
    if (notasData && notasData.notas_credito && notasData.notas_credito.length > 0) {
      return notasData.notas_credito;
    }
    return null;
  }, [notasCache]);

  // Función para obtener información de factura original (para notas de crédito) (OPTIMIZADA CON CACHE)
  const getFacturaOriginalInfo = useCallback((factura: Factura) => {
    if (factura.clasificacion !== 'nota_credito') return null;

    const notasData = notasCache.get(factura.id);
    if (notasData && notasData.tipo === 'nota_credito') {
      return {
        numero_factura_original: notasData.numero_factura_original,
        emisor_original: notasData.emisor_original,
        valor_descuento: notasData.valor_descuento
      };
    }
    return null;
  }, [notasCache]);

  const viewPDF = async (factura: Factura) => {
    if (!factura.pdf_file_path) {
      toast({
        title: "PDF no disponible",
        description: "Esta factura no tiene un archivo PDF asociado",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(factura.pdf_file_path, 60 * 60);

      if (data?.signedUrl) {
        setSelectedFacturaForPDF(factura);
        setPdfUrl(data.signedUrl);
        setIsPDFViewerOpen(true);
      } else {
        throw new Error('No se pudo generar la URL del PDF');
      }
    } catch (error) {
      console.error('Error viewing PDF:', error);
      toast({
        title: "Error",
        description: "No se pudo abrir el archivo PDF",
        variant: "destructive"
      });
    }
  };

  const closePDFViewer = () => {
    setIsPDFViewerOpen(false);
    setPdfUrl(null);
    setSelectedFacturaForPDF(null);
  };

  const toggleSelection = (facturaId: string) => {
    setSelectedFacturas(prev => 
      prev.includes(facturaId) 
        ? prev.filter(id => id !== facturaId)
        : [...prev, facturaId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedFacturas.length === validFacturas.length) {
      setSelectedFacturas([]);
    } else {
      setSelectedFacturas(validFacturas.map(f => f.id));
    }
  };

  const exportToExcel = () => {
    if (selectedFacturas.length === 0) {
      toast({
        title: "Ninguna factura seleccionada",
        description: "Selecciona al menos una factura para exportar",
        variant: "destructive"
      });
      return;
    }

    const selectedData = validFacturas.filter(f => selectedFacturas.includes(f.id));
    
    // Preparar datos para Excel
    const excelData = selectedData.map(factura => {
      let descuentosTexto = '';
      let totalDescuentos = 0;
      if (factura.descuentos_antes_iva) {
        try {
          const descuentos = JSON.parse(factura.descuentos_antes_iva);
          descuentosTexto = descuentos.map((d: any) =>
            `${d.concepto}: ${d.tipo === 'porcentaje' ? d.valor + '%' : '$' + d.valor.toLocaleString('es-CO')}`
          ).join('; ');
          totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
            if (desc.tipo === 'porcentaje') {
              return sum + (obtenerBaseSinIVAOriginal(factura) * desc.valor / 100);
            }
            return sum + desc.valor;
          }, 0);
        } catch {
          descuentosTexto = '';
        }
      }

      return {
        'Número de Factura': factura.numero_factura,
        'Emisor': factura.emisor_nombre,
        'NIT Emisor': factura.emisor_nit,
        'Número de Serie': factura.numero_serie || '',
        'Descripción': factura.descripcion || '',
        'Clasificación': factura.clasificacion || 'Sin clasificar',
        'Clasificación Original': factura.clasificacion_original || '',
        'Total a Pagar': factura.total_a_pagar,
        'IVA': factura.factura_iva || 0,
        'Porcentaje IVA': factura.factura_iva_porcentaje || 0,
        'Descuentos': descuentosTexto,
        'Total Descuentos': totalDescuentos,
        'Tiene Retención': factura.tiene_retencion ? 'Sí' : 'No',
        'Monto Retención': calcularMontoRetencionReal(factura),
        'Porcentaje Pronto Pago': factura.porcentaje_pronto_pago || 0,
        'Uso Pronto Pago': factura.uso_pronto_pago ? 'Sí' : 'No',
        'Estado Mercancía': factura.estado_mercancia || '',
        'Método de Pago': factura.metodo_pago || '',
        'Monto Pagado': factura.monto_pagado || 0,
        'Fecha de Emisión': formatFechaSafe(factura.fecha_emision),
        'Fecha de Vencimiento': formatFechaSafe(factura.fecha_vencimiento),
        'Fecha de Pago': formatFechaSafe(factura.fecha_pago),
        'Fecha de Creación': formatFechaSafe(factura.created_at)
      };
    });

    // Crear libro de Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Ajustar ancho de columnas
    const colWidths = [
      { wch: 15 }, // Número de Factura
      { wch: 30 }, // Emisor
      { wch: 15 }, // NIT Emisor
      { wch: 15 }, // Número de Serie
      { wch: 40 }, // Descripción
      { wch: 15 }, // Clasificación
      { wch: 20 }, // Clasificación Original
      { wch: 15 }, // Total a Pagar
      { wch: 12 }, // IVA
      { wch: 15 }, // Porcentaje IVA
      { wch: 40 }, // Descuentos
      { wch: 15 }, // Total Descuentos
      { wch: 15 }, // Tiene Retención
      { wch: 15 }, // Monto Retención
      { wch: 20 }, // Porcentaje Pronto Pago
      { wch: 15 }, // Uso Pronto Pago
      { wch: 15 }, // Estado Mercancía
      { wch: 15 }, // Método de Pago
      { wch: 15 }, // Monto Pagado
      { wch: 15 }, // Fecha de Emisión
      { wch: 18 }, // Fecha de Vencimiento
      { wch: 15 }, // Fecha de Pago
      { wch: 18 }  // Fecha de Creación
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
    
    // Generar archivo
    const fecha = new Date().toISOString().slice(0, 10);
    const filename = `facturas_exportadas_${fecha}.xlsx`;
    XLSX.writeFile(wb, filename);

    toast({
      title: "Exportación exitosa",
      description: `Se exportaron ${selectedFacturas.length} facturas a Excel`,
    });

    // Limpiar selección
    setSelectedFacturas([]);
  };

  const getEstadoSistemaBadge = (ingresadoSistema: boolean | null | undefined) => {
    if (ingresadoSistema === true) {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
          <Archive className="w-3 h-3 mr-1" />
          Ingresado al Sistema
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="text-orange-600 border-orange-300">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Pendiente de Ingreso
      </Badge>
    );
  };

  const getClassificationBadge = useCallback((clasificacion: string | null | undefined, esNotaCredito?: boolean) => {
    // Verificar si es nota de crédito por clasificación (versión temporal)
    if (esNotaCredito || clasificacion === 'nota_credito') {
      return (
        <Badge variant="outline" className="w-fit text-[10px] bg-red-100 text-red-800 border-red-200">
          <Minus className="w-3 h-3 mr-1" />
          NC
        </Badge>
      );
    }

    if (!clasificacion) return null;

    const styles = {
      mercancia: 'bg-blue-100 text-blue-800 border-blue-200',
      gasto: 'bg-green-100 text-green-800 border-green-200',
      nota_credito: 'bg-red-100 text-red-800 border-red-200'
    };

    const labels = {
      mercancia: 'Mercancía',
      gasto: 'Gasto',
      nota_credito: 'NC'
    };

    return (
      <Badge variant="outline" className={`w-fit text-[10px] ${styles[clasificacion as keyof typeof styles]}`}>
        {labels[clasificacion as keyof typeof labels]}
      </Badge>
    );
  }, []);

  const getDaysUntilDue = (fechaVencimiento: string | null, estadoMercancia?: string | null) => {
    if (!fechaVencimiento || estadoMercancia === 'pagada') return null;
    
    const today = new Date();
    const dueDate = new Date(fechaVencimiento);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  const handleDelete = async (facturaId: string) => {
    try {
      console.log('🗑️ INICIO ELIMINACIÓN - ID:', facturaId);
      console.log('👤 Usuario:', user?.id, user?.email);
      
      if (!user) {
        toast({
          title: "Error de autenticación",
          description: "No hay usuario autenticado",
          variant: "destructive"
        });
        return;
      }

      if (!facturaId) {
        toast({
          title: "Error",
          description: "ID de factura inválido",
          variant: "destructive"
        });
        return;
      }

      setDeletingFactura(facturaId);

      // Verificar que la factura existe (sin filtrar por user_id para permitir que admins eliminen facturas del sistema)
      const { data: checkData, error: checkError } = await supabase
        .from('facturas')
        .select('id, user_id')
        .eq('id', facturaId)
        .single();

      if (checkError) {
        console.error('❌ Error verificando factura:', checkError);
        if (checkError.code === 'PGRST116') {
          toast({
            title: "Error",
            description: "La factura no existe",
            variant: "destructive"
          });
          return;
        }
        throw checkError;
      }

      if (!checkData) {
        console.error('❌ Factura no encontrada');
        toast({
          title: "Error",
          description: "La factura no existe",
          variant: "destructive"
        });
        return;
      }

      console.log('✅ Factura encontrada:', checkData);

      // Ejecutar eliminación - las políticas RLS se encargarán de verificar permisos
      const { data: deleteData, error: deleteError } = await supabase
        .from('facturas')
        .delete()
        .eq('id', facturaId)
        .select();

      console.log('🔄 Respuesta DELETE:', { deleteData, deleteError });

      if (deleteError) {
        console.error('❌ Error en DELETE:', deleteError);
        throw deleteError;
      }

      if (!deleteData || deleteData.length === 0) {
        console.error('❌ No se eliminaron registros - RLS bloqueó la operación');
        toast({
          title: "Error",
          description: "No tienes permisos para eliminar esta factura",
          variant: "destructive"
        });
        return;
      }

      console.log('✅ ELIMINACIÓN EXITOSA:', deleteData);
      
      toast({
        title: "Factura eliminada",
        description: "La factura ha sido eliminada exitosamente",
      });

      // Llamar callback
      if (onDelete) {
        console.log('📞 Llamando callback onDelete...');
        onDelete(facturaId);
      }

      // Refrescar datos si se proporciona la función
      if (refreshData) {
        console.log('🔄 Refrescando datos...');
        refreshData();
      }

    } catch (error: any) {
      console.error('❌ ERROR CRÍTICO:', error);
      toast({
        title: "Error al eliminar",
        description: `Error: ${error?.message || 'Error desconocido'}`,
        variant: "destructive"
      });
    } finally {
      setDeletingFactura(null);
    }
  };

  const getDaysIndicator = (daysUntilDue: number | null) => {
    if (daysUntilDue === null) return null;

    let bgColor = '';
    let textColor = '';
    let text = '';
    
    if (daysUntilDue < 0) {
      bgColor = 'bg-red-500';
      textColor = 'text-white';
      text = `${Math.abs(daysUntilDue)}d`;
    } else if (daysUntilDue <= 3) {
      bgColor = 'bg-orange-500';
      textColor = 'text-white';
      text = `${daysUntilDue}d`;
    } else if (daysUntilDue <= 7) {
      bgColor = 'bg-yellow-500';
      textColor = 'text-white';
      text = `${daysUntilDue}d`;
    } else {
      bgColor = 'bg-green-500';
      textColor = 'text-white';
      text = `${daysUntilDue}d`;
    }
    
    return (
      <div className="flex items-center space-x-2">
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${bgColor} ${textColor}`}>
          {text}
        </span>
      </div>
    );
  };

  const getEstadoMercanciaBadge = useCallback((estado: string | null | undefined) => {
    if (!estado) return null;

    const map = {
      pagada: { label: 'Pagada', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
      pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700 border-amber-200' },
      'en proceso': { label: 'En proceso', className: 'bg-blue-100 text-blue-700 border-blue-200' }
    } as Record<string, { label: string; className: string }>;

    const config = map[estado.toLowerCase()] ?? {
      label: estado.charAt(0).toUpperCase() + estado.slice(1),
      className: 'bg-slate-100 text-slate-700 border-slate-200'
    };

    return (
      <Badge variant="outline" className={`w-fit text-[10px] ${config.className}`}>
        {config.label}
      </Badge>
    );
  }, []);

  const getMetodoPagoBadge = useCallback((metodo: string | null | undefined) => {
    if (!metodo) return null;

    const normalized = metodo.toLowerCase();
    const map = {
      'pago banco': 'bg-blue-100 text-blue-700 border-blue-200',
      'pago tobías': 'bg-purple-100 text-purple-700 border-purple-200',
      'caja': 'bg-amber-100 text-amber-700 border-amber-200',
      'pago partido': 'bg-rose-100 text-rose-700 border-rose-200'
    } as Record<string, string>;

    return (
      <Badge variant="outline" className={`text-[10px] ${map[normalized] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
        {metodo}
      </Badge>
    );
  }, []);

  const getEstadoNotaCreditoBadge = useCallback((estado: Factura['estado_nota_credito']) => {
    if (!estado) return null;

    const map = {
      aplicada: 'bg-green-100 text-green-700 border-green-200',
      pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
      anulada: 'bg-red-100 text-red-700 border-red-200'
    } as Record<string, string>;

    return (
      <Badge variant="outline" className={`w-fit text-[10px] ${map[estado] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
        NC {estado}
      </Badge>
    );
  }, []);

  const renderDueBadge = useCallback((daysUntilDue: number | null) => {
    if (daysUntilDue === null) return null;

    let style = 'bg-slate-100 text-slate-700 border-slate-200';
    let label = `${daysUntilDue}d`;

    if (daysUntilDue < 0) {
      style = 'bg-red-500 text-white border-transparent';
      label = `${Math.abs(daysUntilDue)}d`;
    } else if (daysUntilDue <= 3) {
      style = 'bg-orange-500 text-white border-transparent';
    } else if (daysUntilDue <= 7) {
      style = 'bg-yellow-500 text-white border-transparent';
    } else {
      style = 'bg-emerald-500 text-white border-transparent';
    }

    return (
      <Badge variant="outline" className={`w-fit text-[9px] px-1.5 ${style}`}>
        {label}
      </Badge>
    );
  }, []);

  // Renderizado móvil y de escritorio
  return (
    <div className="space-y-4">
      {/* Controles de selección y exportación */}
      {validFacturas.length > 0 && (
        <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={selectedFacturas.length === validFacturas.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm font-medium">
                Seleccionar todas ({selectedFacturas.length} de {validFacturas.length} seleccionadas)
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {showMultiplePayment && onMultiplePayClick && (
              <Button
                onClick={() => {
                  const selectedInvoices = validFacturas.filter(f => selectedFacturas.includes(f.id));
                  onMultiplePayClick(selectedInvoices);
                }}
                disabled={selectedFacturas.length === 0}
                size="sm"
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pago Múltiple ({selectedFacturas.length})</span>
              </Button>
            )}
            <Button
              onClick={exportToExcel}
              disabled={selectedFacturas.length === 0}
              size="sm"
              className="flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Exportar a Excel</span>
            </Button>
          </div>
        </div>
      )}
      {/* Vista móvil */}
      <div className="block lg:hidden">
        <div className="space-y-4">
          {validFacturas.map(factura => (
            <Card key={factura.id} className="overflow-hidden">
              <CardContent className="p-4">
                {/* Checkbox de selección */}
                <div className="flex items-start space-x-3">
                  <Checkbox
                    checked={selectedFacturas.includes(factura.id)}
                    onCheckedChange={() => toggleSelection(factura.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-3">
                    {/* Header con número y estado */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-lg">
                        #{factura.numero_factura}
                      </div>
                      {factura.numero_serie && (
                        <div className="inline-flex items-center rounded-md bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 px-2 py-1 text-xs font-semibold text-white shadow-sm">
                          Serie {factura.numero_serie}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      {getClassificationBadge(factura.clasificacion, factura.es_nota_credito) || (
                        <Badge variant="outline" className="text-xs">Sin clasificar</Badge>
                      )}
                      {showOriginalClassification && factura.clasificacion_original && (
                        <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200 text-purple-700">
                          Origen: {factura.clasificacion_original === 'mercancia' ? 'Mercancía' : 'Gasto'}
                        </Badge>
                      )}
                      {getDaysIndicator(getDaysUntilDue(factura.fecha_vencimiento, factura.estado_mercancia))}
                    </div>
                  </div>

                  {/* Estado del Sistema */}
                  {showIngresoSistema && (
                    <div className="flex items-center justify-between">
                      {onIngresoSistemaClick ? (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={factura.ingresado_sistema === true}
                            onCheckedChange={() => {
                              onIngresoSistemaClick(factura);
                            }}
                          />
                          <span className="text-sm font-medium">Ingresado al Sistema</span>
                        </div>
                      ) : (
                        <span className="text-sm font-medium">Estado del Sistema</span>
                      )}
                      {getEstadoSistemaBadge(factura.ingresado_sistema)}
                    </div>
                  )}

                  {/* Información del emisor */}
                  <div className="space-y-1">
                    <div className="font-medium">{factura.emisor_nombre}</div>
                    <div className="text-sm text-muted-foreground flex items-center">
                      <span>NIT: {factura.emisor_nit}</span>
                    </div>
                  </div>

                  {/* Descripción */}
                  {factura.descripcion && (
                    <div className="text-sm">
                      <span className="font-medium">Descripción: </span>
                      {factura.descripcion}
                    </div>
                  )}

                  {/* Información adicional de notas de crédito */}
                  {factura.clasificacion === 'nota_credito' && getFacturaOriginalInfo(factura) && (
                    <div className="text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded border-l-2 border-red-500">
                      <span className="font-medium text-red-700 dark:text-red-300">Nota de Crédito:</span>
                      <div className="text-red-600 dark:text-red-400 text-xs">
                        Descuento de {formatCurrency(getFacturaOriginalInfo(factura)?.valor_descuento || 0)} aplicado a la factura #{getFacturaOriginalInfo(factura)?.numero_factura_original}
                      </div>
                    </div>
                  )}

                  {/* Mostrar notas de crédito aplicadas */}
                  {getNotasCreditoInfo(factura) && (
                    <div className="text-sm p-2 bg-green-50 dark:bg-green-900/20 rounded border-l-2 border-green-500">
                      <span className="font-medium text-green-700 dark:text-green-300">Notas de Crédito Aplicadas:</span>
                      {getNotasCreditoInfo(factura)?.map((nota: any, index: number) => (
                        <div key={index} className="text-green-600 dark:text-green-400 text-xs">
                          • #{nota.numero_factura}: {formatCurrency(nota.valor_descuento)}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fechas */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-muted-foreground">Emisión</div>
                        <div className="font-medium">
                          {formatFechaSafe(factura.fecha_emision || factura.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-muted-foreground">Vencimiento</div>
                        <div className="font-medium">
                          {formatFechaSafe(factura.fecha_vencimiento) || '-'}
                        </div>
                      </div>
                    </div>
                   </div>
                   
                   {/* Fecha de pago si está pagada */}
                   {factura.fecha_pago && (
                     <div className="flex items-center space-x-2 text-sm">
                       <CheckCircle className="w-4 h-4 text-green-600" />
                       <div>
                         <div className="text-green-600">Pagada el</div>
                         <div className="font-medium text-green-600">
                           {formatFechaSafe(factura.fecha_pago)}
                         </div>
                       </div>
                     </div>
                   )}

                   {/* Información financiera */}
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <div className="text-muted-foreground">Total</div>
                       <div className={`font-bold text-lg ${calcularTotalReal(factura) < factura.total_a_pagar && factura.clasificacion !== 'nota_credito' ? 'text-green-600' : ''}`}>
                         {showOriginalValueForNC && factura.clasificacion === 'nota_credito'
                           ? formatCurrency(factura.total_a_pagar)
                           : (factura.valor_real_a_pagar ? formatCurrency(factura.valor_real_a_pagar) : (factura.monto_pagado ? formatCurrency(factura.monto_pagado) : formatCurrency(calcularTotalReal(factura))))
                         }
                       </div>
                       {/* Mostrar valor original para notas de crédito relacionadas */}
                       {getValorOriginalNotaCredito(factura) && (
                         <div className="text-xs text-red-600 mt-1">
                           Valor original: {formatCurrency(getValorOriginalNotaCredito(factura)!)}
                         </div>
                       )}
                       {calcularTotalReal(factura) !== factura.total_a_pagar && factura.clasificacion !== 'nota_credito' && (
                         <div className="text-xs text-muted-foreground line-through">
                           Original: {formatCurrency(factura.total_a_pagar)}
                         </div>
                       )}
                       {/* Mostrar información de nota de crédito si aplica */}
                       {factura.clasificacion === 'nota_credito' && getFacturaOriginalInfo(factura) && (
                         <div className="text-xs text-red-600 mt-1">
                           Aplica a: #{getFacturaOriginalInfo(factura)?.numero_factura_original}
                         </div>
                       )}
                       {/* Mostrar notas de crédito aplicadas */}
                       {getNotasCreditoInfo(factura) && (
                         <div className="text-xs text-green-600 mt-1">
                           {getNotasCreditoInfo(factura)?.length} nota(s) de crédito aplicada(s)
                         </div>
                       )}
                       {/* Mostrar valor real a pagar si se requiere */}
                       {showValorRealAPagar && (
                         <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border-l-2 border-red-500">
                           <div className="text-xs text-red-700 dark:text-red-300 font-medium">Valor Real a Pagar:</div>
                           <div className="text-sm font-bold text-red-600">
                             {formatCurrency(calcularValorRealAPagar(factura))}
                           </div>
                         </div>
                       )}
                     </div>
                    {factura.factura_iva && (
                      <div>
                        <div className="text-muted-foreground">IVA</div>
                        <div className="font-medium">
                          {formatCurrency(factura.factura_iva)}
                          {factura.factura_iva_porcentaje && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({factura.factura_iva_porcentaje}%)
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Información adicional */}
                  <div className="flex flex-wrap gap-2 text-sm">
                    {factura.tiene_retencion && calcularMontoRetencionReal(factura) > 0 && (
                      <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 font-mono">
                        <Percent className="w-3 h-3 mr-1" />
                        Retención -{formatCompactCurrency(calcularMontoRetencionReal(factura))}
                      </Badge>
                    )}
                    {factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0 && (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 font-mono">
                        Pronto Pago -{formatCompactCurrency((obtenerBaseSinIVAOriginal(factura) * (factura.porcentaje_pronto_pago || 0)) / 100)}
                      </Badge>
                    )}
                    {factura.factura_iva && factura.factura_iva > 0 && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 font-mono">
                        IVA +{formatCompactCurrency(factura.factura_iva)}
                      </Badge>
                    )}
                  </div>

                  {/* Información de pago (si aplica) */}
                  {showPaymentInfo && factura.estado_mercancia === 'pagada' && (
                    <div className="space-y-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="font-medium text-green-800 dark:text-green-300">
                        Factura Pagada
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Método</div>
                          <Badge variant={factura.metodo_pago === 'Pago Banco' ? 'default' : 'secondary'}>
                            {factura.metodo_pago}
                          </Badge>
                        </div>
                        {(factura.valor_real_a_pagar || factura.monto_pagado) && (
                          <div>
                            <div className="text-muted-foreground">Monto pagado</div>
                            <div className="font-bold text-green-600">
                              {formatCurrency(factura.valor_real_a_pagar || factura.monto_pagado)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Acciones */}
                  {showActions && (
                  <div className="flex gap-2 pt-2 border-t">
                    {showClassifyButton && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onClassifyClick(factura)}
                      className="flex-1"
                    >
                      <Tag className="w-4 h-4 mr-1" />
                      Clasificar
                    </Button>
                    )}
                    
                    {((factura.clasificacion === 'mercancia' && factura.estado_mercancia !== 'pagada') || (factura.clasificacion === 'gasto' && (!factura.estado_mercancia || factura.estado_mercancia !== 'pagada'))) && onPayClick && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPayClick(factura)}
                        className="flex-1 border-green-200 text-green-700 hover:bg-green-50"
                      >
                        <CreditCard className="w-4 h-4 mr-1" />
                        Pagar
                      </Button>
                    )}

                    {/* Botón Nota de Crédito - Solo para facturas normales */}
                    {(!factura.es_nota_credito && factura.clasificacion !== 'nota_credito') && onNotaCreditoClick && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onNotaCreditoClick(factura)}
                        className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
                      >
                        <Minus className="w-4 h-4 mr-1" />
                        Nota Crédito
                      </Button>
                    )}

                    {/* Botón Editar */}
                    {showEditButton && onEditClick && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEditClick(factura)}
                        className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                    )}

                    {factura.pdf_file_path && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => viewPDF(factura)}
                        className="px-3"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      )}

                    {onSistematizarClick && showSistematizarButton && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-purple-200 text-purple-700 hover:bg-purple-50"
                          >
                            <FileCheck className="w-4 h-4 mr-1" />
                            Sistematizar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Sistematización</AlertDialogTitle>
                            <AlertDialogDescription>
                              ¿Está seguro que desea marcar la factura {factura.numero_factura} como sistematizada? Esta acción moverá la factura a la sección de facturas sistematizadas.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onSistematizarClick(factura)}>
                              Sistematizar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {allowDelete && (
                      <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="px-3 border-red-200 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará permanentemente la factura #{factura.numero_factura} de {factura.emisor_nombre}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(factura.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    )}
                  </div>
                  )}
                </div>
               </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Vista de escritorio */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="rounded-lg border bg-card">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10 align-middle">
                  <Checkbox
                    checked={selectedFacturas.length === validFacturas.length && validFacturas.length > 0}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Seleccionar todas las facturas"
                  />
                </TableHead>
                <TableHead className="font-semibold w-[180px]">Factura</TableHead>
                <TableHead className="font-semibold w-[130px]">Estado</TableHead>
                <TableHead className="font-semibold w-[120px]">Fechas</TableHead>
                <TableHead className="font-semibold w-[130px]">Montos</TableHead>
                {showValorRealAPagar && (
                  <TableHead className="font-semibold w-[110px]">Valor real</TableHead>
                )}
                <TableHead className="font-semibold text-center w-[50px]" title="Sistematizada">
                  <Archive className="w-4 h-4 mx-auto" />
                </TableHead>
                {showActions && (
                  <TableHead className="font-semibold text-center w-[130px]">Acciones</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {validFacturas.map(factura => (
                <TableRow
                  key={factura.id}
                  className={`hover:bg-muted/30 transition-colors ${
                    highlightedId === factura.id ? 'bg-yellow-100 dark:bg-yellow-900/30 animate-pulse' : ''
                  }`}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedFacturas.includes(factura.id)}
                      onCheckedChange={() => toggleSelection(factura.id)}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1.5">
                      <div className="text-xs font-semibold text-foreground">
                        #{factura.numero_factura}
                      </div>
                      {factura.numero_serie && (
                        <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0 bg-gradient-to-r from-blue-600 to-purple-500 text-white border-0">
                          S{factura.numero_serie}
                        </Badge>
                      )}
                      <div className="text-[11px] font-medium truncate" title={factura.emisor_nombre}>
                        {factura.emisor_nombre}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {factura.emisor_nit}
                      </div>
                      {factura.descripcion && (
                        <div className="text-[10px] text-muted-foreground truncate" title={factura.descripcion}>
                          {factura.descripcion}
                        </div>
                      )}
                      {factura.clasificacion === 'nota_credito' && getFacturaOriginalInfo(factura) && (
                        <Badge variant="outline" className="w-fit text-[9px] bg-red-50 text-red-600 border-red-200">
                          NC #{getFacturaOriginalInfo(factura)?.numero_factura_original}
                        </Badge>
                      )}
                      {getNotasCreditoInfo(factura) && (
                        <Badge variant="outline" className="w-fit text-[9px] bg-green-50 text-green-600 border-green-200">
                          {getNotasCreditoInfo(factura)?.length} NC
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1.5">
                      {getClassificationBadge(factura.clasificacion, factura.es_nota_credito) || (
                        <Badge variant="outline" className="w-fit text-[10px]">
                          Sin clasificar
                        </Badge>
                      )}
                      {getEstadoMercanciaBadge(factura.estado_mercancia)}
                      {getEstadoNotaCreditoBadge(factura.estado_nota_credito)}
                      {factura.metodo_pago && (
                        <div className="text-[10px] text-muted-foreground truncate" title={factura.metodo_pago}>
                          {factura.metodo_pago}
                        </div>
                      )}
                      {showPaymentInfo && factura.estado_mercancia === 'pagada' && (factura.valor_real_a_pagar || factura.monto_pagado) && (
                        <div className="text-[10px] font-semibold text-green-700">
                          {formatCompactCurrency(factura.valor_real_a_pagar || factura.monto_pagado || 0)}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1.5 text-[10px]">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-blue-500" />
                        <span className="font-medium text-foreground">
                          {formatFechaSafe(factura.fecha_emision || factura.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-orange-500" />
                        <span className="font-medium text-foreground">
                          {formatFechaSafe(factura.fecha_vencimiento) || '-'}
                        </span>
                      </div>
                      {renderDueBadge(getDaysUntilDue(factura.fecha_vencimiento, factura.estado_mercancia))}
                      {factura.fecha_pago && (
                        <div className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle className="w-3 h-3" />
                          <span className="font-medium">
                            {formatFechaSafe(factura.fecha_pago)}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>


                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-semibold text-foreground">
                        ${formatCompactCurrency(factura.total_a_pagar)}
                      </div>
                      {calcularTotalReal(factura) !== factura.total_a_pagar && factura.clasificacion !== 'nota_credito' && (
                        <div className="text-[10px] text-green-600">
                          Real: ${formatCompactCurrency(calcularTotalReal(factura))}
                        </div>
                      )}
                      {factura.factura_iva && (
                        <div className="text-[9px] text-muted-foreground">
                          IVA {formatCompactCurrency(factura.factura_iva)}
                        </div>
                      )}
                      {factura.tiene_retencion && calcularMontoRetencionReal(factura) > 0 && (
                        <div className="text-[9px] text-orange-600">
                          -Ret {formatCompactCurrency(calcularMontoRetencionReal(factura))}
                        </div>
                      )}
                      {factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0 && (
                        <div className="text-[9px] text-green-600">
                          -PP {formatCompactCurrency((obtenerBaseSinIVAOriginal(factura) * (factura.porcentaje_pronto_pago || 0)) / 100)}
                        </div>
                      )}
                      {(() => {
                        const descuentos = descuentosCache.get(factura.id);
                        if (!descuentos) return null;

                        const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
                          if (desc.tipo === 'porcentaje') {
                            return sum + (obtenerBaseSinIVAOriginal(factura) * desc.valor / 100);
                          }
                          return sum + desc.valor;
                        }, 0);

                        return totalDescuentos > 0 ? (
                          <div className="text-[9px] text-blue-600" title={descuentos.map((d: any) => `${d.concepto}: ${d.tipo === 'porcentaje' ? d.valor + '%' : formatCompactCurrency(d.valor)}`).join(', ')}>
                            -Desc {formatCompactCurrency(totalDescuentos)}
                          </div>
                        ) : null;
                      })()}
                      {/* Mostrar Notas de Crédito Aplicadas */}
                      {getNotasCreditoInfo(factura) && (() => {
                        const notasCredito = getNotasCreditoInfo(factura);
                        const totalNC = notasCredito?.reduce((sum: number, nc: any) => sum + (nc.valor_descuento || 0), 0) || 0;
                        return (
                          <div className="text-[9px] text-green-700 font-semibold bg-green-50 px-1 py-0.5 rounded" title={notasCredito?.map((nc: any) => `NC #${nc.numero_factura}: ${formatCompactCurrency(nc.valor_descuento)}`).join(', ')}>
                            -{notasCredito?.length} NC: {formatCompactCurrency(totalNC)}
                          </div>
                        );
                      })()}
                    </div>
                  </TableCell>

                  {/* Valor Real a Pagar */}
                  {showValorRealAPagar && (
                    <TableCell className="align-top">
                      <div className="bg-rose-50 px-2 py-1.5 rounded">
                        <div className="text-sm font-semibold text-rose-700">
                          ${formatCompactCurrency(calcularValorRealAPagar(factura))}
                        </div>
                        <div className="text-[9px] text-rose-600">
                          Valor real
                        </div>
                      </div>
                    </TableCell>
                  )}

                  {/* Checkbox Sistematizada */}
                  <TableCell className="align-top text-center">
                    <Checkbox
                      checked={factura.ingresado_sistema === true}
                      onCheckedChange={() => {
                        if (onIngresoSistemaClick) {
                          onIngresoSistemaClick(factura);
                        }
                      }}
                      title={factura.ingresado_sistema ? "Sistematizada" : "No sistematizada"}
                    />
                  </TableCell>

                  {/* Acciones */}
                  {showActions && (
                  <TableCell className="align-top">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {showClassifyButton && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onClassifyClick(factura)}
                        className="h-7 w-7 p-0 hover:bg-blue-50"
                        title="Clasificar"
                      >
                        <Tag className="w-3 h-3" />
                      </Button>
                      )}

                      {((factura.clasificacion === 'mercancia' && factura.estado_mercancia !== 'pagada') || (factura.clasificacion === 'gasto' && (!factura.estado_mercancia || factura.estado_mercancia !== 'pagada'))) && onPayClick && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onPayClick(factura)}
                          className="h-7 w-7 p-0 hover:bg-green-50"
                          title="Pagar"
                        >
                          <CreditCard className="w-3 h-3 text-green-600" />
                        </Button>
                      )}

                      {/* Botón Nota de Crédito - Solo para facturas normales */}
                      {(!factura.es_nota_credito && factura.clasificacion !== 'nota_credito') && onNotaCreditoClick && (
                       <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onNotaCreditoClick(factura)}
                          className="h-7 w-7 p-0 hover:bg-red-50"
                          title="Nota Crédito"
                        >
                          <Minus className="w-3 h-3 text-red-600" />
                        </Button>
                      )}

                      {/* Botón Editar */}
                      {showEditButton && onEditClick && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditClick(factura)}
                          className="h-7 w-7 p-0 hover:bg-blue-50"
                          title="Editar"
                        >
                          <Edit className="w-3 h-3 text-blue-600" />
                        </Button>
                      )}

                      {factura.pdf_file_path && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewPDF(factura)}
                          className="h-7 w-7 p-0 hover:bg-gray-50"
                          title="Ver PDF Factura"
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                      )}

                      {/* Botón para descargar comprobante de pago - solo para facturas pagadas */}
                      {factura.estado_mercancia === 'pagada' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => descargarComprobante(factura.id)}
                          className="h-7 w-7 p-0 hover:bg-green-50"
                          title="Descargar Comprobante de Pago"
                        >
                          <Download className="w-3 h-3 text-green-600" />
                        </Button>
                      )}

                      {factura.estado_mercancia === 'pagada' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => descargarSoportePago(factura.id)}
                          className="h-7 w-7 p-0 hover:bg-amber-50"
                          title="Descargar Soporte del Pago"
                        >
                          <Paperclip className="w-3 h-3 text-amber-600" />
                        </Button>
                      )}

                      {onSistematizarClick && showSistematizarButton && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:bg-purple-50"
                              title="Sistematizar"
                            >
                              <FileCheck className="w-3 h-3 text-purple-600" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar Sistematización</AlertDialogTitle>
                              <AlertDialogDescription>
                                ¿Está seguro que desea marcar la factura {factura.numero_factura} como sistematizada? Esta acción moverá la factura a la sección de facturas sistematizadas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onSistematizarClick(factura)}>
                                Sistematizar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      {allowDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:bg-red-50"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3 text-red-600" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente la factura #{factura.numero_factura} de {factura.emisor_nombre}.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(factura.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* PDF Viewer Modal */}
      <PDFViewer
        isOpen={isPDFViewerOpen}
        onClose={closePDFViewer}
        pdfUrl={pdfUrl}
        title={selectedFacturaForPDF ? `Factura #${selectedFacturaForPDF.numero_factura} - ${selectedFacturaForPDF.emisor_nombre}` : "Visualizador de PDF"}
        descuentosAntesIva={selectedFacturaForPDF?.descuentos_antes_iva}
        totalAPagar={selectedFacturaForPDF?.total_a_pagar}
        totalSinIva={selectedFacturaForPDF?.total_sin_iva}
      />
    </div>
  );
}
