import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Package, CreditCard, Filter, FileText } from 'lucide-react';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
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
  clasificacion_original?: string | null;
  created_at: string;
  factura_iva?: number | null;
  descripcion?: string | null;
}

export function Sistematizadas() {
  const { user, loading } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>('all');

  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  const fetchFacturas = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .eq('clasificacion', 'sistematizada')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFacturas(data || []);
    } catch (error) {
      console.error('Error fetching facturas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const getFilteredFacturas = () => {
    if (filtroTipo === 'all') {
      return facturas;
    }
    return facturas.filter(f => f.clasificacion_original === filtroTipo);
  };

  const calcularTotalSistematizadas = () => {
    return getFilteredFacturas().length;
  };

  const calcularTotalMercancia = () => {
    return facturas.filter(f => f.clasificacion_original === 'mercancia').length;
  };

  const calcularTotalGastos = () => {
    return facturas.filter(f => f.clasificacion_original === 'gasto').length;
  };

  const calcularMontoTotal = () => {
    return getFilteredFacturas().reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const filteredFacturas = getFilteredFacturas();

  return (
    <ModernLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Facturas Sistematizadas</h1>
          <p className="text-muted-foreground">
            Gestión de facturas que han sido sistematizadas en el proceso contable.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <ModernStatsCard
            title="Total Sistematizadas"
            value={calcularTotalSistematizadas().toString()}
            icon={CheckCircle}
            color="purple"
          />
          <ModernStatsCard
            title="De Mercancía"
            value={calcularTotalMercancia().toString()}
            icon={Package}
            color="blue"
          />
          <ModernStatsCard
            title="De Gastos"
            value={calcularTotalGastos().toString()}
            icon={CreditCard}
            color="green"
          />
          <ModernStatsCard
            title="Monto Total"
            value={formatCurrency(calcularMontoTotal())}
            icon={FileText}
            color="orange"
          />
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>
              Filtra las facturas sistematizadas por su clasificación original
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtrar por tipo:</span>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Seleccionar filtro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="mercancia">Solo Mercancía</SelectItem>
                  <SelectItem value="gasto">Solo Gastos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Facturas Sistematizadas
              {filtroTipo !== 'all' && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({filtroTipo === 'mercancia' ? 'Mercancía' : 'Gastos'})
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Gestión de facturas que han sido sistematizadas en el proceso
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p>Cargando facturas...</p>
              </div>
            ) : filteredFacturas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium mb-2">
                  {filtroTipo === 'all'
                    ? "No hay facturas sistematizadas"
                    : `No hay facturas de ${filtroTipo === 'mercancia' ? 'mercancía' : 'gastos'} sistematizadas`
                  }
                </p>
                <p className="text-sm">
                  Las facturas sistematizadas aparecerán aquí una vez que sean procesadas.
                </p>
              </div>
            ) : (
              <FacturasTable
                facturas={filteredFacturas}
                onClassifyClick={() => {}}
                refreshData={fetchFacturas}
                showActions={false}
                showOriginalClassification={true}
                showClassifyButton={false}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  );
}