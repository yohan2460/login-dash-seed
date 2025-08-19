import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FacturasTable } from '@/components/FacturasTable';
import { FacturaClassificationDialog } from '@/components/FacturaClassificationDialog';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, Filter, Search, TrendingUp, TrendingDown, Calendar as CalendarLucide, Clock, DollarSign, FileText, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
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
  user_id?: string;
}

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const { toast } = useToast();
  
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(false);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isClassificationDialogOpen, setIsClassificationDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  const fetchFacturas = async () => {
    try {
      setLoadingFacturas(true);
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Validar y filtrar datos válidos
      const validData = (data || []).filter(f => f && f.id && typeof f.id === 'string');
      console.log('Dashboard: facturas cargadas:', validData.length);
      setFacturas(validData);
    } catch (error) {
      console.error('Error fetching facturas:', error);
    } finally {
      setLoadingFacturas(false);
    }
  };

  const handleDelete = (facturaId: string) => {
    console.log('Dashboard handleDelete called with ID:', facturaId);
    if (!facturaId) {
      console.error('Dashboard: ID de factura inválido');
      return;
    }
    setFacturas(prev => {
      const validPrev = Array.isArray(prev) ? prev : [];
      return validPrev.filter(f => f && typeof f === 'object' && f.id && f.id !== facturaId);
    });
  };

  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  const handleClassifyClick = (factura: Factura) => {
    setSelectedFactura(factura);
    setIsClassificationDialogOpen(true);
  };

  const handlePayClick = (factura: Factura) => {
    setSelectedFactura(factura);
    setIsPaymentDialogOpen(true);
  };

  const handleClassificationUpdated = async () => {
    fetchFacturas();
    setIsClassificationDialogOpen(false);
  };

  const handlePaymentProcessed = () => {
    fetchFacturas();
    setIsPaymentDialogOpen(false);
  };

  const filterFacturasByType = (type: string | null) => {
    if (type === null) return facturas.filter(f => !f.clasificacion);
    return facturas.filter(f => f.clasificacion === type);
  };

  const getFilteredFacturas = () => {
    let filtered = facturas;

    // Filtrar por tipo
    if (filterType !== 'all') {
      if (filterType === 'sin-clasificar') {
        filtered = filtered.filter(f => !f.clasificacion);
      } else {
        filtered = filtered.filter(f => f.clasificacion === filterType);
      }
    }

    // Filtrar por término de búsqueda
    if (searchTerm) {
      filtered = filtered.filter(f =>
        f.numero_factura.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.emisor_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.emisor_nit.includes(searchTerm)
      );
    }

    // Filtrar por rango de fechas
    if (dateFrom || dateTo) {
      filtered = filtered.filter(f => {
        const facturaDate = new Date(f.created_at);
        const fromMatch = !dateFrom || facturaDate >= dateFrom;
        const toMatch = !dateTo || facturaDate <= dateTo;
        return fromMatch && toMatch;
      });
    }

    return filtered;
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calculateStats = () => {
    const totalFacturas = facturas.length;
    const sinClasificar = facturas.filter(f => !f.clasificacion).length;
    const mercancia = facturas.filter(f => f.clasificacion === 'mercancia').length;
    const gastos = facturas.filter(f => f.clasificacion === 'gasto').length;
    const totalMonto = facturas.reduce((sum, f) => sum + f.total_a_pagar, 0);

    return {
      totalFacturas,
      sinClasificar,
      mercancia,
      gastos,
      totalMonto
    };
  };

  const stats = calculateStats();
  const filteredFacturas = getFilteredFacturas();

  if (loading || loadingFacturas) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-lg">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard de Facturas</h1>
            <p className="text-muted-foreground">Gestiona y analiza tus facturas</p>
          </div>
          <div className="flex gap-4">
            <Button variant="outline" onClick={handleSignOut}>
              Cerrar Sesión
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Facturas</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalFacturas}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sin Clasificar</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.sinClasificar}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mercancía</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.mercancia}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gastos</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.gastos}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{formatCurrency(stats.totalMonto)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar facturas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="sin-clasificar">Sin clasificar</SelectItem>
                  <SelectItem value="mercancia">Mercancía</SelectItem>
                  <SelectItem value="gasto">Gastos</SelectItem>
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "PPP", { locale: es }) : "Fecha desde"}
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

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "PPP", { locale: es }) : "Fecha hasta"}
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

            {(searchTerm || filterType !== 'all' || dateFrom || dateTo) && (
              <div className="mt-4 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterType('all');
                    setDateFrom(null);
                    setDateTo(null);
                  }}
                >
                  Limpiar filtros
                </Button>
                <Badge variant="secondary">
                  {filteredFacturas.length} de {facturas.length} facturas
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Facturas Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Facturas ({filteredFacturas.length})
            </CardTitle>
            <CardDescription>
              Lista completa de facturas con opciones de clasificación y gestión
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredFacturas.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No se encontraron facturas con los filtros aplicados</p>
              </div>
            ) : (
              <FacturasTable
                facturas={filteredFacturas}
                onClassifyClick={handleClassifyClick}
                onPayClick={handlePayClick}
                onDelete={handleDelete}
              />
            )}
          </CardContent>
        </Card>

        {/* Dialogs */}
        <FacturaClassificationDialog
          isOpen={isClassificationDialogOpen}
          onClose={() => setIsClassificationDialogOpen(false)}
          factura={selectedFactura}
          onClassificationUpdated={handleClassificationUpdated}
        />

        <PaymentMethodDialog
          isOpen={isPaymentDialogOpen}
          onClose={() => setIsPaymentDialogOpen(false)}
          factura={selectedFactura}
          onPaymentProcessed={handlePaymentProcessed}
        />
      </div>
    </div>
  );
}