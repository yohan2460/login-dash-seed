import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, FileText, Package, CreditCard, Calculator, Receipt, Minus, Percent } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FacturasTable } from '@/components/FacturasTable';
import { FacturaClassificationDialog } from '@/components/FacturaClassificationDialog';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  nombre_carpeta_factura: string;
  factura_cufe: string;
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
}
export default function Dashboard() {
  const {
    user,
    signOut,
    loading
  } = useAuth();
  const {
    toast
  } = useToast();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(true);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isClassificationDialogOpen, setIsClassificationDialogOpen] = useState(false);
  const [selectedPaymentFactura, setSelectedPaymentFactura] = useState<Factura | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  // Redirigir a login si no está autenticado
  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }
  const fetchFacturas = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('facturas').select('*').order('created_at', {
        ascending: true
      });
      if (error) throw error;
      setFacturas(data || []);
    } catch (error) {
      console.error('Error fetching facturas:', error);
    } finally {
      setLoadingFacturas(false);
    }
  };
  const handleClassifyClick = (factura: Factura) => {
    setSelectedFactura(factura);
    setIsClassificationDialogOpen(true);
  };

  const handleClassificationUpdated = () => {
    fetchFacturas();
  };

  const handlePayClick = (factura: Factura) => {
    setSelectedPaymentFactura(factura);
    setIsPaymentDialogOpen(true);
  };

  const handlePaymentProcessed = () => {
    fetchFacturas();
  };
  const handleSignOut = async () => {
    await signOut();
  };
  const filterFacturasByType = (type: string | null) => {
    if (type === null) return facturas.filter(f => !f.clasificacion);
    return facturas.filter(f => f.clasificacion === type);
  };

  const filterFacturasByMercanciaState = (estado: string | null) => {
    const mercanciaFacturas = facturas.filter(f => f.clasificacion === 'mercancia');
    if (estado === null) return mercanciaFacturas.filter(f => !f.estado_mercancia);
    return mercanciaFacturas.filter(f => f.estado_mercancia === estado);
  };

  // Funciones para calcular totales
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularTotalImpuestos = () => {
    return facturas.reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const calcularTotalFacturas = () => {
    return facturas.reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalRetenciones = () => {
    return facturas.reduce((total, factura) => total + (factura.monto_retencion || 0), 0);
  };

  const calcularTotalAhorroProntoPago = () => {
    return facturas.reduce((total, factura) => {
      if (factura.porcentaje_pronto_pago) {
        return total + ((factura.total_a_pagar * factura.porcentaje_pronto_pago) / 100);
      }
      return total;
    }, 0);
  };
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  return <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-semibold">Gestión de Facturas</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="transition-all duration-300 hover:scale-105">
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
            <Card className="shadow-medium">
              <CardHeader>
                <CardTitle className="text-2xl bg-gradient-primary bg-clip-text text-transparent">
                  Gestión de Facturas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingFacturas ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : facturas.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No hay facturas</h3>
                    <p className="text-muted-foreground">
                      Las facturas aparecerán aquí cuando lleguen por n8n
                    </p>
                  </div>
                ) : (
                  <Tabs defaultValue="sin-clasificar" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="sin-clasificar" className="flex items-center space-x-2">
                        <FileText className="w-4 h-4" />
                        <span>Sin Clasificar ({filterFacturasByType(null).length})</span>
                      </TabsTrigger>
                      <TabsTrigger value="mercancia" className="flex items-center space-x-2">
                        <Package className="w-4 h-4" />
                        <span>Mercancía ({filterFacturasByType('mercancia').length})</span>
                      </TabsTrigger>
                      <TabsTrigger value="gasto" className="flex items-center space-x-2">
                        <CreditCard className="w-4 h-4" />
                        <span>Gastos ({filterFacturasByType('gasto').length})</span>
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="sin-clasificar" className="mt-6">
                      {filterFacturasByType(null).length === 0 ? (
                        <div className="text-center py-8">
                          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-muted-foreground">No hay facturas sin clasificar</p>
                        </div>
                      ) : (
                        <FacturasTable
                          facturas={filterFacturasByType(null)}
                          onClassifyClick={handleClassifyClick}
                          onPayClick={handlePayClick}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="mercancia" className="mt-6">
                      {/* Tarjetas de Resumen - Solo en Mercancía */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <Card className="border-l-4 border-l-red-500">
                          <CardContent className="p-4">
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-red-100 rounded-lg">
                                <Receipt className="w-5 h-5 text-red-600" />
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Total Impuestos</p>
                                <p className="text-xl font-bold text-red-600">
                                  {formatCurrency(calcularTotalImpuestos())}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-l-4 border-l-green-500">
                          <CardContent className="p-4">
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-green-100 rounded-lg">
                                <Minus className="w-5 h-5 text-green-600" />
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Total Retenciones</p>
                                <p className="text-xl font-bold text-green-600">
                                  {formatCurrency(calcularTotalRetenciones())}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-l-4 border-l-purple-500">
                          <CardContent className="p-4">
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-purple-100 rounded-lg">
                                <Percent className="w-5 h-5 text-purple-600" />
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Ahorro Pronto Pago</p>
                                <p className="text-xl font-bold text-purple-600">
                                  {formatCurrency(calcularTotalAhorroProntoPago())}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-l-4 border-l-blue-500">
                          <CardContent className="p-4">
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-blue-100 rounded-lg">
                                <Calculator className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Total Facturas</p>
                                <p className="text-xl font-bold text-blue-600">
                                  {formatCurrency(calcularTotalFacturas())}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Pestañas anidadas para estados de Mercancía */}
                      <Tabs defaultValue="todas-mercancia" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-accent/20 border border-border/50 rounded-lg p-1">
                          <TabsTrigger 
                            value="todas-mercancia" 
                            className="data-[state=active]:bg-background data-[state=active]:shadow-sm font-medium"
                          >
                            Todas ({filterFacturasByType('mercancia').length})
                          </TabsTrigger>
                          <TabsTrigger 
                            value="pagada" 
                            className="data-[state=active]:bg-background data-[state=active]:shadow-sm font-medium"
                          >
                            Pagadas ({filterFacturasByMercanciaState('pagada').length})
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="todas-mercancia" className="mt-4">
                          {filterFacturasByType('mercancia').length === 0 ? (
                            <div className="text-center py-8">
                              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                              <p className="text-muted-foreground">No hay facturas de mercancía</p>
                            </div>
                          ) : (
                            <FacturasTable
                              facturas={filterFacturasByType('mercancia')}
                              onClassifyClick={handleClassifyClick}
                              onPayClick={handlePayClick}
                            />
                          )}
                        </TabsContent>

                        <TabsContent value="pagada" className="mt-4">
                          {filterFacturasByMercanciaState('pagada').length === 0 ? (
                            <div className="text-center py-8">
                              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                              <p className="text-muted-foreground">No hay facturas pagadas</p>
                            </div>
                          ) : (
                            <FacturasTable
                              facturas={filterFacturasByMercanciaState('pagada')}
                              onClassifyClick={handleClassifyClick}
                              showPaymentInfo={true}
                            />
                          )}
                        </TabsContent>
                      </Tabs>
                    </TabsContent>

                    <TabsContent value="gasto" className="mt-6">
                      {filterFacturasByType('gasto').length === 0 ? (
                        <div className="text-center py-8">
                          <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-muted-foreground">No hay facturas de gastos</p>
                        </div>
                      ) : (
                        <FacturasTable
                          facturas={filterFacturasByType('gasto')}
                          onClassifyClick={handleClassifyClick}
                        />
                      )}
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>

            </Card>

            <FacturaClassificationDialog
              factura={selectedFactura}
              isOpen={isClassificationDialogOpen}
              onClose={() => setIsClassificationDialogOpen(false)}
              onClassificationUpdated={handleClassificationUpdated}
            />

            <PaymentMethodDialog
              factura={selectedPaymentFactura}
              isOpen={isPaymentDialogOpen}
              onClose={() => setIsPaymentDialogOpen(false)}
              onPaymentProcessed={handlePaymentProcessed}
            />
        </div>
      </main>
    </div>;
}