import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CreditCard, DollarSign, CalendarIcon, Banknote, Search, SortAsc } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  estado_mercancia?: string | null;
  metodo_pago?: string | null;
  created_at: string;
  fecha_emision?: string | null;
  factura_iva?: number | null;
  descripcion?: string | null;
}

export function GastosPagados() {
  const { user, loading } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortByDate, setSortByDate] = useState<'newest' | 'oldest'>('newest');
  const [searchKeyword, setSearchKeyword] = useState('');

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
        .eq('clasificacion', 'gasto')
        .eq('estado_mercancia', 'pagada')
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
    let filtered = facturas;

    if (dateFrom || dateTo) {
      filtered = facturas.filter(factura => {
        if (!factura.fecha_emision) return false;
        const facturaDate = new Date(factura.fecha_emision);

        if (dateFrom && facturaDate < dateFrom) return false;
        if (dateTo && facturaDate > dateTo) return false;

        return true;
      });
    }

    return filtered;
  };

  const calcularTotalPagadoBancos = () => {
    return getFilteredFacturas()
      .filter(f => f.metodo_pago === 'Pago Banco')
      .reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalPagadoTobias = () => {
    return getFilteredFacturas()
      .filter(f => f.metodo_pago === 'Pago Tobías')
      .reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalPagadoCaja = () => {
    return getFilteredFacturas()
      .filter(f => f.metodo_pago === 'Caja')
      .reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalGeneral = () => {
    return getFilteredFacturas()
      .reduce((total, factura) => total + factura.total_a_pagar, 0);
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
          <h1 className="text-3xl font-bold tracking-tight">Gastos Pagados</h1>
          <p className="text-muted-foreground">
            Historial de facturas de gastos que han sido pagadas.
          </p>
        </div>

        {/* Date Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros de Fecha</CardTitle>
            <CardDescription>
              Filtra las facturas pagadas por rango de fechas de emisión
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">Desde</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "PPP") : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">Hasta</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "PPP") : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDateFrom(undefined);
                    setDateTo(undefined);
                  }}
                >
                  Limpiar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <ModernStatsCard
            title="Total Facturas"
            value={filteredFacturas.length.toString()}
            icon={CreditCard}
            color="green"
          />
          <ModernStatsCard
            title="Pagado por Bancos"
            value={formatCurrency(calcularTotalPagadoBancos())}
            icon={Banknote}
            color="blue"
          />
          <ModernStatsCard
            title="Pagado por Tobías"
            value={formatCurrency(calcularTotalPagadoTobias())}
            icon={DollarSign}
            color="purple"
          />
          <ModernStatsCard
            title="Pagado en Caja"
            value={formatCurrency(calcularTotalPagadoCaja())}
            icon={DollarSign}
            color="orange"
          />
        </div>

        {/* Summary Card */}
     

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Facturas de Gastos Pagadas
            </CardTitle>
            <CardDescription>
              Historial de facturas de gastos que han sido procesadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p>Cargando facturas...</p>
              </div>
            ) : filteredFacturas.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {dateFrom || dateTo
                    ? "No hay gastos pagados en el período seleccionado"
                    : "No hay gastos pagados"
                  }
                </p>
              </div>
            ) : (
              <FacturasTable
                facturas={filteredFacturas}
                onClassifyClick={() => {}}
                refreshData={fetchFacturas}
                showActions={false}
                showClassifyButton={false}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  );
}