import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Building2, Tag, CreditCard, Eye } from 'lucide-react';
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

interface ProveedorGroup {
  proveedor: string;
  nit: string;
  facturas: Factura[];
  totalFacturas: number;
  valorTotal: number;
}

interface ProveedorAccordionProps {
  grupo: ProveedorGroup;
  onClassifyClick: (factura: Factura) => void;
  onPayClick: (factura: Factura) => void;
  isExpanded: boolean;
  formatCurrency: (amount: number) => string;
}

export function ProveedorAccordion({ 
  grupo, 
  onClassifyClick, 
  onPayClick, 
  isExpanded, 
  formatCurrency 
}: ProveedorAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsOpen(isExpanded);
  }, [isExpanded]);

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

  const getEstadoBadge = (factura: Factura) => {
    if (factura.clasificacion === 'mercancia') {
      const estado = factura.estado_mercancia || 'pendiente';
      if (estado === 'pagada') {
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
            Pagada
          </span>
        );
      } else {
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
            Pendiente
          </span>
        );
      }
    }
    return null;
  };

  return (
    <Card className="border border-border/50 hover:border-border transition-colors">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="transition-transform duration-200">
                  {isOpen ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">{grupo.proveedor}</h3>
                  <p className="text-sm text-muted-foreground">NIT: {grupo.nit}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 text-right">
                <div>
                  <p className="text-sm text-muted-foreground">Facturas</p>
                  <p className="font-medium">{grupo.totalFacturas}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total</p>
                  <p className="font-medium text-lg">{formatCurrency(grupo.valorTotal)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="border-t border-border/50">
            {grupo.facturas.map((factura) => (
              <div 
                key={factura.id} 
                className="flex items-center justify-between p-4 border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center space-x-4 flex-1">
                  <div className="w-4 h-4 bg-primary/20 rounded"></div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-medium">{factura.numero_factura}</h4>
                      {getClassificationBadge(factura.clasificacion)}
                      {getEstadoBadge(factura)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {factura.descripcion || 'Sin descripción'}
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>
                        Fecha: {factura.fecha_emision ? 
                          new Date(factura.fecha_emision).toLocaleDateString('es-CO') : 
                          new Date(factura.created_at).toLocaleDateString('es-CO')
                        }
                      </span>
                      {factura.numero_serie && (
                        <span>Serie: {factura.numero_serie}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="font-medium text-lg">{formatCurrency(factura.total_a_pagar)}</p>
                    {factura.factura_iva && (
                      <p className="text-xs text-muted-foreground">
                        IVA: {formatCurrency(factura.factura_iva)}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onClassifyClick(factura)}
                      className="transition-all duration-200 hover:scale-105"
                    >
                      <Tag className="w-3 h-3 mr-1" />
                      Clasificar
                    </Button>
                    
                    {factura.clasificacion === 'mercancia' && factura.estado_mercancia !== 'pagada' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPayClick(factura)}
                        className="transition-all duration-200 hover:scale-105 border-green-200 text-green-700 hover:bg-green-50"
                      >
                        <CreditCard className="w-3 h-3 mr-1" />
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
                        <Eye className="w-3 h-3 mr-1" />
                        Ver
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}