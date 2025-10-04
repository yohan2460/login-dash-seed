import { useState, useEffect } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModernLayout } from '@/components/ModernLayout';
import { PDFViewer } from '@/components/PDFViewer';
import { useToast } from '@/hooks/use-toast';
import { Calendar, AlertTriangle, Clock, DollarSign, TrendingUp, Eye, CheckCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Factura {
  id: string;
  numero_factura: string;
  numero_serie: string | null;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  clasificacion: string | null;
  clasificacion_original: string | null;
  estado_mercancia: string | null;
  metodo_pago: string | null;
  factura_iva: number | null;
  monto_pagado: number | null;
  valor_real_a_pagar: number | null;
  uso_pronto_pago: boolean | null;
  porcentaje_pronto_pago: number | null;
  tiene_retencion: boolean | null;
  monto_retencion: number | null;
  total_sin_iva: number | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  fecha_pago: string | null;
  created_at: string;
  pdf_file_path: string | null;
}

type UrgencyLevel = 'vencida' | 'urgente' | 'proximo' | 'normal';

interface FacturaConUrgencia extends Factura {
  diasParaVencer: number;
  urgencia: UrgencyLevel;
}

export default function PagosProximos() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [facturas, setFacturas] = useState<FacturaConUrgencia[]>([]);
  const [facturasSinFecha, setFacturasSinFecha] = useState<Factura[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchFacturasPendientes();
    }
  }, [user]);

  const fetchFacturasPendientes = async () => {
    setLoadingData(true);
    try {
      // Facturas CON fecha de vencimiento
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .or('estado_mercancia.neq.pagada,estado_mercancia.is.null')
        .not('fecha_vencimiento', 'is', null)
        .order('fecha_vencimiento', { ascending: true });

      if (error) throw error;

      // Facturas SIN fecha de vencimiento (pendientes)
      const { data: sinFecha, error: errorSinFecha } = await supabase
        .from('facturas')
        .select('*')
        .or('estado_mercancia.neq.pagada,estado_mercancia.is.null')
        .is('fecha_vencimiento', null);

      if (errorSinFecha) throw errorSinFecha;

      setFacturasSinFecha(sinFecha || []);

      // Calcular urgencia para cada factura
      const facturasConUrgencia: FacturaConUrgencia[] = (data || []).map(factura => {
        const diasParaVencer = getDaysToExpire(factura.fecha_vencimiento);
        const urgencia = getUrgencyLevel(diasParaVencer);

        return {
          ...factura,
          diasParaVencer,
          urgencia
        };
      });

      // Ordenar por urgencia: vencida, urgente, próximo, normal
      const ordenUrgencia = { vencida: 0, urgente: 1, proximo: 2, normal: 3 };
      facturasConUrgencia.sort((a, b) => {
        if (ordenUrgencia[a.urgencia] !== ordenUrgencia[b.urgencia]) {
          return ordenUrgencia[a.urgencia] - ordenUrgencia[b.urgencia];
        }
        return a.diasParaVencer - b.diasParaVencer;
      });

      setFacturas(facturasConUrgencia);
    } catch (error) {
      console.error('Error al cargar facturas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las facturas pendientes",
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const getDaysToExpire = (fechaVencimiento: string | null): number => {
    if (!fechaVencimiento) return 999;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = fechaVencimiento.split('T')[0].split('-').map(Number);
    const vencimiento = new Date(year, month - 1, day);
    vencimiento.setHours(0, 0, 0, 0);

    const diffTime = vencimiento.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  };

  const getUrgencyLevel = (dias: number): UrgencyLevel => {
    if (dias < 0) return 'vencida';
    if (dias <= 3) return 'urgente';
    if (dias <= 7) return 'proximo';
    return 'normal';
  };

  const getUrgencyBadge = (urgencia: UrgencyLevel, dias: number) => {
    switch (urgencia) {
      case 'vencida':
        return {
          text: `VENCIDA (${Math.abs(dias)}d)`,
          color: 'bg-red-600 text-white',
          icon: AlertTriangle
        };
      case 'urgente':
        return {
          text: `URGENTE (${dias}d)`,
          color: 'bg-orange-600 text-white',
          icon: AlertTriangle
        };
      case 'proximo':
        return {
          text: `PRÓXIMO (${dias}d)`,
          color: 'bg-yellow-600 text-white',
          icon: Clock
        };
      default:
        return {
          text: `${dias} días`,
          color: 'bg-blue-600 text-white',
          icon: Calendar
        };
    }
  };

  const formatFechaSafe = (fecha: string | null): string => {
    if (!fecha) return 'No especificada';
    try {
      const fechaSoloFecha = fecha.split('T')[0];
      const [year, month, day] = fechaSoloFecha.split('-').map(num => parseInt(num, 10));
      const dayStr = day.toString().padStart(2, '0');
      const monthStr = month.toString().padStart(2, '0');
      const yearStr = year.toString();
      return `${dayStr}/${monthStr}/${yearStr}`;
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const handleOpenPdf = async (pdfFilePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(pdfFilePath, 3600);

      if (error) throw error;

      if (data?.signedUrl) {
        setPdfUrl(data.signedUrl);
        setPdfDialogOpen(true);
      }
    } catch (error) {
      console.error('Error al abrir PDF:', error);
      toast({
        title: "Error",
        description: "No se pudo abrir el PDF",
        variant: "destructive",
      });
    }
  };

  const getFacturaRoute = (factura: Factura) => {
    if (factura.clasificacion === 'nota_credito') {
      return `/notas-credito?highlight=${factura.id}`;
    }
    if (factura.clasificacion === 'sistematizada') {
      return `/sistematizadas?highlight=${factura.id}`;
    }
    if (!factura.clasificacion || factura.clasificacion === 'sin clasificar') {
      return `/sin-clasificar?highlight=${factura.id}`;
    }
    if (factura.clasificacion?.toLowerCase() === 'mercancia') {
      if (factura.estado_mercancia === 'pendiente') {
        return `/mercancia-pendiente?highlight=${factura.id}`;
      }
    }
    if (factura.clasificacion?.toLowerCase() === 'gastos') {
      if (factura.estado_mercancia === 'pendiente') {
        return `/gastos-pendientes?highlight=${factura.id}`;
      }
    }
    return `/sin-clasificar?highlight=${factura.id}`;
  };

  // Calcular estadísticas
  const calcularEstadisticas = () => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    primerDiaMes.setHours(0, 0, 0, 0);

    const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    ultimoDiaMes.setHours(23, 59, 59, 999);

    // Facturas a pagar este mes (INCLUYE vencidas + las que vencen este mes)
    const facturasEsteMes = facturas.filter(f => {
      if (!f.fecha_vencimiento) return false;
      const [year, month, day] = f.fecha_vencimiento.split('T')[0].split('-').map(Number);
      const vencimiento = new Date(year, month - 1, day);
      vencimiento.setHours(0, 0, 0, 0);

      // Incluir: vencidas (antes de hoy) + las que vencen este mes
      return vencimiento <= ultimoDiaMes;
    });

    const totalEsteMes = facturasEsteMes.reduce((sum, f) => {
      return sum + (f.total_a_pagar || 0);
    }, 0);

    const impuestosEsteMes = facturasEsteMes.reduce((sum, f) => {
      return sum + (f.factura_iva || 0);
    }, 0);

    // Facturas de meses próximos (SOLO después de este mes, NO incluye vencidas ni este mes)
    const facturasMesesProximos = facturas.filter(f => {
      if (!f.fecha_vencimiento) return false;
      const [year, month, day] = f.fecha_vencimiento.split('T')[0].split('-').map(Number);
      const vencimiento = new Date(year, month - 1, day);
      vencimiento.setHours(0, 0, 0, 0);

      // Solo facturas que vencen después del último día de este mes
      return vencimiento > ultimoDiaMes;
    });

    const totalMesesProximos = facturasMesesProximos.reduce((sum, f) => {
      return sum + (f.total_a_pagar || 0);
    }, 0);

    const impuestosMesesProximos = facturasMesesProximos.reduce((sum, f) => {
      return sum + (f.factura_iva || 0);
    }, 0);

    // Facturas SIN fecha de vencimiento
    const totalSinFecha = facturasSinFecha.reduce((sum, f) => {
      return sum + (f.total_a_pagar || 0);
    }, 0);

    const impuestosSinFecha = facturasSinFecha.reduce((sum, f) => {
      return sum + (f.factura_iva || 0);
    }, 0);

    // Contar por urgencia
    const vencidas = facturas.filter(f => f.urgencia === 'vencida').length;
    const urgentes = facturas.filter(f => f.urgencia === 'urgente').length;
    const proximas = facturas.filter(f => f.urgencia === 'proximo').length;
    const alDia = facturas.filter(f => f.urgencia === 'normal').length;

    // Totales por urgencia
    const totalVencidas = facturas.filter(f => f.urgencia === 'vencida').reduce((sum, f) => sum + (f.total_a_pagar || 0), 0);
    const totalUrgentes = facturas.filter(f => f.urgencia === 'urgente').reduce((sum, f) => sum + (f.total_a_pagar || 0), 0);
    const totalProximas = facturas.filter(f => f.urgencia === 'proximo').reduce((sum, f) => sum + (f.total_a_pagar || 0), 0);
    const totalAlDia = facturas.filter(f => f.urgencia === 'normal').reduce((sum, f) => sum + (f.total_a_pagar || 0), 0);

    // TOTAL GENERAL (para verificar)
    const totalGeneral = totalEsteMes + totalMesesProximos + totalSinFecha;

    return {
      totalEsteMes,
      totalMesesProximos,
      totalSinFecha,
      totalGeneral,
      impuestosEsteMes,
      impuestosMesesProximos,
      impuestosSinFecha,
      facturasEsteMes: facturasEsteMes.length,
      facturasMesesProximos: facturasMesesProximos.length,
      facturasSinFecha: facturasSinFecha.length,
      vencidas,
      urgentes,
      proximas,
      alDia,
      totalVencidas,
      totalUrgentes,
      totalProximas,
      totalAlDia
    };
  };

  const stats = calcularEstadisticas();

  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  if (loadingData) {
    return (
      <ModernLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </ModernLayout>
    );
  }

  return (
    <ModernLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Calendar className="w-8 h-8 text-blue-600" />
              Pagos Próximos
            </h1>
            <p className="text-muted-foreground mt-1">
              Facturas pendientes organizadas por urgencia de pago
            </p>
          </div>
          <Button onClick={fetchFacturasPendientes} variant="outline">
            <TrendingUp className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        </div>

        {/* Cards de estadísticas - Urgencia */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardContent className="p-3">
              <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Vencidas</p>
              <div className="text-xl font-bold text-red-600">{stats.vencidas}</div>
              <div className="mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30">
                <span className="text-[15px] font-medium text-red-700 dark:text-red-300">
                  {formatCurrency(stats.totalVencidas)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="p-3">
              <p className="text-xs font-medium text-orange-700 dark:text-orange-400 mb-1">Urgentes (≤3d)</p>
              <div className="text-xl font-bold text-orange-600">{stats.urgentes}</div>
              <div className="mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30">
                <span className="text-[15px] font-medium text-orange-700 dark:text-orange-300">
                  {formatCurrency(stats.totalUrgentes)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="p-3">
              <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">Próximas (≤7d)</p>
              <div className="text-xl font-bold text-yellow-600">{stats.proximas}</div>
              <div className="mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                <span className="text-[15px] font-medium text-yellow-700 dark:text-yellow-300">
                  {formatCurrency(stats.totalProximas)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="p-3">
              <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Al día (&gt;7d)</p>
              <div className="text-xl font-bold text-green-600">{stats.alDia}</div>
              <div className="mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30">
                <span className="text-[15px] font-medium text-green-700 dark:text-green-300">
                  {formatCurrency(stats.totalAlDia)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cards de totales por periodo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">
                A Pagar Este Mes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                {formatCurrency(stats.totalEsteMes)}
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                {stats.facturasEsteMes} facturas
              </p>
              <p className="text-xs text-blue-500/70 dark:text-blue-400/70 mt-1">
                IVA incluido: {formatCurrency(stats.impuestosEsteMes)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-400">
                Meses Próximos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                {formatCurrency(stats.totalMesesProximos)}
              </div>
              <p className="text-xs text-purple-600 dark:text-purple-500 mt-1">
                {stats.facturasMesesProximos} facturas
              </p>
              <p className="text-xs text-purple-500/70 dark:text-purple-400/70 mt-1">
                IVA incluido: {formatCurrency(stats.impuestosMesesProximos)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-gray-50 dark:bg-gray-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-400">
                Sin Fecha Vencimiento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-700 dark:text-gray-400">
                {formatCurrency(stats.totalSinFecha)}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">
                {stats.facturasSinFecha} facturas
              </p>
              <p className="text-xs text-gray-500/70 dark:text-gray-400/70 mt-1">
                IVA incluido: {formatCurrency(stats.impuestosSinFecha)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Total General */}
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Total Pendiente General</p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                  {stats.facturasEsteMes + stats.facturasMesesProximos + stats.facturasSinFecha} facturas pendientes
                </p>
              </div>
              <div className="text-3xl font-bold text-green-700 dark:text-green-400">
                {formatCurrency(stats.totalGeneral)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de facturas */}
        <Card>
          <CardHeader>
            <CardTitle>Facturas Pendientes ({facturas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[130px]">Urgencia</TableHead>
                    <TableHead className="min-w-[180px]">Proveedor</TableHead>
                    <TableHead className="w-[120px]">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs">N° Factura</span>
                        <span className="text-xs text-muted-foreground">Clasificación</span>
                      </div>
                    </TableHead>
                    <TableHead className="w-[70px] text-xs">Serie</TableHead>
                    <TableHead className="w-[100px] text-xs">Vencimiento</TableHead>
                    <TableHead className="w-[110px] text-right">Total a Pagar</TableHead>
                    <TableHead className="w-[50px] text-center">
                      <Eye className="h-4 w-4 mx-auto" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facturas.map((factura) => {
                    const badge = getUrgencyBadge(factura.urgencia, factura.diasParaVencer);
                    const Icon = badge.icon;

                    return (
                      <TableRow key={factura.id} className="hover:bg-muted/30">
                        <TableCell className="py-3">
                          <Badge className={`text-xs font-medium ${badge.color}`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {badge.text}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm truncate max-w-[180px]" title={factura.emisor_nombre}>
                              {factura.emisor_nombre}
                            </span>
                            <span className="text-xs text-muted-foreground">{factura.emisor_nit}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-1">
                            <Link
                              to={getFacturaRoute(factura)}
                              className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm"
                            >
                              {factura.numero_factura}
                            </Link>
                            <Badge variant="outline" className="text-xs w-fit">
                              {(factura.clasificacion_original || factura.clasificacion || 'Sin clasificar').substring(0, 10)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <span className="text-sm font-medium">{factura.numero_serie || '-'}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm">{formatFechaSafe(factura.fecha_vencimiento)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <span className="font-semibold text-sm">
                            {formatCurrency(factura.total_a_pagar || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              if (factura.pdf_file_path) {
                                handleOpenPdf(factura.pdf_file_path);
                              } else {
                                toast({
                                  title: "PDF no disponible",
                                  description: "Esta factura no tiene un PDF asociado",
                                  variant: "destructive",
                                });
                              }
                            }}
                            title={factura.pdf_file_path ? "Ver PDF" : "PDF no disponible"}
                            disabled={!factura.pdf_file_path}
                          >
                            <Eye className={`h-4 w-4 ${factura.pdf_file_path ? 'text-blue-600' : 'text-gray-400'}`} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Empty State */}
        {facturas.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <CheckCircle className="w-16 h-16 mx-auto text-green-600 mb-4" />
                <h3 className="text-lg font-semibold mb-2">¡No hay facturas pendientes!</h3>
                <p className="text-muted-foreground">
                  Todas las facturas están al día
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* PDF Viewer */}
      <PDFViewer
        isOpen={pdfDialogOpen}
        onClose={() => setPdfDialogOpen(false)}
        pdfUrl={pdfUrl}
        title="Visualizador de Factura"
      />
    </ModernLayout>
  );
}
