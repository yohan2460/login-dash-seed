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
    <Card className="border border-border/50 hover:border-border hover:shadow-md transition-all duration-200">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-6 hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="transition-transform duration-200">
                  {isOpen ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-lg text-foreground truncate">
                    {grupo.proveedor}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    NIT: <span className="font-mono">{grupo.nit}</span>
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-6">
                <div className="text-center min-w-[80px]">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Facturas
                  </p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {grupo.totalFacturas}
                  </p>
                </div>
                <div className="text-right min-w-[140px]">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Valor Total
                  </p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(grupo.valorTotal)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="border-t border-border/50 bg-muted/20">
            {grupo.facturas.map((factura, index) => (
              <div 
                key={factura.id} 
                className={`flex items-center justify-between p-5 ${
                  index !== grupo.facturas.length - 1 ? 'border-b border-border/30' : ''
                } hover:bg-muted/30 transition-colors`}
              >
                <div className="flex items-center space-x-4 flex-1">
                  <div className="w-1 h-12 bg-primary/30 rounded-full"></div>
                  
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center space-x-3 flex-wrap gap-2">
                      <h4 className="font-semibold text-foreground text-base">
                        {factura.numero_factura}
                      </h4>
                      {getClassificationBadge(factura.clasificacion)}
                      {getEstadoBadge(factura)}
                    </div>
                    
                    <p className="text-sm text-muted-foreground max-w-md">
                      {factura.descripcion || 'Sin descripción disponible'}
                    </p>
                    
                    <div className="flex items-center space-x-6 text-xs">
                      <div className="flex items-center space-x-1">
                        <span className="text-muted-foreground">📅</span>
                        <span className="text-muted-foreground">
                          {factura.fecha_emision ? 
                            new Date(factura.fecha_emision).toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            }) : 
                            new Date(factura.created_at).toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'short', 
                              year: 'numeric'
                            })
                          }
                        </span>
                      </div>
                      {factura.numero_serie && (
                        <div className="flex items-center space-x-1">
                          <span className="text-muted-foreground">🏷️</span>
                          <span className="text-muted-foreground font-mono">
                            {factura.numero_serie}
                          </span>
                        </div>
                      )}
                      {factura.factura_iva && (
                        <div className="flex items-center space-x-1">
                          <span className="text-muted-foreground">💰</span>
                          <span className="text-muted-foreground">
                            IVA: {formatCurrency(factura.factura_iva)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">
                      {formatCurrency(factura.total_a_pagar)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total a pagar
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onClassifyClick(factura)}
                      className="transition-all duration-200 hover:scale-105 hover:bg-blue-50 hover:border-blue-200"
                    >
                      <Tag className="w-3 h-3 mr-1" />
                      <span className="hidden sm:inline">Clasificar</span>
                    </Button>
                    
                    {factura.clasificacion === 'mercancia' && factura.estado_mercancia !== 'pagada' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPayClick(factura)}
                        className="transition-all duration-200 hover:scale-105 border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300"
                      >
                        <CreditCard className="w-3 h-3 mr-1" />
                        <span className="hidden sm:inline">Pagar</span>
                      </Button>
                    )}
                    
                    {factura.pdf_file_path && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => viewPDF(factura)}
                        className="transition-all duration-200 hover:scale-105 hover:bg-gray-50 hover:border-gray-300"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        <span className="hidden sm:inline">Ver</span>
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