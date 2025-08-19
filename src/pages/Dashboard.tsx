import { useState, useEffect } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, FileText, Package, CreditCard, Calculator, Receipt, Minus, Percent, Building2, Banknote, User, CalendarIcon, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FacturasTable } from '@/components/FacturasTable';
import { FacturaClassificationDialog } from '@/components/FacturaClassificationDialog';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
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
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
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
      // Validar y filtrar datos válidos
      const validData = (data || []).filter(factura => factura && factura.id);
      console.log('Dashboard: facturas cargadas:', validData.length);
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
    console.log('Dashboard handleDelete called with ID:', facturaId);
    setFacturas(prev => prev.filter(f => f && f.id && f.id !== facturaId));
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
    if (estado === null) {
      // "Pendientes" should show mercancia invoices that are pendiente or don't have estado_mercancia set
      return mercanciaFacturas.filter(f => f.estado_mercancia === 'pendiente' || !f.estado_mercancia);
    }
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
    const mercanciaFacturasPendientes = facturas.filter(f => 
      f.clasificacion === 'mercancia' && (f.estado_mercancia === 'pendiente' || !f.estado_mercancia)
    );
    return mercanciaFacturasPendientes.reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const calcularTotalFacturas = () => {
    const mercanciaFacturasPendientes = facturas.filter(f => 
      f.clasificacion === 'mercancia' && (f.estado_mercancia === 'pendiente' || !f.estado_mercancia)
    );
    return mercanciaFacturasPendientes.reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalRetenciones = () => {
    const mercanciaFacturasPendientes = facturas.filter(f => 
      f.clasificacion === 'mercancia' && (f.estado_mercancia === 'pendiente' || !f.estado_mercancia)
    );
    return mercanciaFacturasPendientes.reduce((total, factura) => total + (factura.monto_retencion || 0), 0);
  };

  // Funciones para calcular totales de facturas sin clasificar
  const calcularTotalImpuestosSinClasificar = () => {
    const facturasSinClasificar = facturas.filter(f => !f.clasificacion);
    return facturasSinClasificar.reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const calcularTotalFacturasSinClasificar = () => {
    const facturasSinClasificar = facturas.filter(f => !f.clasificacion);
    return facturasSinClasificar.reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalRetencionesSinClasificar = () => {
    const facturasSinClasificar = facturas.filter(f => !f.clasificacion);
    return facturasSinClasificar.reduce((total, factura) => total + (factura.monto_retencion || 0), 0);
  };

  const calcularTotalAhorroProntoPagoSinClasificar = () => {
    const facturasSinClasificar = facturas.filter(f => !f.clasificacion);
    return facturasSinClasificar.reduce((total, factura) => {
      if (factura.porcentaje_pronto_pago) {
        return total + ((factura.total_a_pagar * factura.porcentaje_pronto_pago) / 100);
      }
      return total;
    }, 0);
  };

  const calcularTotalAhorroProntoPago = () => {
    const mercanciaFacturasPendientes = facturas.filter(f => 
      f.clasificacion === 'mercancia' && (f.estado_mercancia === 'pendiente' || !f.estado_mercancia)
    );
    return mercanciaFacturasPendientes.reduce((total, factura) => {
      if (factura.porcentaje_pronto_pago) {
        return total + ((factura.total_a_pagar * factura.porcentaje_pronto_pago) / 100);
      }
      return total;
    }, 0);
  };

  // Funciones para calcular totales de facturas pagadas
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

  const calcularTotalFacturasPagadas = (fechaInicio?: Date | null, fechaFin?: Date | null) => {
    let mercanciaFacturasPagadas = facturas.filter(f => 
      f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada'
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

  const calcularTotalRetencionesPagadas = (fechaInicio?: Date | null, fechaFin?: Date | null) => {
    let mercanciaFacturasPagadas = facturas.filter(f => 
      f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada'
    );
    
    if (fechaInicio && fechaFin) {
      mercanciaFacturasPagadas = mercanciaFacturasPagadas.filter(f => {
        if (!f.fecha_emision) return false;
        const fechaEmision = new Date(f.fecha_emision);
        return fechaEmision >= fechaInicio && fechaEmision <= fechaFin;
      });
    }
    
    return mercanciaFacturasPagadas.reduce((total, factura) => total + (factura.monto_retencion || 0), 0);
  };

  const calcularTotalAhorroProntoPagoPagadas = (fechaInicio?: Date | null, fechaFin?: Date | null) => {
    let mercanciaFacturasPagadas = facturas.filter(f => 
      f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada'
    );
    
    if (fechaInicio && fechaFin) {
      mercanciaFacturasPagadas = mercanciaFacturasPagadas.filter(f => {
        if (!f.fecha_emision) return false;
        const fechaEmision = new Date(f.fecha_emision);
        return fechaEmision >= fechaInicio && fechaEmision <= fechaFin;
      });
    }
    
    return mercanciaFacturasPagadas.reduce((total, factura) => {
      if (factura.uso_pronto_pago && factura.monto_pagado) {
        return total + (factura.total_a_pagar - factura.monto_pagado);
      }
      return total;
    }, 0);
  };

  // Función para filtrar facturas pagadas por fecha
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
            <Link to="/facturas-por-proveedor">
              <Button variant="outline" size="sm" className="transition-all duration-300 hover:scale-105">
                <Building2 className="w-4 h-4 mr-2" />
                Ver por Proveedor
              </Button>
            </Link>
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
                      {/* Tarjetas de Resumen - Solo facturas sin clasificar */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <Card className="border-l-4 border-l-red-500">
                          <CardContent className="p-4">
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-red-100 rounded-lg">
                                <Receipt className="w-5 h-5 text-red-600" />
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Total Impuestos</p>
                                <p className="text-xl font-bold text-red-600">
                                  {formatCurrency(calcularTotalImpuestosSinClasificar())}
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
                                  {formatCurrency(calcularTotalFacturasSinClasificar())}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

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
                          onDelete={handleDelete}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="mercancia" className="mt-6">
                      {/* Pestañas anidadas para estados de Mercancía */}
                      <Tabs defaultValue="todas-mercancia" className="w-full" onValueChange={(value) => {
                        // Actualizar las tarjetas según la pestaña activa
                        const impuestosEl = document.getElementById('total-impuestos');
                        const retencionesEl = document.getElementById('total-retenciones');
                        const ahorroEl = document.getElementById('ahorro-pronto-pago');
                        const totalEl = document.getElementById('total-facturas');
                        const labelEl = document.getElementById('total-label');
                        
                        if (value === 'pagada') {
                          // Para facturas pagadas, mostrar bancos y Tobías en lugar de impuestos/retenciones
                          const bancosCard = document.querySelector('[data-card="bancos"]');
                          const tobiasCard = document.querySelector('[data-card="tobias"]');
                          const impuestosCard = document.querySelector('[data-card="impuestos"]');
                          const retencionesCard = document.querySelector('[data-card="retenciones"]');
                          
                          if (impuestosCard) (impuestosCard as HTMLElement).style.display = 'none';
                          if (retencionesCard) (retencionesCard as HTMLElement).style.display = 'none';
                          if (bancosCard) (bancosCard as HTMLElement).style.display = 'block';
                          if (tobiasCard) (tobiasCard as HTMLElement).style.display = 'block';
                          
                          const bancosEl = document.getElementById('total-bancos');
                          const tobiasEl = document.getElementById('total-tobias');
                          if (bancosEl) bancosEl.textContent = formatCurrency(calcularTotalPagadoBancos(dateFrom, dateTo));
                          if (tobiasEl) tobiasEl.textContent = formatCurrency(calcularTotalPagadoTobias(dateFrom, dateTo));
                          if (ahorroEl) ahorroEl.textContent = formatCurrency(calcularTotalAhorroProntoPagoPagadas(dateFrom, dateTo));
                          if (totalEl) totalEl.textContent = formatCurrency(calcularTotalFacturasPagadas(dateFrom, dateTo));
                          if (labelEl) labelEl.textContent = 'Total Pagado';
                        } else {
                          // Para facturas pendientes, mostrar impuestos/retenciones y ocultar bancos/Tobías
                          const bancosCard = document.querySelector('[data-card="bancos"]');
                          const tobiasCard = document.querySelector('[data-card="tobias"]');
                          const impuestosCard = document.querySelector('[data-card="impuestos"]');
                          const retencionesCard = document.querySelector('[data-card="retenciones"]');
                          
                          if (impuestosCard) (impuestosCard as HTMLElement).style.display = 'block';
                          if (retencionesCard) (retencionesCard as HTMLElement).style.display = 'block';
                          if (bancosCard) (bancosCard as HTMLElement).style.display = 'none';
                          if (tobiasCard) (tobiasCard as HTMLElement).style.display = 'none';
                          
                          if (impuestosEl) impuestosEl.textContent = formatCurrency(calcularTotalImpuestos());
                          if (retencionesEl) retencionesEl.textContent = formatCurrency(calcularTotalRetenciones());
                          if (ahorroEl) ahorroEl.textContent = formatCurrency(calcularTotalAhorroProntoPago());
                          if (totalEl) totalEl.textContent = formatCurrency(calcularTotalFacturas());
                          if (labelEl) labelEl.textContent = 'Total Facturas';
                        }
                      }}>
                        <TabsList className="grid w-full grid-cols-2 bg-accent/20 border border-border/50 rounded-lg p-1">
                          <TabsTrigger 
                            value="todas-mercancia" 
                            className="data-[state=active]:bg-background data-[state=active]:shadow-sm font-medium"
                          >
                            Pendientes ({filterFacturasByMercanciaState(null).length})
                          </TabsTrigger>
                          <TabsTrigger 
                            value="pagada" 
                            className="data-[state=active]:bg-background data-[state=active]:shadow-sm font-medium"
                          >
                            Pagadas ({filterFacturasByMercanciaState('pagada').length})
                          </TabsTrigger>
                        </TabsList>

                        {/* Tarjetas de Resumen dinámicas */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
                          <Card className="border-l-4 border-l-red-500" data-card="impuestos">
                            <CardContent className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                  <Receipt className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Total Impuestos</p>
                                  <p className="text-xl font-bold text-red-600" id="total-impuestos">
                                    {formatCurrency(calcularTotalImpuestos())}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-l-4 border-l-green-500" data-card="retenciones">
                            <CardContent className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-green-100 rounded-lg">
                                  <Minus className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Total Retenciones</p>
                                  <p className="text-xl font-bold text-green-600" id="total-retenciones">
                                    {formatCurrency(calcularTotalRetenciones())}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Cards que aparecen solo en la pestaña de pagadas */}
                          <Card className="border-l-4 border-l-blue-500" data-card="bancos" style={{display: 'none'}}>
                            <CardContent className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                  <Banknote className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Pagado por Bancos</p>
                                  <p className="text-xl font-bold text-blue-600" id="total-bancos">
                                    {formatCurrency(calcularTotalPagadoBancos(dateFrom, dateTo))}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-l-4 border-l-orange-500" data-card="tobias" style={{display: 'none'}}>
                            <CardContent className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-orange-100 rounded-lg">
                                  <User className="w-5 h-5 text-orange-600" />
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Pagado por Tobías</p>
                                  <p className="text-xl font-bold text-orange-600" id="total-tobias">
                                    {formatCurrency(calcularTotalPagadoTobias(dateFrom, dateTo))}
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
                                  <p className="text-xl font-bold text-purple-600" id="ahorro-pronto-pago">
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
                                  <p className="text-sm text-muted-foreground" id="total-label">Total Facturas</p>
                                  <p className="text-xl font-bold text-blue-600" id="total-facturas">
                                    {formatCurrency(calcularTotalFacturas())}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <TabsContent value="todas-mercancia" className="mt-4">
                          {filterFacturasByMercanciaState(null).length === 0 ? (
                            <div className="text-center py-8">
                              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                              <p className="text-muted-foreground">No hay facturas pendientes de pago</p>
                            </div>
                          ) : (
                            <FacturasTable
                              facturas={filterFacturasByMercanciaState(null)}
                              onClassifyClick={handleClassifyClick}
                              onPayClick={handlePayClick}
                              onDelete={handleDelete}
                            />
                          )}
                        </TabsContent>

                        <TabsContent value="pagada" className="mt-4">
                          {/* Filtro de fechas para facturas pagadas */}
                          <div className="mb-4 p-4 bg-accent/20 rounded-lg border">
                            <div className="flex flex-wrap items-center gap-4">
                              <div className="flex items-center space-x-2">
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
                                <div className="text-sm text-muted-foreground">
                                  Mostrando facturas del {format(dateFrom, "dd/MM/yyyy")} al {format(dateTo, "dd/MM/yyyy")}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {getFilteredPaidFacturas().length === 0 ? (
                            <div className="text-center py-8">
                              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                              <p className="text-muted-foreground">
                                {dateFrom && dateTo ? 'No hay facturas pagadas en el rango de fechas seleccionado' : 'No hay facturas pagadas'}
                              </p>
                            </div>
                          ) : (
                            <FacturasTable
                              facturas={getFilteredPaidFacturas()}
                              onClassifyClick={handleClassifyClick}
                              showPaymentInfo={true}
                              onDelete={handleDelete}
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
                          onDelete={handleDelete}
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