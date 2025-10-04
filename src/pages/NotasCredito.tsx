import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModernLayout } from '@/components/ModernLayout';
import { FacturasTable } from '@/components/FacturasTable';
import { Minus, FileText } from 'lucide-react';

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

interface NotaCreditoConFactura {
  notaCredito: Factura;
  facturaAfectada: Factura | null;
}

export default function NotasCredito() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [notasConFacturas, setNotasConFacturas] = useState<NotaCreditoConFactura[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchNotasCredito();
    }
  }, [user]);

  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (highlightId) {
      setHighlightedId(highlightId);
      // Scroll to the element
      setTimeout(() => {
        const element = document.getElementById(`factura-${highlightId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      const timeout = setTimeout(() => {
        setHighlightedId(null);
        searchParams.delete('highlight');
        setSearchParams(searchParams);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [searchParams, setSearchParams]);

  const fetchNotasCredito = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .eq('clasificacion', 'nota_credito')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFacturas(data || []);

      // Obtener las facturas afectadas para cada nota de crédito
      const notasConFacturasTemp: NotaCreditoConFactura[] = [];

      for (const nc of data || []) {
        let facturaAfectada: Factura | null = null;

        // Intentar obtener el número de factura original desde las notas
        if (nc.notas) {
          try {
            const notasData = JSON.parse(nc.notas);
            // El campo correcto es 'numero_factura_aplicada' (no 'numero_factura_original')
            if (notasData.tipo === 'nota_credito' && notasData.numero_factura_aplicada) {
              // Buscar la factura por número
              const { data: facturaData, error: facturaError } = await supabase
                .from('facturas')
                .select('*')
                .eq('numero_factura', notasData.numero_factura_aplicada)
                .single();

              if (!facturaError && facturaData) {
                facturaAfectada = facturaData;
              }
            }
          } catch (e) {
            console.error('Error parsing notas:', e);
          }
        }

        notasConFacturasTemp.push({
          notaCredito: nc,
          facturaAfectada
        });
      }

      setNotasConFacturas(notasConFacturasTemp);
    } catch (error) {
      console.error('Error fetching notas de crédito:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  // Separar por estado
  const aplicadas = notasConFacturas.filter(nc => nc.notaCredito.estado_nota_credito === 'aplicada');
  const anuladas = notasConFacturas.filter(nc => nc.notaCredito.estado_nota_credito === 'anulada');
  const pendientes = notasConFacturas.filter(nc => !nc.notaCredito.estado_nota_credito || nc.notaCredito.estado_nota_credito === 'pendiente');

  return (
    <ModernLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Minus className="w-8 h-8 text-red-600" />
              Notas de Crédito
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestión de notas de crédito aplicadas a facturas
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Notas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{facturas.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Aplicadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{aplicadas.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Anuladas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{anuladas.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pendientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{pendientes.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Notas Aplicadas */}
        {aplicadas.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Badge variant="outline" className="bg-green-100 text-green-800">
                {aplicadas.length}
              </Badge>
              Notas de Crédito Aplicadas
            </h2>
            {aplicadas.map((item) => (
              <Card key={item.notaCredito.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-600">Nota de Crédito</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FacturasTable
                    facturas={[item.notaCredito]}
                    onClassifyClick={() => {}}
                    refreshData={fetchNotasCredito}
                    showActions={false}
                    showClassifyButton={false}
                    showOriginalValueForNC={true}
                    highlightedId={highlightedId}
                  />
                  {item.facturaAfectada && (
                    <div className="border-t pt-2 mt-1">
                      <div className="text-sm font-medium text-green-700 mb-1">↓ Factura Afectada</div>
                      <FacturasTable
                        facturas={[item.facturaAfectada]}
                        onClassifyClick={() => {}}
                        refreshData={fetchNotasCredito}
                        showActions={false}
                        showClassifyButton={false}
                        highlightedId={highlightedId}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Notas Anuladas */}
        {anuladas.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Badge variant="outline" className="bg-gray-100 text-gray-800">
                {anuladas.length}
              </Badge>
              Notas de Crédito Anuladas
            </h2>
            {anuladas.map((item) => (
              <Card key={item.notaCredito.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-600">Nota de Crédito</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FacturasTable
                    facturas={[item.notaCredito]}
                    onClassifyClick={() => {}}
                    refreshData={fetchNotasCredito}
                    showActions={false}
                    showClassifyButton={false}
                    showOriginalValueForNC={true}
                    highlightedId={highlightedId}
                  />
                  {item.facturaAfectada && (
                    <div className="border-t pt-2 mt-1">
                      <div className="text-sm font-medium text-green-700 mb-1">↓ Factura Afectada</div>
                      <FacturasTable
                        facturas={[item.facturaAfectada]}
                        onClassifyClick={() => {}}
                        refreshData={fetchNotasCredito}
                        showActions={false}
                        showClassifyButton={false}
                        highlightedId={highlightedId}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Notas Pendientes */}
        {pendientes.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Badge variant="outline" className="bg-orange-100 text-orange-800">
                {pendientes.length}
              </Badge>
              Notas de Crédito Pendientes
            </h2>
            {pendientes.map((item) => (
              <Card key={item.notaCredito.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-600">Nota de Crédito</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FacturasTable
                    facturas={[item.notaCredito]}
                    onClassifyClick={() => {}}
                    refreshData={fetchNotasCredito}
                    showActions={true}
                    showClassifyButton={false}
                    showOriginalValueForNC={true}
                    highlightedId={highlightedId}
                  />
                  {item.facturaAfectada && (
                    <div className="border-t pt-2 mt-1">
                      <div className="text-sm font-medium text-green-700 mb-1">↓ Factura Afectada</div>
                      <FacturasTable
                        facturas={[item.facturaAfectada]}
                        onClassifyClick={() => {}}
                        refreshData={fetchNotasCredito}
                        showActions={false}
                        showClassifyButton={false}
                        highlightedId={highlightedId}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {facturas.length === 0 && !isLoading && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay notas de crédito</h3>
                <p className="text-muted-foreground">
                  Las notas de crédito aplicadas aparecerán aquí
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                Cargando notas de crédito...
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ModernLayout>
  );
}
