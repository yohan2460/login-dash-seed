import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Eye, Tag, CreditCard, Calendar, Clock, AlertTriangle, CheckCircle, Trash2, FileCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  metodo_pago?: string | null;
  uso_pronto_pago?: boolean | null;
  monto_pagado?: number | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
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
}

export function FacturasTable({ facturas, onClassifyClick, onPayClick, showPaymentInfo = false, onDelete, onSistematizarClick, showSistematizarButton = false, allowDelete = true }: FacturasTableProps) {
  const { toast } = useToast();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
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

  const getClassificationBadge = (clasificacion: string | null | undefined) => {
    if (!clasificacion) return null;
    
    const styles = {
      mercancia: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      gasto: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    };

    const labels = {
      mercancia: 'Mercancía',
      gasto: 'Gasto'
    };

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[clasificacion as keyof typeof styles]}`}>
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
      const { error } = await supabase
        .from('facturas')
        .delete()
        .eq('id', facturaId);

      if (error) throw error;

      toast({
        title: "Factura eliminada",
        description: "La factura ha sido eliminada exitosamente",
      });

      if (onDelete) {
        onDelete(facturaId);
      }
    } catch (error) {
      console.error('Error deleting factura:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la factura",
        variant: "destructive"
      });
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
      {/* Vista móvil */}
      <div className="block lg:hidden">
        <div className="space-y-4">
          {facturas.map(factura => (
            <Card key={factura.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="space-y-3">
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
                      {getClassificationBadge(factura.clasificacion) || (
                        <Badge variant="outline" className="text-xs">Sin clasificar</Badge>
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
                       <div className="font-bold text-lg">
                         {factura.monto_pagado ? formatCurrency(factura.monto_pagado) : formatCurrency(factura.total_a_pagar)}
                       </div>
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
                            {formatCurrency(factura.monto_retencion)}
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
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onClassifyClick(factura)}
                      className="flex-1"
                    >
                      <Tag className="w-4 h-4 mr-1" />
                      Clasificar
                    </Button>
                    
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
                <TableHead className="font-semibold">Factura</TableHead>
                <TableHead className="font-semibold">Emisor</TableHead>
                <TableHead className="font-semibold">Estado</TableHead>
                <TableHead className="font-semibold">Fechas</TableHead>
                <TableHead className="font-semibold">Información Fiscal</TableHead>
                {showPaymentInfo && (
                  <TableHead className="font-semibold">Información de Pago</TableHead>
                )}
                <TableHead className="font-semibold">Total</TableHead>
                <TableHead className="font-semibold text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facturas.map(factura => (
                <TableRow key={factura.id} className="hover:bg-muted/30 transition-colors">
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
                      {getClassificationBadge(factura.clasificacion) || (
                        <Badge variant="outline" className="text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Sin clasificar
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
                            {factura.monto_retencion ? formatCurrency(factura.monto_retencion) : 'Sí'}
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
                     <div className="font-bold text-lg">
                       {factura.monto_pagado ? formatCurrency(factura.monto_pagado) : formatCurrency(factura.total_a_pagar)}
                     </div>
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

                  {/* Acciones */}
                  <TableCell>
                    <div className="flex items-center justify-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onClassifyClick(factura)}
                        className="transition-all duration-200 hover:scale-105"
                      >
                        <Tag className="w-4 h-4" />
                      </Button>
                      
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}