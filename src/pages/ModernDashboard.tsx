import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Package, CreditCard, Calculator, Receipt, Minus, Percent, Banknote, User, CalendarIcon, X, Plus, Filter, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FacturasTable } from '@/components/FacturasTable';
import { FacturaClassificationDialog } from '@/components/FacturaClassificationDialog';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ModernLayout } from '@/components/ModernLayout';
import { ModernStatsCard } from '@/components/ModernStatsCard';

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
  metodo_pago?: string | null;
  uso_pronto_pago?: boolean | null;
  monto_pagado?: number | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
}

export default function ModernDashboard() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(true);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isClassificationDialogOpen, setIsClassificationDialogOpen] = useState(false);
  const [selectedPaymentFactura, setSelectedPaymentFactura] = useState<Factura | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  const fetchFacturas = async () => {
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .order('created_at', { ascending: true });
      
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

  const filterFacturasByType = (type: string | null) => {
    if (type === null) return facturas.filter(f => !f.clasificacion);
    return facturas.filter(f => f.clasificacion === type);
  };

  const filterFacturasByMercanciaState = (estado: string | null) => {
    const mercanciaFacturas = facturas.filter(f => f.clasificacion === 'mercancia');
    if (estado === null) {
      return mercanciaFacturas.filter(f => f.estado_mercancia === 'pendiente' || !f.estado_mercancia);
    }
    return mercanciaFacturas.filter(f => f.estado_mercancia === estado);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  // Funciones de cálculo con filtros de fecha
  const calcularTotalPagadoBancos = (fechaInicio?: Date | null, fechaFin?: Date | null) => {
    let mercanciaFacturasPagadas = facturas.filter(f => 
      f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Pago Banco'
    );
    
    if (fechaInicio && fechaFin) {
      mercanciaFacturasPagadas = mercanciaFacturasPagadas.filter(f => {
        if (!f.fecha_emision) return false;
        const fechaEmision = new Date(f.fecha_emision);
        return fechaEmision >= fechaInicio && fechaEmision <= fechaFin;
      });
    }
    
    return mercanciaFacturasPagadas.reduce((total, factura) => total + (factura.monto_pagado || factura.total_a_pagar), 0);
  };

  const calcularTotalPagadoTobias = (fechaInicio?: Date | null, fechaFin?: Date | null) => {
    let mercanciaFacturasPagadas = facturas.filter(f => 
      f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Pago Tobías'
    );
    
    if (fechaInicio && fechaFin) {
      mercanciaFacturasPagadas = mercanciaFacturasPagadas.filter(f => {
        if (!f.fecha_emision) return false;
        const fechaEmision = new Date(f.fecha_emision);
        return fechaEmision >= fechaInicio && fechaEmision <= fechaFin;
      });
    }
    
    return mercanciaFacturasPagadas.reduce((total, factura) => total + (factura.monto_pagado || factura.total_a_pagar), 0);
  };

  const calcularTotalFacturas = () => {
    const mercanciaFacturasPendientes = facturas.filter(f => 
      f.clasificacion === 'mercancia' && (f.estado_mercancia === 'pendiente' || !f.estado_mercancia)
    );
    return mercanciaFacturasPendientes.reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalImpuestos = () => {
    const mercanciaFacturasPendientes = facturas.filter(f => 
      f.clasificacion === 'mercancia' && (f.estado_mercancia === 'pendiente' || !f.estado_mercancia)
    );
    return mercanciaFacturasPendientes.reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const getFilteredPaidFacturas = () => {
    let mercanciaFacturasPagadas = facturas.filter(f => 
      f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada'
    );
    
    if (dateFrom && dateTo) {
      mercanciaFacturasPagadas = mercanciaFacturasPagadas.filter(f => {
        if (!f.fecha_emision) return false;
        const fechaEmision = new Date(f.fecha_emision);
        return fechaEmision >= dateFrom && fechaEmision <= dateTo;
      });
    }
    
    return mercanciaFacturasPagadas;
  };

  const clearDateFilter = () => {
    setDateFrom(null);
    setDateTo(null);
  };

  if (loading) {
    return (
      <ModernLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </ModernLayout>
    );
  }

  return (
    <ModernLayout
      title="Dashboard"
      subtitle="Gestión completa de facturas y proveedores"
      actions={
        <Button className="bg-gradient-primary hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Factura
        </Button>
      }
    >
      {loadingFacturas ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : facturas.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No hay facturas</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Las facturas aparecerán aquí cuando lleguen a través del sistema automatizado
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ModernStatsCard
              title="Sin Clasificar"
              value={filterFacturasByType(null).length.toString()}
              icon={FileText}
              color="red"
              trend={{ value: "12%", isPositive: false }}
            />
            <ModernStatsCard
              title="Mercancía"
              value={filterFacturasByType('mercancia').length.toString()}
              icon={Package}
              color="blue"
              trend={{ value: "8%", isPositive: true }}
            />
            <ModernStatsCard
              title="Gastos"
              value={filterFacturasByType('gasto').length.toString()}
              icon={CreditCard}
              color="green"
              trend={{ value: "5%", isPositive: true }}
            />
            <ModernStatsCard
              title="Total Valor"
              value={formatCurrency(facturas.reduce((sum, f) => sum + f.total_a_pagar, 0))}
              icon={TrendingUp}
              color="purple"
              trend={{ value: "15%", isPositive: true }}
            />
          </div>

          {/* Main Content Tabs */}
          <Card className="border-0 shadow-lg bg-card/50 backdrop-blur-sm">
            <CardContent className="p-0">
              <Tabs defaultValue="sin-clasificar" className="w-full">
                <div className="px-6 pt-6">
                  <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 h-12">
                    <TabsTrigger 
                      value="sin-clasificar" 
                      className="data-[state=active]:bg-background data-[state=active]:shadow-sm h-10 font-medium"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Sin Clasificar ({filterFacturasByType(null).length})
                    </TabsTrigger>
                    <TabsTrigger 
                      value="mercancia"
                      className="data-[state=active]:bg-background data-[state=active]:shadow-sm h-10 font-medium"
                    >
                      <Package className="w-4 h-4 mr-2" />
                      Mercancía ({filterFacturasByType('mercancia').length})
                    </TabsTrigger>
                    <TabsTrigger 
                      value="gasto"
                      className="data-[state=active]:bg-background data-[state=active]:shadow-sm h-10 font-medium"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Gastos ({filterFacturasByType('gasto').length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="sin-clasificar" className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <ModernStatsCard
                      title="Total Impuestos"
                      value={formatCurrency(calcularTotalImpuestos())}
                      icon={Receipt}
                      color="red"
                    />
                    <ModernStatsCard
                      title="Total Facturas"
                      value={formatCurrency(calcularTotalFacturas())}
                      icon={Calculator}
                      color="blue"
                    />
                  </div>

                  {filterFacturasByType(null).length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
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

                <TabsContent value="mercancia" className="p-6">
                  <Tabs defaultValue="pendientes" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-muted/30 p-1 h-10 mb-6">
                      <TabsTrigger value="pendientes" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        Pendientes ({filterFacturasByMercanciaState(null).length})
                      </TabsTrigger>
                      <TabsTrigger value="pagadas" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        Pagadas ({filterFacturasByMercanciaState('pagada').length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="pendientes">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                        <ModernStatsCard
                          title="Total Impuestos"
                          value={formatCurrency(calcularTotalImpuestos())}
                          icon={Receipt}
                          color="red"
                        />
                        <ModernStatsCard
                          title="Total Retenciones"
                          value={formatCurrency(0)}
                          icon={Minus}
                          color="green"
                        />
                        <ModernStatsCard
                          title="Ahorro Pronto Pago"
                          value={formatCurrency(0)}
                          icon={Percent}
                          color="purple"
                        />
                        <ModernStatsCard
                          title="Total Facturas"
                          value={formatCurrency(calcularTotalFacturas())}
                          icon={Calculator}
                          color="blue"
                        />
                      </div>

                      {filterFacturasByMercanciaState(null).length === 0 ? (
                        <div className="text-center py-8">
                          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">No hay facturas pendientes de pago</p>
                        </div>
                      ) : (
                        <FacturasTable
                          facturas={filterFacturasByMercanciaState(null)}
                          onClassifyClick={handleClassifyClick}
                          onPayClick={handlePayClick}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="pagadas">
                      {/* Filtro de fechas */}
                      <Card className="mb-6 bg-muted/20 border-dashed">
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center space-x-2">
                              <Filter className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium">Filtrar por fecha:</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-[140px] justify-start text-left font-normal",
                                      !dateFrom && "text-muted-foreground"
                                    )}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Desde"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={dateFrom}
                                    onSelect={setDateFrom}
                                    disabled={(date) => date > new Date()}
                                    initialFocus
                                    className={cn("p-3 pointer-events-auto")}
                                  />
                                </PopoverContent>
                              </Popover>
                              
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-[140px] justify-start text-left font-normal",
                                      !dateTo && "text-muted-foreground"
                                    )}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Hasta"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={dateTo}
                                    onSelect={setDateTo}
                                    disabled={(date) => date > new Date() || (dateFrom && date < dateFrom)}
                                    initialFocus
                                    className={cn("p-3 pointer-events-auto")}
                                  />
                                </PopoverContent>
                              </Popover>
                              
                              {(dateFrom || dateTo) && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={clearDateFilter}
                                  className="h-9 px-2"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            
                            {dateFrom && dateTo && (
                              <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                                {format(dateFrom, "dd/MM/yyyy")} - {format(dateTo, "dd/MM/yyyy")}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                        <ModernStatsCard
                          title="Pagado por Bancos"
                          value={formatCurrency(calcularTotalPagadoBancos(dateFrom, dateTo))}
                          icon={Banknote}
                          color="blue"
                        />
                        <ModernStatsCard
                          title="Pagado por Tobías"
                          value={formatCurrency(calcularTotalPagadoTobias(dateFrom, dateTo))}
                          icon={User}
                          color="orange"
                        />
                        <ModernStatsCard
                          title="Ahorro Pronto Pago"
                          value={formatCurrency(0)}
                          icon={Percent}
                          color="purple"
                        />
                        <ModernStatsCard
                          title="Total Pagado"
                          value={formatCurrency(calcularTotalPagadoBancos(dateFrom, dateTo) + calcularTotalPagadoTobias(dateFrom, dateTo))}
                          icon={Calculator}
                          color="green"
                        />
                      </div>

                      {getFilteredPaidFacturas().length === 0 ? (
                        <div className="text-center py-8">
                          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">
                            {dateFrom && dateTo ? 'No hay facturas pagadas en el rango de fechas seleccionado' : 'No hay facturas pagadas'}
                          </p>
                        </div>
                      ) : (
                        <FacturasTable
                          facturas={getFilteredPaidFacturas()}
                          onClassifyClick={handleClassifyClick}
                          showPaymentInfo={true}
                        />
                      )}
                    </TabsContent>
                  </Tabs>
                </TabsContent>

                <TabsContent value="gasto" className="p-6">
                  {filterFacturasByType('gasto').length === 0 ? (
                    <div className="text-center py-8">
                      <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No hay facturas de gastos</p>
                    </div>
                  ) : (
                    <FacturasTable
                      facturas={filterFacturasByType('gasto')}
                      onClassifyClick={handleClassifyClick}
                      onPayClick={handlePayClick}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialogs */}
      {selectedFactura && (
        <FacturaClassificationDialog
          factura={selectedFactura}
          isOpen={isClassificationDialogOpen}
          onClose={() => setIsClassificationDialogOpen(false)}
          onClassificationUpdated={handleClassificationUpdated}
        />
      )}

      {selectedPaymentFactura && (
        <PaymentMethodDialog
          factura={selectedPaymentFactura}
          isOpen={isPaymentDialogOpen}
          onClose={() => setIsPaymentDialogOpen(false)}
          onPaymentProcessed={handlePaymentProcessed}
        />
      )}
    </ModernLayout>
  );
}