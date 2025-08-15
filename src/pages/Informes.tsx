import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModernLayout } from '@/components/ModernLayout';
import { 
  Building2, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Receipt,
  CreditCard,
  Percent,
  Calendar
} from 'lucide-react';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  clasificacion: string | null;
  estado_mercancia: string | null;
  metodo_pago: string | null;
  factura_iva: number | null;
  monto_pagado: number | null;
  uso_pronto_pago: boolean | null;
  porcentaje_pronto_pago: number | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  created_at: string;
}

interface ProveedorData {
  nit: string;
  nombre: string;
  totalPendiente: number;
  totalPagado: number;
  facturasPendientes: Factura[];
  facturasPagadas: Factura[];
  facturasPorVencer: Factura[];
  facturasTotales: number;
  fechaVencimientoMasCercana: Date | null;
  diasParaVencer: number | null;
}

export default function Informes() {
  const { user, loading } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorData[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('todos');

  const getFilteredFacturas = () => {
    if (selectedMonth === 'todos') {
      return facturas;
    }
    
    return facturas.filter(factura => {
      const fechaCreacion = new Date(factura.created_at);
      const mesAno = `${fechaCreacion.getFullYear()}-${String(fechaCreacion.getMonth() + 1).padStart(2, '0')}`;
      return mesAno === selectedMonth;
    });
  };

  const getAvailableMonths = () => {
    const months = new Set<string>();
    facturas.forEach(factura => {
      const fecha = new Date(factura.created_at);
      const mesAno = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      months.add(mesAno);
    });
    return Array.from(months).sort().reverse();
  };

  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  useEffect(() => {
    if (facturas.length > 0) {
      procesarProveedores(getFilteredFacturas());
    }
  }, [selectedMonth, facturas]);

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
      setFacturas(data || []);
    } catch (error) {
      console.error('Error fetching facturas:', error);
    } finally {
      setLoadingData(false);
    }
  };


  const procesarProveedores = (facturas: Factura[]) => {
    const proveedoresMap = new Map<string, ProveedorData>();

    facturas.forEach(factura => {
      const key = factura.emisor_nit;
      
      if (!proveedoresMap.has(key)) {
        proveedoresMap.set(key, {
          nit: factura.emisor_nit,
          nombre: factura.emisor_nombre,
          totalPendiente: 0,
          totalPagado: 0,
          facturasPendientes: [],
          facturasPagadas: [],
          facturasPorVencer: [],
          facturasTotales: 0,
          fechaVencimientoMasCercana: null,
          diasParaVencer: null
        });
      }

      const proveedor = proveedoresMap.get(key)!;
      proveedor.facturasTotales++;

      // Determinar si está pendiente o pagada
      const isPagada = factura.estado_mercancia === 'pagada';
      
      if (isPagada) {
        proveedor.totalPagado += factura.monto_pagado || factura.total_a_pagar;
        proveedor.facturasPagadas.push(factura);
      } else if (factura.clasificacion) {
        proveedor.totalPendiente += factura.total_a_pagar;
        proveedor.facturasPendientes.push(factura);

        // Calcular fecha de vencimiento más cercana
        if (factura.fecha_vencimiento) {
          const fechaVenc = new Date(factura.fecha_vencimiento);
          const hoy = new Date();
          const diferenciaDias = Math.ceil((fechaVenc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
          
          if (!proveedor.fechaVencimientoMasCercana || fechaVenc < proveedor.fechaVencimientoMasCercana) {
            proveedor.fechaVencimientoMasCercana = fechaVenc;
            proveedor.diasParaVencer = diferenciaDias;
          }

          if (diferenciaDias <= 7 && diferenciaDias >= 0) {
            proveedor.facturasPorVencer.push(factura);
          }
        }
      }
    });

    // Filtrar solo proveedores con deudas pendientes y ordenar por urgencia
    const proveedoresArray = Array.from(proveedoresMap.values())
      .filter(proveedor => proveedor.totalPendiente > 0)
      .sort((a, b) => {
        // Primero por días para vencer (más urgente primero)
        if (a.diasParaVencer !== null && b.diasParaVencer !== null) {
          return a.diasParaVencer - b.diasParaVencer;
        }
        if (a.diasParaVencer !== null && b.diasParaVencer === null) return -1;
        if (a.diasParaVencer === null && b.diasParaVencer !== null) return 1;
        
        // Luego por total pendiente (mayor deuda primero)
        return b.totalPendiente - a.totalPendiente;
      });
    
    setProveedores(proveedoresArray);
  };

  const getUrgencyColor = (diasParaVencer: number | null) => {
    if (diasParaVencer === null) return 'border-l-blue-500';
    if (diasParaVencer < 0) return 'border-l-red-600'; // Vencidas
    if (diasParaVencer <= 3) return 'border-l-red-500'; // Muy urgente
    if (diasParaVencer <= 7) return 'border-l-orange-500'; // Urgente
    if (diasParaVencer <= 15) return 'border-l-yellow-500'; // Atención
    return 'border-l-blue-500'; // Normal
  };

  const getUrgencyBadge = (diasParaVencer: number | null) => {
    if (diasParaVencer === null) return null;
    if (diasParaVencer < 0) return { text: 'VENCIDA', color: 'bg-red-600 text-white' };
    if (diasParaVencer <= 3) return { text: 'MUY URGENTE', color: 'bg-red-500 text-white' };
    if (diasParaVencer <= 7) return { text: 'URGENTE', color: 'bg-orange-500 text-white' };
    if (diasParaVencer <= 15) return { text: 'PRÓXIMO VENC.', color: 'bg-yellow-500 text-black' };
    return null;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularEstadisticasGenerales = () => {
    const facturasFiltered = getFilteredFacturas();
    const facturasPagadas = facturasFiltered.filter(f => f.estado_mercancia === 'pagada');
    
    const totalIVA = facturasFiltered.reduce((sum, f) => sum + (f.factura_iva || 0), 0);
    const pagadoPorTobias = facturasPagadas
      .filter(f => f.metodo_pago === 'Pago Tobías')
      .reduce((sum, f) => sum + (f.monto_pagado || 0), 0);
    const pagadoPorBancos = facturasPagadas
      .filter(f => f.metodo_pago === 'Pago Banco')
      .reduce((sum, f) => sum + (f.monto_pagado || 0), 0);
    const ahorroTotal = facturasPagadas
      .filter(f => f.uso_pronto_pago && f.porcentaje_pronto_pago)
      .reduce((sum, f) => sum + (f.total_a_pagar * (f.porcentaje_pronto_pago! / 100)), 0);

    return { totalIVA, pagadoPorTobias, pagadoPorBancos, ahorroTotal };
  };

  const stats = calcularEstadisticasGenerales();

  if (loading || loadingData) {
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
      title="Informes"
      subtitle="Reporte completo por proveedores y análisis financiero"
    >
      <div className="space-y-6">
        {/* Filtro por Mes */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Filtrar por mes:</span>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los meses</SelectItem>
                    {getAvailableMonths().map(month => {
                      const [year, monthNum] = month.split('-');
                      const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString('es-CO', { 
                        year: 'numeric', 
                        month: 'long' 
                      });
                      return (
                        <SelectItem key={month} value={month}>
                          {monthName}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estadísticas Generales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Receipt className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total IVA</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalIVA)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <CreditCard className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Pagado por Bancos</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.pagadoPorBancos)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Building2 className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Pagado por Tobías</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.pagadoPorTobias)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Percent className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Ahorrado</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.ahorroTotal)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Proveedores con Deudas Pendientes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
              Proveedores con Deudas Pendientes
              {proveedores.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {proveedores.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {proveedores.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No hay datos de proveedores disponibles</p>
              </div>
            ) : (
              <div className="space-y-4">
                {proveedores.map((proveedor) => {
                  const urgencyBadge = getUrgencyBadge(proveedor.diasParaVencer);
                  return (
                    <Card key={proveedor.nit} className={`border-l-4 ${getUrgencyColor(proveedor.diasParaVencer)}`}>
                      <CardContent className="p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {/* Información del Proveedor */}
                          <div className="lg:col-span-2">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="text-lg font-semibold">{proveedor.nombre}</h3>
                                  {urgencyBadge && (
                                    <Badge className={`text-xs px-2 py-1 ${urgencyBadge.color}`}>
                                      {urgencyBadge.text}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">NIT: {proveedor.nit}</p>
                                <p className="text-sm text-muted-foreground">
                                  {proveedor.facturasPendientes.length} facturas pendientes
                                </p>
                                {proveedor.diasParaVencer !== null && (
                                  <p className="text-sm font-medium text-red-600">
                                    {proveedor.diasParaVencer < 0 
                                      ? `Vencida hace ${Math.abs(proveedor.diasParaVencer)} días`
                                      : `Vence en ${proveedor.diasParaVencer} días`}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-muted-foreground">Total Pendiente</div>
                                <div className="text-2xl font-bold text-red-600">
                                  {formatCurrency(proveedor.totalPendiente)}
                                </div>
                              </div>
                            </div>

                          {/* Progress bar */}
                          {(proveedor.totalPendiente + proveedor.totalPagado) > 0 && (
                            <div className="mb-4">
                              <div className="flex justify-between text-sm mb-2">
                                <span>Progreso de pagos</span>
                                <span>
                                  {Math.round((proveedor.totalPagado / (proveedor.totalPendiente + proveedor.totalPagado)) * 100)}%
                                </span>
                              </div>
                              <Progress 
                                value={(proveedor.totalPagado / (proveedor.totalPendiente + proveedor.totalPagado)) * 100} 
                                className="h-2"
                              />
                            </div>
                          )}

                          {/* Facturas por vencer */}
                          {proveedor.facturasPorVencer.length > 0 && (
                            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
                              <div className="flex items-center mb-2">
                                <AlertTriangle className="w-4 h-4 text-orange-600 mr-2" />
                                <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                                  Facturas por vencer (próximos 7 días)
                                </span>
                              </div>
                              <div className="space-y-1">
                                {proveedor.facturasPorVencer.map(factura => (
                                  <div key={factura.id} className="text-xs text-orange-700 dark:text-orange-300">
                                    #{factura.numero_factura} - {formatCurrency(factura.total_a_pagar)}
                                    {factura.fecha_vencimiento && (
                                      <span className="ml-2">
                                        (Vence: {new Date(factura.fecha_vencimiento).toLocaleDateString('es-CO')})
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Estadísticas */}
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                              <Clock className="w-6 h-6 text-red-600 mx-auto mb-1" />
                              <div className="text-lg font-bold text-red-700 dark:text-red-300">
                                {proveedor.facturasPendientes.length}
                              </div>
                              <div className="text-xs text-red-600">Pendientes</div>
                            </div>
                            
                            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                              <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
                              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                                {proveedor.facturasPagadas.length}
                              </div>
                              <div className="text-xs text-green-600">Pagadas</div>
                            </div>
                          </div>

                          {proveedor.totalPagado > 0 && (
                            <div className="p-3 bg-muted/50 rounded-lg">
                              <div className="text-sm text-muted-foreground mb-1">Total Pagado</div>
                              <div className="text-lg font-bold text-green-600">
                                {formatCurrency(proveedor.totalPagado)}
                              </div>
                            </div>
                           )}
                         </div>
                       </div>
                     </CardContent>
                   </Card>
                 );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  );
}