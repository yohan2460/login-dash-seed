import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Package, DollarSign, CalendarIcon, Banknote, Search, SortAsc } from 'lucide-react';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
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
  estado_mercancia?: string | null;
  metodo_pago?: string | null;
  created_at: string;
  fecha_emision?: string | null;
  factura_iva?: number | null;
  descripcion?: string | null;
  ingresado_sistema?: boolean | null;
  monto_pagado?: number | null;
  valor_real_a_pagar?: number | null;
}

export function MercanciaPagada() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortByDate, setSortByDate] = useState<'newest' | 'oldest'>('newest');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchFacturas();
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

  const fetchFacturas = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('*, ingresado_sistema, valor_real_a_pagar')
        .eq('clasificacion', 'mercancia')
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

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null || isNaN(Number(amount))) {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(0);
    }
    const numericAmount = Math.round(Number(amount));
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(numericAmount);
  };

  const getFilteredFacturas = () => {
    let filtered = facturas;

    // Filtro por rango de fechas
    if (dateFrom || dateTo) {
      filtered = filtered.filter(factura => {
        if (!factura.fecha_emision) return false;
        const facturaDate = new Date(factura.fecha_emision);

        if (dateFrom && facturaDate < dateFrom) return false;
        if (dateTo && facturaDate > dateTo) return false;

        return true;
      });
    }

    // Filtro por palabra clave
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase().trim();
      filtered = filtered.filter(factura =>
        factura.numero_factura.toLowerCase().includes(keyword) ||
        factura.emisor_nombre.toLowerCase().includes(keyword) ||
        factura.emisor_nit.toLowerCase().includes(keyword) ||
        (factura.descripcion && factura.descripcion.toLowerCase().includes(keyword))
      );
    }

    // Ordenamiento por fecha de emisión
    filtered = [...filtered].sort((a, b) => {
      const dateA = new Date(a.fecha_emision || a.created_at);
      const dateB = new Date(b.fecha_emision || b.created_at);

      if (sortByDate === 'oldest') {
        return dateA.getTime() - dateB.getTime();
      } else {
        return dateB.getTime() - dateA.getTime();
      }
    });

    return filtered;
  };

  const calcularTotalPagadoBancos = () => {
    return getFilteredFacturas()
      .filter(f => f.metodo_pago === 'Pago Banco')
      .reduce((total, factura) => {
        const monto = factura.valor_real_a_pagar ?? factura.total_a_pagar ?? 0;
        return total + Math.round(Number(monto));
      }, 0);
  };

  const calcularTotalPagadoTobias = () => {
    return getFilteredFacturas()
      .filter(f => f.metodo_pago === 'Pago Tobías')
      .reduce((total, factura) => {
        const monto = factura.valor_real_a_pagar ?? factura.total_a_pagar ?? 0;
        return total + Math.round(Number(monto));
      }, 0);
  };

  const calcularTotalPagadoCaja = () => {
    return getFilteredFacturas()
      .filter(f => f.metodo_pago === 'Caja')
      .reduce((total, factura) => {
        const monto = factura.valor_real_a_pagar ?? factura.total_a_pagar ?? 0;
        return total + Math.round(Number(monto));
      }, 0);
  };

  const calcularTotalGeneral = () => {
    return getFilteredFacturas()
      .reduce((total, factura) => {
        const monto = factura.valor_real_a_pagar ?? factura.total_a_pagar ?? 0;
        return total + Math.round(Number(monto));
      }, 0);
  };

  const handleSistematizar = async (factura: Factura) => {
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

      // Refrescar datos para actualizar la vista
      fetchFacturas();
    } catch (error) {
      console.error('Error sistematizando factura:', error);
      toast({
        title: "Error",
        description: "No se pudo sistematizar la factura",
        variant: "destructive"
      });
    }
  };

  const handleIngresoSistema = async (factura: Factura) => {
    try {
      const nuevoEstado = !factura.ingresado_sistema;

      const { error } = await supabase
        .from('facturas')
        .update({ ingresado_sistema: nuevoEstado })
        .eq('id', factura.id);

      if (error) throw error;

      toast({
        title: nuevoEstado ? "Marcado como ingresado" : "Marcado como pendiente",
        description: `La factura ${factura.numero_factura} ha sido actualizada.`,
      });

      // Refrescar datos
      fetchFacturas();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado",
        variant: "destructive"
      });
    }
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
          <h1 className="text-3xl font-bold tracking-tight">Mercancía Pagada</h1>
          <p className="text-muted-foreground">
            Historial de facturas de mercancía que han sido pagadas.
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

              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por número, emisor, NIT o descripción..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="pl-8 w-[300px]"
                  />
                </div>
              </div>

              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">Ordenar por fecha</label>
                <Select value={sortByDate} onValueChange={(value: 'newest' | 'oldest') => setSortByDate(value)}>
                  <SelectTrigger className="w-[180px]">
                    <SortAsc className="mr-2 h-4 w-4" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Más recientes</SelectItem>
                    <SelectItem value="oldest">Más antiguas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDateFrom(undefined);
                    setDateTo(undefined);
                    setSearchKeyword('');
                    setSortByDate('newest');
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
            icon={Package}
            color="blue"
          />
          <ModernStatsCard
            title="Pagado por Bancos"
            value={formatCurrency(calcularTotalPagadoBancos())}
            icon={Banknote}
            color="green"
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
              <Package className="w-5 h-5" />
              Facturas de Mercancía Pagadas
            </CardTitle>
            <CardDescription>
              Historial de facturas de mercancía que han sido procesadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p>Cargando facturas...</p>
              </div>
            ) : filteredFacturas.length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {dateFrom || dateTo
                    ? "No hay facturas pagadas en el período seleccionado"
                    : "No hay facturas pagadas"
                  }
                </p>
              </div>
            ) : (
              <FacturasTable
                facturas={filteredFacturas}
                onClassifyClick={() => {}}
                onSistematizarClick={handleSistematizar}
                refreshData={fetchFacturas}
                showActions={true}
                showClassifyButton={false}
                showSistematizarButton={true}
                showIngresoSistema={true}
                onIngresoSistemaClick={handleIngresoSistema}
                highlightedId={highlightedId}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  );
}