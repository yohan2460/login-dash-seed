import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModernLayout } from '@/components/ModernLayout';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { 
  Filter,
  Download,
  Building2, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Receipt,
  CreditCard,
  Calendar,
  Search,
  RefreshCw
} from 'lucide-react';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  clasificacion: string | null;
  clasificacion_original: string | null;
  estado_mercancia: string | null;
  metodo_pago: string | null;
  factura_iva: number | null;
  monto_pagado: number | null;
  uso_pronto_pago: boolean | null;
  porcentaje_pronto_pago: number | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  fecha_pago: string | null;
  created_at: string;
}

interface FilterState {
  fechaInicio: string;
  fechaFin: string;
  proveedor: string;
  clasificacion: string;
  estadoPago: string;
  metodoPago: string;
  montoMinimo: string;
  montoMaximo: string;
}

export default function Informes() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [filteredFacturas, setFilteredFacturas] = useState<Factura[]>([]);
  const [selectedFacturas, setSelectedFacturas] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    fechaInicio: '',
    fechaFin: '',
    proveedor: '',
    clasificacion: '',
    estadoPago: '',
    metodoPago: '',
    montoMinimo: '',
    montoMaximo: ''
  });

  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [facturas, filters, searchTerm]);

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
      toast({
        title: "Error",
        description: "No se pudieron cargar las facturas",
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...facturas];

    // Filtro por búsqueda
    if (searchTerm) {
      filtered = filtered.filter(f => 
        f.emisor_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.numero_factura.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.emisor_nit.includes(searchTerm)
      );
    }

    // Filtro por fechas
    if (filters.fechaInicio) {
      filtered = filtered.filter(f => {
        const fechaFactura = f.fecha_emision || f.created_at;
        return new Date(fechaFactura) >= new Date(filters.fechaInicio);
      });
    }

    if (filters.fechaFin) {
      filtered = filtered.filter(f => {
        const fechaFactura = f.fecha_emision || f.created_at;
        return new Date(fechaFactura) <= new Date(filters.fechaFin);
      });
    }

    // Filtro por proveedor
    if (filters.proveedor) {
      filtered = filtered.filter(f => f.emisor_nit === filters.proveedor);
    }

    // Filtro por clasificación
    if (filters.clasificacion) {
      if (filters.clasificacion === 'sistematizada') {
        filtered = filtered.filter(f => f.clasificacion === 'sistematizada');
      } else {
        filtered = filtered.filter(f => f.clasificacion_original === filters.clasificacion);
      }
    }

    // Filtro por estado de pago
    if (filters.estadoPago) {
      filtered = filtered.filter(f => f.estado_mercancia === filters.estadoPago);
    }

    // Filtro por método de pago
    if (filters.metodoPago) {
      filtered = filtered.filter(f => f.metodo_pago === filters.metodoPago);
    }

    // Filtro por montos
    if (filters.montoMinimo) {
      filtered = filtered.filter(f => f.total_a_pagar >= parseFloat(filters.montoMinimo));
    }

    if (filters.montoMaximo) {
      filtered = filtered.filter(f => f.total_a_pagar <= parseFloat(filters.montoMaximo));
    }

    setFilteredFacturas(filtered);
  };

  const clearFilters = () => {
    setFilters({
      fechaInicio: '',
      fechaFin: '',
      proveedor: '',
      clasificacion: '',
      estadoPago: '',
      metodoPago: '',
      montoMinimo: '',
      montoMaximo: ''
    });
    setSearchTerm('');
  };

  const toggleSelection = (facturaId: string) => {
    setSelectedFacturas(prev =>
      prev.includes(facturaId)
        ? prev.filter(id => id !== facturaId)
        : [...prev, facturaId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedFacturas(
      selectedFacturas.length === filteredFacturas.length
        ? []
        : filteredFacturas.map(f => f.id)
    );
  };

  const exportToExcel = () => {
    if (selectedFacturas.length === 0) {
      toast({
        title: "Error",
        description: "Debe seleccionar al menos una factura para exportar",
        variant: "destructive",
      });
      return;
    }

    const facturasToExport = filteredFacturas.filter(f => selectedFacturas.includes(f.id));
    
    const dataForExcel = facturasToExport.map(factura => ({
      'Proveedor': factura.emisor_nombre,
      'NIT': factura.emisor_nit,
      'Serie de Factura': factura.numero_factura,
      'Clasificación': factura.clasificacion_original || factura.clasificacion || 'Sin clasificar',
      'Fecha de Emisión': factura.fecha_emision ? new Date(factura.fecha_emision).toLocaleDateString('es-CO') : 'No especificada',
      'Fecha de Vencimiento': factura.fecha_vencimiento ? new Date(factura.fecha_vencimiento).toLocaleDateString('es-CO') : 'No especificada',
      'Total de la Factura': factura.total_a_pagar,
      'Total Pagado': factura.monto_pagado || 0,
      'Estado': factura.estado_mercancia || 'Pendiente',
      'Método de Pago': factura.metodo_pago || 'No especificado',
      'Fecha de Pago': factura.fecha_pago ? new Date(factura.fecha_pago).toLocaleDateString('es-CO') : 'No pagada',
      'IVA': factura.factura_iva || 0,
      'Días para Vencer': factura.fecha_vencimiento ? 
        Math.ceil((new Date(factura.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 
        'No especificado'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Facturas');

    const fileName = `informe_facturas_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    toast({
      title: "Exportación exitosa",
      description: `Se exportaron ${facturasToExport.length} facturas a Excel`,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No especificada';
    return new Date(dateString).toLocaleDateString('es-CO');
  };

  const getDaysToExpire = (fechaVencimiento: string | null, estadoPago: string | null) => {
    // Si está pagada, no mostrar días de vencimiento
    if (estadoPago === 'pagada') return null;
    
    if (!fechaVencimiento) return null;
    const today = new Date();
    const expireDate = new Date(fechaVencimiento);
    const diffTime = expireDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getUrgencyBadge = (dias: number | null) => {
    if (dias === null) return null;
    if (dias < 0) return { text: 'VENCIDA', color: 'bg-red-600 text-white' };
    if (dias <= 3) return { text: 'URGENTE', color: 'bg-red-500 text-white' };
    if (dias <= 7) return { text: 'PRÓXIMO', color: 'bg-orange-500 text-white' };
    return null;
  };

  // Calcular estadísticas
  const stats = {
    totalFacturas: filteredFacturas.length,
    totalMonto: filteredFacturas.reduce((sum, f) => sum + f.total_a_pagar, 0),
    totalPagado: filteredFacturas.reduce((sum, f) => sum + (f.monto_pagado || 0), 0),
    totalPendiente: filteredFacturas.filter(f => f.estado_mercancia !== 'pagada').reduce((sum, f) => sum + f.total_a_pagar, 0),
    pagosMercancia: filteredFacturas.filter(f => f.clasificacion_original === 'Mercancía' && f.estado_mercancia === 'pagada').reduce((sum, f) => sum + (f.monto_pagado || 0), 0),
    pagosGastos: filteredFacturas.filter(f => f.clasificacion_original === 'Gastos' && f.estado_mercancia === 'pagada').reduce((sum, f) => sum + (f.monto_pagado || 0), 0),
    pagosTobias: filteredFacturas.filter(f => f.metodo_pago === 'Pago Tobías' && f.estado_mercancia === 'pagada').reduce((sum, f) => sum + (f.monto_pagado || 0), 0),
    pagosBancos: filteredFacturas.filter(f => f.metodo_pago === 'Pago Banco' && f.estado_mercancia === 'pagada').reduce((sum, f) => sum + (f.monto_pagado || 0), 0),
    pagosCaja: filteredFacturas.filter(f => f.metodo_pago === 'Pago Caja' && f.estado_mercancia === 'pagada').reduce((sum, f) => sum + (f.monto_pagado || 0), 0),
    totalImpuestos: filteredFacturas.filter(f => f.estado_mercancia === 'pagada').reduce((sum, f) => sum + (f.factura_iva || 0), 0),
  };

  // Obtener opciones únicas para los filtros
  const uniqueProveedores = Array.from(
    new Map(facturas.map(f => [f.emisor_nit, { nit: f.emisor_nit, nombre: f.emisor_nombre }])).values()
  );
  const uniqueClasificaciones = [...new Set(facturas.map(f => f.clasificacion_original).filter(Boolean))];
  const uniqueMetodosPago = [...new Set(facturas.map(f => f.metodo_pago).filter(Boolean))];

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
      title="Informes Avanzados"
      subtitle="Análisis completo de facturas con filtros y exportación"
    >
      <div className="space-y-6">
        {/* Estadísticas Generales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Receipt className="h-6 w-6 text-blue-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Total Facturas</p>
                  <p className="text-lg font-bold">{stats.totalFacturas}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <DollarSign className="h-6 w-6 text-green-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Total Monto</p>
                  <p className="text-sm font-bold">{formatCurrency(stats.totalMonto)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Total Pagado</p>
                  <p className="text-sm font-bold">{formatCurrency(stats.totalPagado)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Total Pendiente</p>
                  <p className="text-sm font-bold">{formatCurrency(stats.totalPendiente)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Building2 className="h-6 w-6 text-purple-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Pagos Mercancía</p>
                  <p className="text-sm font-bold">{formatCurrency(stats.pagosMercancia)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <CreditCard className="h-6 w-6 text-orange-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Pagos Gastos</p>
                  <p className="text-sm font-bold">{formatCurrency(stats.pagosGastos)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Estadísticas de Métodos de Pago */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Building2 className="h-6 w-6 text-blue-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Pagos por Tobías</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.pagosTobias)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <CreditCard className="h-6 w-6 text-green-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Pagos por Bancos</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.pagosBancos)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <DollarSign className="h-6 w-6 text-purple-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Pagos por Caja</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.pagosCaja)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Receipt className="h-6 w-6 text-red-600" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-muted-foreground">Total Impuestos Pagados</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.totalImpuestos)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros Avanzados */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="w-5 h-5 mr-2" />
              Filtros Avanzados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Búsqueda */}
              <div>
                <Label htmlFor="search">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Proveedor, factura, NIT..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Fecha Inicio */}
              <div>
                <Label htmlFor="fechaInicio">Fecha Inicio</Label>
                <Input
                  id="fechaInicio"
                  type="date"
                  value={filters.fechaInicio}
                  onChange={(e) => setFilters(prev => ({ ...prev, fechaInicio: e.target.value }))}
                />
              </div>

              {/* Fecha Fin */}
              <div>
                <Label htmlFor="fechaFin">Fecha Fin</Label>
                <Input
                  id="fechaFin"
                  type="date"
                  value={filters.fechaFin}
                  onChange={(e) => setFilters(prev => ({ ...prev, fechaFin: e.target.value }))}
                />
              </div>

              {/* Proveedor */}
              <div>
                <Label htmlFor="proveedor">Proveedor</Label>
                <Select value={filters.proveedor || 'todos'} onValueChange={(value) => setFilters(prev => ({ ...prev, proveedor: value === 'todos' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los proveedores</SelectItem>
                    {uniqueProveedores.map(proveedor => (
                      <SelectItem key={proveedor.nit} value={proveedor.nit}>
                        {proveedor.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Clasificación */}
              <div>
                <Label htmlFor="clasificacion">Clasificación</Label>
                <Select value={filters.clasificacion || 'todas'} onValueChange={(value) => setFilters(prev => ({ ...prev, clasificacion: value === 'todas' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar clasificación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las clasificaciones</SelectItem>
                    <SelectItem value="sistematizada">Sistematizada</SelectItem>
                    {uniqueClasificaciones.map(clasificacion => (
                      <SelectItem key={clasificacion} value={clasificacion}>
                        {clasificacion}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Estado de Pago */}
              <div>
                <Label htmlFor="estadoPago">Estado de Pago</Label>
                <Select value={filters.estadoPago || 'todos-estados'} onValueChange={(value) => setFilters(prev => ({ ...prev, estadoPago: value === 'todos-estados' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos-estados">Todos los estados</SelectItem>
                    <SelectItem value="pagada">Pagada</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="vencida">Vencida</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Método de Pago */}
              <div>
                <Label htmlFor="metodoPago">Método de Pago</Label>
                <Select value={filters.metodoPago || 'todos-metodos'} onValueChange={(value) => setFilters(prev => ({ ...prev, metodoPago: value === 'todos-metodos' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos-metodos">Todos los métodos</SelectItem>
                    {uniqueMetodosPago.map(metodo => (
                      <SelectItem key={metodo} value={metodo}>
                        {metodo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Monto Mínimo */}
              <div>
                <Label htmlFor="montoMinimo">Monto Mínimo</Label>
                <Input
                  id="montoMinimo"
                  type="number"
                  placeholder="0"
                  value={filters.montoMinimo}
                  onChange={(e) => setFilters(prev => ({ ...prev, montoMinimo: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={clearFilters}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Limpiar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de Facturas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Facturas ({filteredFacturas.length} de {facturas.length})
              </CardTitle>
              <div className="flex gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={selectedFacturas.length === filteredFacturas.length && filteredFacturas.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span>Seleccionar todas ({selectedFacturas.length} seleccionadas)</span>
                </div>
                <Button 
                  onClick={exportToExcel}
                  disabled={selectedFacturas.length === 0}
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportar Excel
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedFacturas.length === filteredFacturas.length && filteredFacturas.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Serie Factura</TableHead>
                    <TableHead>Clasificación</TableHead>
                    <TableHead>Fecha Emisión</TableHead>
                    <TableHead>Fecha Vencimiento</TableHead>
                    <TableHead>Fecha Pago</TableHead>
                    <TableHead>Total Factura</TableHead>
                    <TableHead>Total Pagado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Método Pago</TableHead>
                    <TableHead>Días Vencimiento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFacturas.map((factura) => {
                    const diasVencimiento = getDaysToExpire(factura.fecha_vencimiento, factura.estado_mercancia);
                    const urgencyBadge = getUrgencyBadge(diasVencimiento);
                    
                    return (
                      <TableRow key={factura.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedFacturas.includes(factura.id)}
                            onCheckedChange={() => toggleSelection(factura.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>
                            <div>{factura.emisor_nombre}</div>
                            <div className="text-xs text-muted-foreground">{factura.emisor_nit}</div>
                          </div>
                        </TableCell>
                        <TableCell>{factura.numero_factura}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {factura.clasificacion_original || factura.clasificacion || 'Sin clasificar'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(factura.fecha_emision)}</TableCell>
                        <TableCell>{formatDate(factura.fecha_vencimiento)}</TableCell>
                        <TableCell className="font-semibold text-blue-600">{formatDate(factura.fecha_pago)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(factura.total_a_pagar)}</TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatCurrency(factura.monto_pagado || 0)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={factura.estado_mercancia === 'pagada' ? 'default' : 'destructive'}>
                            {factura.estado_mercancia || 'Pendiente'}
                          </Badge>
                        </TableCell>
                        <TableCell>{factura.metodo_pago || 'No especificado'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {diasVencimiento !== null && (
                              <>
                                <span className={diasVencimiento < 0 ? 'text-red-600 font-semibold' : ''}>
                                  {diasVencimiento < 0 ? `${Math.abs(diasVencimiento)} días vencida` : `${diasVencimiento} días`}
                                </span>
                                {urgencyBadge && (
                                  <Badge className={`text-xs px-2 py-1 ${urgencyBadge.color}`}>
                                    {urgencyBadge.text}
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  );
}