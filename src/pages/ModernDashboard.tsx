import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDashboard } from '@/contexts/DashboardContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { 
  FileText, Package, CreditCard, TrendingUp, Receipt, 
  Calculator, Minus, Percent, Filter, CalendarIcon, Banknote, DollarSign, CheckCircle
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
import { FacturaClassificationDialog } from '@/components/FacturaClassificationDialog';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
import { ModernLayout } from '@/components/ModernLayout';
import { useToast } from '@/hooks/use-toast';

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
}

export default function ModernDashboard() {
  const { user, loading } = useAuth();
  const { activeCategory } = useDashboard();
  const { toast } = useToast();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(true);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isClassificationDialogOpen, setIsClassificationDialogOpen] = useState(false);
  const [selectedPaymentFactura, setSelectedPaymentFactura] = useState<Factura | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sistematizadaFilter, setSistematizadaFilter] = useState<string>('all'); // 'all', 'mercancia', 'gasto'

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
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      // Validar y filtrar datos válidos
      const validData = (data || []).filter(factura => factura && factura.id);
      console.log('ModernDashboard: facturas cargadas:', validData.length);
      setFacturas(validData);
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

  const handleDelete = (facturaId: string) => {
    console.log('ModernDashboard handleDelete called with ID:', facturaId);
    setFacturas(prev => prev.filter(f => f && f.id && f.id !== facturaId));
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

  const filterFacturasByGastoState = (estado: string | null) => {
    const gastoFacturas = facturas.filter(f => f.clasificacion === 'gasto');
    if (estado === null) {
      // Para gastos pendientes: estado_mercancia es null, undefined, o cualquier valor que no sea 'pagada'
      return gastoFacturas.filter(f => !f.estado_mercancia || f.estado_mercancia !== 'pagada');
    }
    return gastoFacturas.filter(f => f.estado_mercancia === estado);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const handleSistematizarClick = async (factura: Factura) => {
    try {
      const { error } = await supabase
        .from('facturas')
        .update({ 
          clasificacion_original: factura.clasificacion,
          clasificacion: 'sistematizada'
        })
        .eq('id', factura.id);

      if (error) throw error;

      toast({
        title: "Factura sistematizada",
        description: `La factura ${factura.numero_factura} ha sido marcada como sistematizada.`,
      });

      // Refrescar datos
      fetchFacturas();
    } catch (error) {
      console.error('Error updating factura:', error);
      toast({
        title: "Error",
        description: "No se pudo sistematizar la factura",
        variant: "destructive"
      });
    }
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

  const calcularTotalPagadoBancosGastos = (filtrarPorFechas = true) => {
    let facturasPagadas = facturas.filter(f => f.clasificacion === 'gasto' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Pago Banco');
    
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

  const calcularTotalPagadoTobiasGastos = (filtrarPorFechas = true) => {
    let facturasPagadas = facturas.filter(f => f.clasificacion === 'gasto' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Pago Tobías');
    
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

  const calcularTotalPagadoCaja = (filtrarPorFechas = true) => {
    let facturasPagadas = facturas.filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Caja');
    
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

  const calcularTotalPagadoCajaGastos = (filtrarPorFechas = true) => {
    let facturasPagadas = facturas.filter(f => f.clasificacion === 'gasto' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Caja');
    
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

  const getFilteredPaidGastos = () => {
    let facturasPagadas = facturas.filter(f => f.clasificacion === 'gasto' && f.estado_mercancia === 'pagada');
    
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

  // Filter sistematizada invoices by original classification
  const getFilteredSistematizadas = () => {
    let sistematizadas = facturas.filter(f => f.clasificacion === 'sistematizada');
    
    if (sistematizadaFilter !== 'all') {
      sistematizadas = sistematizadas.filter(f => f.clasificacion_original === sistematizadaFilter);
    }
    
    return sistematizadas;
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
        <div className="space-y-6">
          {/* Renderizar contenido según categoría activa */}
          
          {/* Overview */}
          {activeCategory === 'overview' && (
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
                    onDelete={handleDelete}
                    onSistematizarClick={handleSistematizarClick}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {/* Sin Clasificar */}
          {activeCategory === 'sin-clasificar' && (
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
                      onDelete={handleDelete}
                      onSistematizarClick={handleSistematizarClick}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Mercancía Pendientes */}
          {activeCategory === 'mercancia-pendientes' && (
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
                      onDelete={handleDelete}
                      onSistematizarClick={handleSistematizarClick}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Mercancía Pagadas */}
          {activeCategory === 'mercancia-pagadas' && (
            <>
              {/* Filtro de fechas */}
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ModernStatsCard
                  title="Total Real Pagado"
                  value={formatCurrency(getFilteredPaidFacturas().reduce((total, factura) => {
                    return total + (factura.monto_pagado || 0);
                  }, 0))}
                  icon={DollarSign}
                  color="purple"
                />
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
                  title="Pagado por Caja"
                  value={formatCurrency(calcularTotalPagadoCaja())}
                  icon={Banknote}
                  color="orange"
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
                      onDelete={handleDelete}
                      onSistematizarClick={handleSistematizarClick}
                      showSistematizarButton={true}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Gastos Pendientes */}
          {activeCategory === 'gastos-pendientes' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <ModernStatsCard
                  title="Total Impuestos"
                  value={formatCurrency(filterFacturasByGastoState(null).reduce((total, factura) => total + (factura.factura_iva || 0), 0))}
                  icon={Receipt}
                  color="red"
                />
                <ModernStatsCard
                  title="Total Retenciones"
                  value={formatCurrency(filterFacturasByGastoState(null).reduce((total, factura) => total + (factura.monto_retencion || 0), 0))}
                  icon={Minus}
                  color="green"
                />
                <ModernStatsCard
                  title="Ahorro Pronto Pago"
                  value={formatCurrency(filterFacturasByGastoState(null).reduce((total, factura) => {
                    if (factura.porcentaje_pronto_pago) {
                      return total + (factura.total_a_pagar * factura.porcentaje_pronto_pago / 100);
                    }
                    return total;
                  }, 0))}
                  icon={Percent}
                  color="purple"
                />
                <ModernStatsCard
                  title="Total Facturas"
                  value={formatCurrency(filterFacturasByGastoState(null).reduce((sum, f) => sum + f.total_a_pagar, 0))}
                  icon={Calculator}
                  color="blue"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Gastos Pendientes de Pago</CardTitle>
                </CardHeader>
                <CardContent>
                  {filterFacturasByGastoState(null).length === 0 ? (
                    <div className="text-center py-8">
                      <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No hay gastos pendientes de pago</p>
                    </div>
                  ) : (
                    <FacturasTable
                      facturas={filterFacturasByGastoState(null)}
                      onClassifyClick={handleClassifyClick}
                      onPayClick={handlePayClick}
                      onDelete={handleDelete}
                      onSistematizarClick={handleSistematizarClick}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Gastos Pagados */}
          {activeCategory === 'gastos-pagados' && (
            <>
              {/* Filtro de fechas */}
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
                  value={formatCurrency(calcularTotalPagadoBancosGastos())}
                  icon={CreditCard}
                  color="blue"
                />
                <ModernStatsCard
                  title="Pagado por Tobías"
                  value={formatCurrency(calcularTotalPagadoTobiasGastos())}
                  icon={Package}
                  color="green"
                />
                <ModernStatsCard
                  title="Pagado por Caja"
                  value={formatCurrency(calcularTotalPagadoCajaGastos())}
                  icon={Banknote}
                  color="orange"
                />
                <ModernStatsCard
                  title="Ahorro Pronto Pago"
                  value={formatCurrency(getFilteredPaidGastos().reduce((total, factura) => {
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
                  value={formatCurrency(getFilteredPaidGastos().reduce((sum, f) => sum + f.total_a_pagar, 0))}
                  icon={Calculator}
                  color="red"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Gastos Pagados</CardTitle>
                </CardHeader>
                <CardContent>
                  {getFilteredPaidGastos().length === 0 ? (
                    <div className="text-center py-8">
                      <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No hay gastos pagados en el período seleccionado</p>
                    </div>
                  ) : (
                    <FacturasTable
                      facturas={getFilteredPaidGastos()}
                      onClassifyClick={handleClassifyClick}
                      onPayClick={handlePayClick}
                      showPaymentInfo={true}
                      onDelete={handleDelete}
                      onSistematizarClick={handleSistematizarClick}
                      showSistematizarButton={true}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Sistematizada Section */}
          {activeCategory === 'sistematizada' && (
            <>
              {/* Stats Cards for Sistematizada */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ModernStatsCard
                  title="Total Sistematizadas"
                  value={getFilteredSistematizadas().length.toString()}
                  icon={FileText}
                  color="purple"
                />
                <ModernStatsCard
                  title="De Mercancía"
                  value={facturas.filter(f => f.clasificacion === 'sistematizada' && f.clasificacion_original === 'mercancia').length.toString()}
                  icon={Package}
                  color="blue"
                />
                <ModernStatsCard
                  title="De Gastos"
                  value={facturas.filter(f => f.clasificacion === 'sistematizada' && f.clasificacion_original === 'gasto').length.toString()}
                  icon={CreditCard}
                  color="green"
                />
              </div>

              {/* Filter for Sistematizada */}
              <Card className="bg-muted/20 border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2">
                      <Filter className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Filtrar por tipo:</span>
                      <Select value={sistematizadaFilter} onValueChange={setSistematizadaFilter}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Seleccionar filtro" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          <SelectItem value="mercancia">Mercancía</SelectItem>
                          <SelectItem value="gasto">Gastos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sistematizada Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Facturas Sistematizadas
                  </CardTitle>
                  <CardDescription>
                    Gestión de facturas que han sido sistematizadas en el proceso
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {getFilteredSistematizadas().length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p className="text-lg font-medium mb-2">No hay facturas sistematizadas</p>
                      <p className="text-sm">Las facturas sistematizadas aparecerán aquí una vez que sean procesadas.</p>
                    </div>
                  ) : (
                    <FacturasTable
                      facturas={getFilteredSistematizadas()}
                      onClassifyClick={handleClassifyClick}
                      onPayClick={handlePayClick}
                      onDelete={handleDelete}
                      onSistematizarClick={handleSistematizarClick}
                      allowDelete={false}
                      showOriginalClassification={true}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}
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