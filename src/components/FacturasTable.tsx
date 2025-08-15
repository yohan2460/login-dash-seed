import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Tag, CreditCard } from 'lucide-react';
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
}

interface FacturasTableProps {
  facturas: Factura[];
  onClassifyClick: (factura: Factura) => void;
  onPayClick?: (factura: Factura) => void;
  showPaymentInfo?: boolean;
}

export function FacturasTable({ facturas, onClassifyClick, onPayClick, showPaymentInfo = false }: FacturasTableProps) {
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
      gastos: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    };

    const labels = {
      mercancia: 'Mercancía',
      gastos: 'Gasto'
    };

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[clasificacion as keyof typeof styles]}`}>
        {labels[clasificacion as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N° Serie</TableHead>
            <TableHead>Número de Factura</TableHead>
            <TableHead>Emisor</TableHead>
            <TableHead>Clasificación</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Fecha Emisión</TableHead>
            <TableHead>Fecha Vencimiento</TableHead>
            {showPaymentInfo && (
              <>
                <TableHead>Método de Pago</TableHead>
                <TableHead>Pronto Pago</TableHead>
                <TableHead>Monto Pagado</TableHead>
              </>
            )}
            <TableHead>Retención</TableHead>
            <TableHead>Pronto Pago</TableHead>
            <TableHead>IVA</TableHead>
            <TableHead>% IVA</TableHead>
            <TableHead>Total a Pagar</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {facturas.map(factura => (
            <TableRow key={factura.id} className="hover:bg-muted/50">
              <TableCell className="font-medium">
                {factura.numero_serie || '-'}
              </TableCell>
              <TableCell className="font-medium">
                {factura.numero_factura}
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{factura.emisor_nombre}</div>
                  <div className="text-sm text-muted-foreground">
                    NIT: {factura.emisor_nit}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {getClassificationBadge(factura.clasificacion) || (
                  <span className="text-sm text-muted-foreground">Sin clasificar</span>
                )}
              </TableCell>
              <TableCell>
                <div className="max-w-32 truncate" title={factura.descripcion || ''}>
                  {factura.descripcion || '-'}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {factura.fecha_emision ? (
                    new Date(factura.fecha_emision).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })
                  ) : (
                    new Date(factura.created_at).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {factura.fecha_vencimiento ? (
                    new Date(factura.fecha_vencimiento).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })
                  ) : '-'}
                </div>
              </TableCell>
              
              {showPaymentInfo && (
                <>
                  <TableCell>
                    <div className="text-sm">
                      {factura.metodo_pago ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          factura.metodo_pago === 'Pago Banco' 
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                        }`}>
                          {factura.metodo_pago}
                        </span>
                      ) : '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {factura.uso_pronto_pago !== null ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          factura.uso_pronto_pago 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
                        }`}>
                          {factura.uso_pronto_pago ? 'Con descuento' : 'Sin descuento'}
                        </span>
                      ) : '-'}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {factura.monto_pagado ? (
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
                    ) : '-'}
                  </TableCell>
                </>
              )}
              <TableCell>
                {factura.tiene_retencion ? (
                  <div>
                    <span className="text-xs text-green-600 font-medium">Sí</span>
                    {factura.monto_retencion && (
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(factura.monto_retencion)}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">No</span>
                )}
              </TableCell>
              <TableCell>
                {factura.porcentaje_pronto_pago ? (
                  <div>
                    <span className="text-xs font-medium">{factura.porcentaje_pronto_pago}%</span>
                    <div className="text-xs text-green-600">
                      -{formatCurrency((factura.total_a_pagar * factura.porcentaje_pronto_pago) / 100)}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="font-medium">
                {factura.factura_iva ? formatCurrency(factura.factura_iva) : '-'}
              </TableCell>
              <TableCell className="font-medium">
                {factura.factura_iva_porcentaje ? `${factura.factura_iva_porcentaje}%` : '-'}
              </TableCell>
              <TableCell className="font-medium">
                {formatCurrency(factura.total_a_pagar)}
              </TableCell>
              <TableCell>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onClassifyClick(factura)}
                    className="transition-all duration-200 hover:scale-105"
                  >
                    <Tag className="w-4 h-4 mr-1" />
                    Clasificar
                  </Button>
                  
                  {factura.clasificacion === 'mercancia' && factura.estado_mercancia !== 'pagada' && onPayClick && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPayClick(factura)}
                      className="transition-all duration-200 hover:scale-105 border-green-200 text-green-700 hover:bg-green-50"
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
                      className="transition-all duration-200 hover:scale-105"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Ver
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}