import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { 
  FileText, Package, CreditCard, TrendingUp, Receipt, 
  Calculator, Minus, Percent, Filter, CalendarIcon 
} from 'lucide-react';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
import { FacturaClassificationDialog } from '@/components/FacturaClassificationDialog';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
import { ModernLayout } from '@/components/ModernLayout';

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
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(true);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isClassificationDialogOpen, setIsClassificationDialogOpen] = useState(false);
  const [selectedPaymentFactura, setSelectedPaymentFactura] = useState<Factura | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [activeSubSection, setActiveSubSection] = useState<string>('pendientes');

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

  // Filtering functions
  const filterFacturasByType = (type: string | null) => {
    return facturas.filter(f => f.clasificacion === type);
  };

  const filterFacturasByMercanciaState = (estado: string | null) => {
    const mercanciaFacturas = facturas.filter(f => f.clasificacion === 'mercancia');
    if (estado === null) {
      return mercanciaFacturas.filter(f => f.estado_mercancia !== 'pagada');
    }
    return mercanciaFacturas.filter(f => f.estado_mercancia === estado);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularTotalPagadoBancos = (filtrarPorFechas = true) => {
    let facturasPagadas = facturas.filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Pago Banco');
    
    if (filtrarPorFechas && (dateFrom || dateTo)) {
      facturasPagadas = facturasPagadas.filter(factura => {
        if (!factura.fecha_emision) return false;
        const fechaEmision = new Date(factura.fecha_emision);
        
        if (dateFrom && fechaEmision < dateFrom) return false;
        if (dateTo && fechaEmision > dateTo) return false;
        
        return true;
      });
    }
    
    return facturasPagadas.reduce((total, factura) => total + (factura.monto_pagado || 0), 0);
  };

  const calcularTotalPagadoTobias = (filtrarPorFechas = true) => {
    let facturasPagadas = facturas.filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Pago Tobías');
    
    if (filtrarPorFechas && (dateFrom || dateTo)) {
      facturasPagadas = facturasPagadas.filter(factura => {
        if (!factura.fecha_emision) return false;
        const fechaEmision = new Date(factura.fecha_emision);
        
        if (dateFrom && fechaEmision < dateFrom) return false;
        if (dateTo && fechaEmision > dateTo) return false;
        
        return true;
      });
    }
    
    return facturasPagadas.reduce((total, factura) => total + (factura.monto_pagado || 0), 0);
  };

  const calcularTotalFacturas = () => {
    return facturas
      .filter(f => f.clasificacion === null)
      .reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalImpuestos = () => {
    return facturas
      .filter(f => f.clasificacion === null)
      .reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const getFilteredPaidFacturas = () => {
    let facturasPagadas = facturas.filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada');
    
    if (dateFrom || dateTo) {
      facturasPagadas = facturasPagadas.filter(factura => {
        if (!factura.fecha_emision) return false;
        const fechaEmision = new Date(factura.fecha_emision);
        
        if (dateFrom && fechaEmision < dateFrom) return false;
        if (dateTo && fechaEmision > dateTo) return false;
        
        return true;
      });
    }
    
    return facturasPagadas;
  };

  const clearDateFilter = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
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
        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <div className="w-72 flex-shrink-0">
            <Card className="h-fit sticky top-6">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Categorías</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-1">
                  <Button
                    variant={activeSection === 'overview' ? 'secondary' : 'ghost'}
                    className="w-full justify-start h-12 px-4"
                    onClick={() => setActiveSection('overview')}
                  >
                    <TrendingUp className="w-4 h-4 mr-3" />
                    <div className="flex-1 text-left">
                      <div className="font-medium">Resumen General</div>
                      <div className="text-xs text-muted-foreground">{facturas.length} facturas</div>
                    </div>
                  </Button>
                  
                  <Button
                    variant={activeSection === 'sin-clasificar' ? 'secondary' : 'ghost'}
                    className="w-full justify-start h-12 px-4"
                    onClick={() => setActiveSection('sin-clasificar')}
                  >
                    <FileText className="w-4 h-4 mr-3" />
                    <div className="flex-1 text-left">
                      <div className="font-medium">Sin Clasificar</div>
                      <div className="text-xs text-muted-foreground">{filterFacturasByType(null).length} facturas</div>
                    </div>
                  </Button>
                  
                  <div className="pl-4 space-y-1">
                    <Button
                      variant={activeSection === 'mercancia' && activeSubSection === 'pendientes' ? 'secondary' : 'ghost'}
                      className="w-full justify-start h-10 px-4"
                      onClick={() => {
                        setActiveSection('mercancia');
                        setActiveSubSection('pendientes');
                      }}
                    >
                      <Package className="w-4 h-4 mr-3" />
                      <div className="flex-1 text-left">
                        <div className="font-medium">Mercancía - Pendientes</div>
                        <div className="text-xs text-muted-foreground">{filterFacturasByMercanciaState(null).length} facturas</div>
                      </div>
                    </Button>
                    
                    <Button
                      variant={activeSection === 'mercancia' && activeSubSection === 'pagadas' ? 'secondary' : 'ghost'}
                      className="w-full justify-start h-10 px-4"
                      onClick={() => {
                        setActiveSection('mercancia');
                        setActiveSubSection('pagadas');
                      }}
                    >
                      <Package className="w-4 h-4 mr-3" />
                      <div className="flex-1 text-left">
                        <div className="font-medium">Mercancía - Pagadas</div>
                        <div className="text-xs text-muted-foreground">{filterFacturasByMercanciaState('pagada').length} facturas</div>
                      </div>
                    </Button>
                  </div>
                  
                  <Button
                    variant={activeSection === 'gastos' ? 'secondary' : 'ghost'}
                    className="w-full justify-start h-12 px-4"
                    onClick={() => setActiveSection('gastos')}
                  >
                    <CreditCard className="w-4 h-4 mr-3" />
                    <div className="flex-1 text-left">
                      <div className="font-medium">Gastos</div>
                      <div className="text-xs text-muted-foreground">{filterFacturasByType('gasto').length} facturas</div>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 space-y-6">
            
            {/* Overview Section */}
            {activeSection === 'overview' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <ModernStatsCard
                    title="Sin Clasificar"
                    value={filterFacturasByType(null).length.toString()}
                    icon={FileText}
                    color="red"
                  />
                  <ModernStatsCard
                    title="Mercancía"
                    value={filterFacturasByType('mercancia').length.toString()}
                    icon={Package}
                    color="blue"
                  />
                  <ModernStatsCard
                    title="Gastos"
                    value={filterFacturasByType('gasto').length.toString()}
                    icon={CreditCard}
                    color="green"
                  />
                  <ModernStatsCard
                    title="Total Valor"
                    value={formatCurrency(facturas.reduce((sum, f) => sum + f.total_a_pagar, 0))}
                    icon={TrendingUp}
                    color="purple"
                  />
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Todas las Facturas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FacturasTable
                      facturas={facturas}
                      onClassifyClick={handleClassifyClick}
                      onPayClick={handlePayClick}
                    />
                  </CardContent>
                </Card>
              </>
            )}

            {/* Sin Clasificar Section */}
            {activeSection === 'sin-clasificar' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                <Card>
                  <CardHeader>
                    <CardTitle>Facturas Sin Clasificar</CardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              </>
            )}

            {/* Mercancía Section */}
            {activeSection === 'mercancia' && (
              <>
                {activeSubSection === 'pendientes' ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

                    <Card>
                      <CardHeader>
                        <CardTitle>Facturas Pendientes de Pago</CardTitle>
                      </CardHeader>
                      <CardContent>
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
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <>
                    {/* Filtro de fechas para pagadas */}
                    <Card className="bg-muted/20 border-dashed">
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
                                />
                              </PopoverContent>
                            </Popover>
                            
                            {(dateFrom || dateTo) && (
                              <Button variant="outline" size="sm" onClick={clearDateFilter}>
                                Limpiar
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <ModernStatsCard
                        title="Pagado por Bancos"
                        value={formatCurrency(calcularTotalPagadoBancos())}
                        icon={CreditCard}
                        color="blue"
                      />
                      <ModernStatsCard
                        title="Pagado por Tobías"
                        value={formatCurrency(calcularTotalPagadoTobias())}
                        icon={Package}
                        color="green"
                      />
                      <ModernStatsCard
                        title="Ahorro Pronto Pago"
                        value={formatCurrency(getFilteredPaidFacturas().reduce((total, factura) => {
                          if (factura.uso_pronto_pago && factura.porcentaje_pronto_pago) {
                            return total + (factura.total_a_pagar * factura.porcentaje_pronto_pago / 100);
                          }
                          return total;
                        }, 0))}
                        icon={Percent}
                        color="purple"
                      />
                      <ModernStatsCard
                        title="Total Facturas"
                        value={formatCurrency(getFilteredPaidFacturas().reduce((sum, f) => sum + f.total_a_pagar, 0))}
                        icon={Calculator}
                        color="red"
                      />
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Facturas Pagadas</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {getFilteredPaidFacturas().length === 0 ? (
                          <div className="text-center py-8">
                            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No hay facturas pagadas en el período seleccionado</p>
                          </div>
                        ) : (
                          <FacturasTable
                            facturas={getFilteredPaidFacturas()}
                            onClassifyClick={handleClassifyClick}
                            onPayClick={handlePayClick}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </>
            )}

            {/* Gastos Section */}
            {activeSection === 'gastos' && (
              <Card>
                <CardHeader>
                  <CardTitle>Gastos</CardTitle>
                </CardHeader>
                <CardContent>
                  {filterFacturasByType('gasto').length === 0 ? (
                    <div className="text-center py-8">
                      <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No hay gastos registrados</p>
                    </div>
                  ) : (
                    <FacturasTable
                      facturas={filterFacturasByType('gasto')}
                      onClassifyClick={handleClassifyClick}
                      onPayClick={handlePayClick}
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
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
    </ModernLayout>
  );
}