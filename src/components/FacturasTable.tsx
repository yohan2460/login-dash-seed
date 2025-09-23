import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Tag, CreditCard, Calendar, Clock, AlertTriangle, CheckCircle, Trash2, FileCheck, Download, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import * as XLSX from 'xlsx';
import { useState } from 'react';

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
}

export function FacturasTable({ facturas, onClassifyClick, onPayClick, showPaymentInfo = false, onDelete, onSistematizarClick, showSistematizarButton = false, allowDelete = true, showOriginalClassification = false, onNotaCreditoClick, refreshData, showActions = true, showClassifyButton = true, showValorRealAPagar = false }: FacturasTableProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedFacturas, setSelectedFacturas] = useState<string[]>([]);
  const [deletingFactura, setDeletingFactura] = useState<string | null>(null);

  // Validar que facturas sea un array válido con protección contra null
  const validFacturas = Array.isArray(facturas) ? facturas.filter(f => f && f.id && typeof f.id === 'string' && f.id.length > 0) : [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularMontoRetencionReal = (factura: Factura) => {
    if (!factura.monto_retencion || factura.monto_retencion === 0) return 0;
    return factura.total_a_pagar * (factura.monto_retencion / 100);
  };

  const calcularValorRealAPagar = (factura: Factura) => {
    let valorReal = factura.total_a_pagar;

    // Restar retención si aplica
    if (factura.tiene_retencion && factura.monto_retencion) {
      const retencion = calcularMontoRetencionReal(factura);
      valorReal -= retencion;
    }

    // Restar descuento por pronto pago si está disponible
    // El descuento se calcula sobre el total a pagar (incluyendo IVA)
    if (factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0) {
      const descuento = factura.total_a_pagar * (factura.porcentaje_pronto_pago / 100);
      valorReal -= descuento;
    }

    return valorReal;
  };

  // Función para calcular el total real de una factura considerando notas de crédito
  const calcularTotalReal = (factura: Factura) => {
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

    // Para facturas normales, verificar si tiene notas de crédito aplicadas
    if (factura.notas && factura.clasificacion !== 'nota_credito') {
      try {
        const notasData = JSON.parse(factura.notas);
        console.log('📊 Procesando factura:', factura.numero_factura, 'notasData:', notasData);
        
        // Buscar si tiene notas de crédito aplicadas
        if (notasData.notas_credito && notasData.notas_credito.length > 0) {
          // Calcular el total de descuentos
          const totalDescuentos = notasData.notas_credito.reduce((sum: number, nc: any) => {
            return sum + (nc.valor_descuento || 0);
          }, 0);
          
          console.log('💰 Total descuentos:', totalDescuentos, 'Total original:', factura.total_a_pagar);
          
          // Retornar el valor original menos los descuentos
          const nuevoTotal = factura.total_a_pagar - totalDescuentos;
          console.log('🔢 Nuevo total calculado:', nuevoTotal);
          return nuevoTotal;
        }
        
        // Si existe total_con_descuentos (método alternativo)
        if (notasData.total_con_descuentos !== undefined) {
          console.log('📈 Usando total_con_descuentos:', notasData.total_con_descuentos);
          return notasData.total_con_descuentos;
        }
      } catch (error) {
        console.error('Error parsing notas:', error);
      }
    }

    return factura.total_a_pagar;
  };

  // Función para obtener el valor original de una nota de crédito
  const getValorOriginalNotaCredito = (factura: Factura) => {
    if (factura.clasificacion === 'nota_credito' && calcularTotalReal(factura) === 0) {
      return factura.total_a_pagar; // Valor original de la nota de crédito
    }
    return null;
  };

  // Función para obtener información de notas de crédito aplicadas
  const getNotasCreditoInfo = (factura: Factura) => {
    if (!factura.notas) return null;
    
    try {
      const notasData = JSON.parse(factura.notas);
      if (notasData.notas_credito && notasData.notas_credito.length > 0) {
        return notasData.notas_credito;
      }
    } catch (error) {
      return null;
    }
    
    return null;
  };

  // Función para obtener información de factura original (para notas de crédito)
  const getFacturaOriginalInfo = (factura: Factura) => {
    if (factura.clasificacion !== 'nota_credito' || !factura.notas) return null;
    
    try {
      const notasData = JSON.parse(factura.notas);
      if (notasData.tipo === 'nota_credito') {
        return {
          numero_factura_original: notasData.numero_factura_original,
          emisor_original: notasData.emisor_original,
          valor_descuento: notasData.valor_descuento
        };
      }
    } catch (error) {
      return null;
    }
    
    return null;
  };

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
        window.open(data.signedUrl, '_blank');
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
    const excelData = selectedData.map(factura => ({
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
      'Tiene Retención': factura.tiene_retencion ? 'Sí' : 'No',
      'Monto Retención': calcularMontoRetencionReal(factura),
      'Porcentaje Pronto Pago': factura.porcentaje_pronto_pago || 0,
      'Uso Pronto Pago': factura.uso_pronto_pago ? 'Sí' : 'No',
      'Estado Mercancía': factura.estado_mercancia || '',
      'Método de Pago': factura.metodo_pago || '',
      'Monto Pagado': factura.monto_pagado || 0,
      'Fecha de Emisión': factura.fecha_emision ? new Date(factura.fecha_emision).toLocaleDateString('es-CO') : '',
      'Fecha de Vencimiento': factura.fecha_vencimiento ? new Date(factura.fecha_vencimiento).toLocaleDateString('es-CO') : '',
      'Fecha de Pago': factura.fecha_pago ? new Date(factura.fecha_pago).toLocaleDateString('es-CO') : '',
      'Fecha de Creación': new Date(factura.created_at).toLocaleDateString('es-CO')
    }));

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

  const getClassificationBadge = (clasificacion: string | null | undefined, esNotaCredito?: boolean) => {
    // Verificar si es nota de crédito por clasificación (versión temporal)
    if (esNotaCredito || clasificacion === 'nota_credito') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
          <Minus className="w-3 h-3 mr-1" />
          Nota Crédito
        </span>
      );
    }
    
    if (!clasificacion) return null;
    
    const styles = {
      mercancia: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      gasto: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      nota_credito: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    };

    const labels = {
      mercancia: 'Mercancía',
      gasto: 'Gasto',
      nota_credito: 'Nota Crédito'
    };

    const icon = clasificacion === 'nota_credito' ? <Minus className="w-3 h-3 mr-1" /> : null;

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[clasificacion as keyof typeof styles]}`}>
        {icon}
        {labels[clasificacion as keyof typeof labels]}
      </span>
    );
  };

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
                        <div className="text-sm text-muted-foreground">
                          Serie: {factura.numero_serie}
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
                          {factura.fecha_emision ? (
                            new Date(factura.fecha_emision).toLocaleDateString('es-CO')
                          ) : (
                            new Date(factura.created_at).toLocaleDateString('es-CO')
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-muted-foreground">Vencimiento</div>
                        <div className="font-medium">
                          {factura.fecha_vencimiento ? (
                            new Date(factura.fecha_vencimiento).toLocaleDateString('es-CO')
                          ) : '-'}
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
                           {new Date(factura.fecha_pago).toLocaleDateString('es-CO')}
                         </div>
                       </div>
                     </div>
                   )}

                   {/* Información financiera */}
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <div className="text-muted-foreground">Total</div>
                       <div className={`font-bold text-lg ${calcularTotalReal(factura) < factura.total_a_pagar && factura.clasificacion !== 'nota_credito' ? 'text-green-600' : ''}`}>
                         {factura.monto_pagado ? formatCurrency(factura.monto_pagado) : formatCurrency(calcularTotalReal(factura))}
                       </div>
                       {/* Mostrar valor original para notas de crédito relacionadas */}
                       {getValorOriginalNotaCredito(factura) && (
                         <div className="text-xs text-muted-foreground">
                           ({formatCurrency(getValorOriginalNotaCredito(factura)!)})
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
                    {factura.tiene_retencion && (
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Retención
                        {factura.monto_retencion && (
                          <span className="ml-1">
                            {formatCurrency(calcularMontoRetencionReal(factura))}
                          </span>
                        )}
                      </Badge>
                    )}
                    {factura.porcentaje_pronto_pago && (
                      <Badge variant="secondary" className="text-xs text-green-700">
                        Pronto pago {factura.porcentaje_pronto_pago}%
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
                        {factura.monto_pagado && (
                          <div>
                            <div className="text-muted-foreground">Monto pagado</div>
                            <div className="font-bold text-green-600">
                              {formatCurrency(factura.monto_pagado)}
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
      <div className="hidden lg:block">
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                 <TableHead className="w-10">
                   <Checkbox
                     checked={selectedFacturas.length === validFacturas.length}
                     onCheckedChange={toggleSelectAll}
                   />
                 </TableHead>
                <TableHead className="font-semibold">Factura</TableHead>
                <TableHead className="font-semibold">Emisor</TableHead>
                <TableHead className="font-semibold">Estado</TableHead>
                <TableHead className="font-semibold">Fechas</TableHead>
                <TableHead className="font-semibold">Información Fiscal</TableHead>
                {showPaymentInfo && (
                  <TableHead className="font-semibold">Información de Pago</TableHead>
                )}
                <TableHead className="font-semibold">Total</TableHead>
                {showValorRealAPagar && (
                  <TableHead className="font-semibold">Valor Real a Pagar</TableHead>
                )}
                {showActions && (
                <TableHead className="font-semibold text-center">Acciones</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {validFacturas.map(factura => (
                <TableRow key={factura.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <Checkbox
                      checked={selectedFacturas.includes(factura.id)}
                      onCheckedChange={() => toggleSelection(factura.id)}
                    />
                  </TableCell>
                  {/* Información de factura */}
                  <TableCell className="font-medium">
                    <div className="space-y-1">
                      <div className="font-semibold">#{factura.numero_factura}</div>
                      {factura.numero_serie && (
                        <div className="text-xs text-muted-foreground">
                          Serie: {factura.numero_serie}
                        </div>
                      )}
                      {factura.descripcion && (
                        <div className="text-xs text-muted-foreground max-w-32 truncate" title={factura.descripcion}>
                          {factura.descripcion}
                        </div>
                      )}
                      {/* Información de asociaciones para notas de crédito */}
                      {factura.clasificacion === 'nota_credito' && getFacturaOriginalInfo(factura) && (
                        <div className="text-xs text-red-600 max-w-32 truncate" title={`Aplica a: ${getFacturaOriginalInfo(factura)?.numero_factura_original}`}>
                          → #{getFacturaOriginalInfo(factura)?.numero_factura_original}
                        </div>
                      )}
                      {getNotasCreditoInfo(factura) && (
                        <div className="text-xs text-green-600 max-w-32 truncate">
                          {getNotasCreditoInfo(factura)?.length} NC aplicadas
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Emisor */}
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{factura.emisor_nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        NIT: {factura.emisor_nit}
                      </div>
                    </div>
                  </TableCell>

                  {/* Estado y clasificación */}
                  <TableCell>
                    <div className="space-y-2">
                      {getClassificationBadge(factura.clasificacion, factura.es_nota_credito) || (
                        <Badge variant="outline" className="text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Sin clasificar
                        </Badge>
                      )}
                      {showOriginalClassification && factura.clasificacion_original && (
                        <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200 text-purple-700">
                          Origen: {factura.clasificacion_original === 'mercancia' ? 'Mercancía' : 'Gasto'}
                        </Badge>
                      )}
                      {factura.estado_mercancia === 'pagada' && (
                        <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Pagada
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Fechas */}
                  <TableCell>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Emisión:</span>
                        <span>
                          {factura.fecha_emision ? (
                            new Date(factura.fecha_emision).toLocaleDateString('es-CO')
                          ) : (
                            new Date(factura.created_at).toLocaleDateString('es-CO')
                          )}
                        </span>
                      </div>
                       <div className="flex items-center space-x-2">
                         <Clock className="w-3 h-3 text-muted-foreground" />
                         <span className="text-xs text-muted-foreground">Vence:</span>
                         <span>
                           {factura.fecha_vencimiento ? (
                             new Date(factura.fecha_vencimiento).toLocaleDateString('es-CO')
                           ) : '-'}
                         </span>
                         {getDaysIndicator(getDaysUntilDue(factura.fecha_vencimiento, factura.estado_mercancia))}
                       </div>
                       {factura.fecha_pago && (
                         <div className="flex items-center space-x-2">
                           <CheckCircle className="w-3 h-3 text-green-600" />
                           <span className="text-xs text-green-600">Pagada:</span>
                           <span className="text-green-600 font-medium">
                             {new Date(factura.fecha_pago).toLocaleDateString('es-CO')}
                           </span>
                         </div>
                       )}
                    </div>
                  </TableCell>

                  {/* Información fiscal */}
                  <TableCell>
                    <div className="space-y-2 text-sm">
                      {factura.factura_iva && (
                        <div>
                          <span className="text-xs text-muted-foreground">IVA: </span>
                          <span className="font-medium">
                            {formatCurrency(factura.factura_iva)}
                            {factura.factura_iva_porcentaje && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({factura.factura_iva_porcentaje}%)
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {factura.tiene_retencion && (
                        <div>
                          <span className="text-xs text-muted-foreground">Retención: </span>
                          <span className="font-medium text-green-600">
                            {factura.monto_retencion ? formatCurrency(calcularMontoRetencionReal(factura)) : 'Sí'}
                          </span>
                        </div>
                      )}
                      {factura.porcentaje_pronto_pago && (
                        <div>
                          <span className="text-xs text-muted-foreground">Pronto pago: </span>
                          <span className="font-medium text-green-600">
                            {factura.porcentaje_pronto_pago}%
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Información de pago */}
                  {showPaymentInfo && (
                    <TableCell>
                      {factura.estado_mercancia === 'pagada' ? (
                        <div className="space-y-2 text-sm">
                          {factura.metodo_pago && (
                            <Badge variant={factura.metodo_pago === 'Pago Banco' ? 'default' : 'secondary'}>
                              {factura.metodo_pago}
                            </Badge>
                          )}
                          {factura.monto_pagado && (
                            <div>
                              <div className="text-green-600 font-bold">
                                {formatCurrency(factura.monto_pagado)}
                              </div>
                              {factura.uso_pronto_pago && factura.porcentaje_pronto_pago && (
                                <div className="text-xs text-green-600">
                                  Ahorro: {formatCurrency(factura.total_a_pagar - factura.monto_pagado)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : '-'}
                    </TableCell>
                  )}

                   {/* Total */}
                   <TableCell>
                     <div className={`font-bold text-lg ${calcularTotalReal(factura) < factura.total_a_pagar && factura.clasificacion !== 'nota_credito' ? 'text-green-600' : ''}`}>
                       {factura.monto_pagado ? formatCurrency(factura.monto_pagado) : formatCurrency(calcularTotalReal(factura))}
                     </div>
                     {/* Mostrar valor original para notas de crédito relacionadas */}
                     {getValorOriginalNotaCredito(factura) && (
                       <div className="text-xs text-muted-foreground">
                         ({formatCurrency(getValorOriginalNotaCredito(factura)!)})
                       </div>
                     )}
                     {calcularTotalReal(factura) !== factura.total_a_pagar && factura.clasificacion !== 'nota_credito' && (
                       <div className="text-xs text-muted-foreground line-through">
                         Original: {formatCurrency(factura.total_a_pagar)}
                       </div>
                     )}
                     
                     {/* Información de nota de crédito si aplica */}
                     {factura.clasificacion === 'nota_credito' && getFacturaOriginalInfo(factura) && (
                       <div className="text-xs text-red-600 mt-1">
                         Aplica a: #{getFacturaOriginalInfo(factura)?.numero_factura_original}
                       </div>
                     )}
                     
                     {/* Mostrar notas de crédito aplicadas */}
                     {getNotasCreditoInfo(factura) && (
                       <div className="text-xs text-green-600 mt-1">
                         {getNotasCreditoInfo(factura)?.length} nota(s) de crédito
                       </div>
                     )}
                     
                     {factura.metodo_pago && (
                       <div className="mt-1">
                         <Badge 
                           variant="secondary" 
                           className="text-xs"
                         >
                           {factura.metodo_pago}
                         </Badge>
                         <div className="text-xs text-muted-foreground mt-1">
                           Factura: {formatCurrency(factura.total_a_pagar)}
                         </div>
                       </div>
                     )}
                   </TableCell>

                  {/* Valor Real a Pagar */}
                  {showValorRealAPagar && (
                    <TableCell>
                      <div className="font-bold text-lg text-red-600">
                        {formatCurrency(calcularValorRealAPagar(factura))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Después de retenciones y descuentos
                      </div>
                    </TableCell>
                  )}

                  {/* Acciones */}
                  {showActions && (
                  <TableCell>
                    <div className="flex items-center justify-center space-x-2">
                      {showClassifyButton && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onClassifyClick(factura)}
                        className="transition-all duration-200 hover:scale-105"
                      >
                        <Tag className="w-4 h-4" />
                      </Button>
                      )}
                      
                      {((factura.clasificacion === 'mercancia' && factura.estado_mercancia !== 'pagada') || (factura.clasificacion === 'gasto' && (!factura.estado_mercancia || factura.estado_mercancia !== 'pagada'))) && onPayClick && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onPayClick(factura)}
                          className="transition-all duration-200 hover:scale-105 text-green-700 hover:bg-green-50"
                        >
                          <CreditCard className="w-4 h-4" />
                        </Button>
                      )}

                      {/* Botón Nota de Crédito - Solo para facturas normales */}
                      {(!factura.es_nota_credito && factura.clasificacion !== 'nota_credito') && onNotaCreditoClick && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onNotaCreditoClick(factura)}
                          className="transition-all duration-200 hover:scale-105 text-red-700 hover:bg-red-50"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {factura.pdf_file_path && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewPDF(factura)}
                          className="transition-all duration-200 hover:scale-105"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}

                      {onSistematizarClick && showSistematizarButton && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="transition-all duration-200 hover:scale-105 text-purple-700 hover:bg-purple-50"
                            >
                              <FileCheck className="w-4 h-4" />
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
                              className="transition-all duration-200 hover:scale-105 text-red-700 hover:bg-red-50"
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
                  </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}