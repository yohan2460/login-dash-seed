import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatCurrency } from '@/lib/utils';
import { ModernLayout } from '@/components/ModernLayout';
import { FacturasTable } from '@/components/FacturasTable';
import { Hash, Package, Search, ArrowUpDown, Filter, ChevronDown, AlertTriangle, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  factura_iva?: number;
  clasificacion?: string;
  numero_serie?: string;
  estado_mercancia?: string;
  created_at: string;
  fecha_emision?: string;
  descripcion?: string;
  tiene_retencion?: boolean;
  monto_retencion?: number;
  porcentaje_pronto_pago?: number;
  uso_pronto_pago?: boolean;
  metodo_pago?: string;
  monto_pagado?: number;
  fecha_pago?: string;
  pdf_file_path?: string;
  valor_real_a_pagar?: number;
  total_sin_iva?: number;
  descuentos_antes_iva?: string;
}

const ESTADOS_DISPONIBLES = [
  { value: 'pagada', label: 'Pagada', color: 'bg-green-500' },
  { value: 'pendiente', label: 'Pendiente', color: 'bg-yellow-500' },
  { value: 'sistematizada', label: 'Sistematizada', color: 'bg-purple-500' },
  { value: 'sin_estado', label: 'Sin estado', color: 'bg-gray-500' }
];

const MESES = [
  { value: '', label: 'Todos los meses' },
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' }
];

const STORAGE_KEY = 'facturas-por-serie-filtros';

export default function FacturasPorSerie() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEstados, setSelectedEstados] = useState<string[]>(['pagada', 'pendiente', 'sistematizada', 'sin_estado']);
  const [selectedMes, setSelectedMes] = useState<string>('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadFiltersFromStorage();
  }, []);

  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (highlightId) {
      setHighlightedId(highlightId);
      // Limpiar el highlight después de 3 segundos
      const timeout = setTimeout(() => {
        setHighlightedId(null);
        // Remover el parámetro de la URL
        searchParams.delete('highlight');
        setSearchParams(searchParams);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    saveFiltersToStorage();
  }, [selectedEstados, selectedMes]);

  const loadFiltersFromStorage = () => {
    try {
      const savedFilters = localStorage.getItem(STORAGE_KEY);
      if (savedFilters) {
        const { estados, mes } = JSON.parse(savedFilters);
        setSelectedEstados(estados || ['pagada', 'pendiente', 'sistematizada', 'sin_estado']);
        setSelectedMes(mes || '');
      } else {
        setSelectedEstados(['pagada', 'pendiente', 'sistematizada', 'sin_estado']);
        setSelectedMes('');
      }
    } catch (error) {
      setSelectedEstados(['pagada', 'pendiente', 'sistematizada', 'sin_estado']);
      setSelectedMes('');
    }
  };

  const saveFiltersToStorage = () => {
    try {
      const filters = {
        estados: selectedEstados,
        mes: selectedMes
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch (error) {
      console.error('Error saving filters to localStorage:', error);
    }
  };

  const fetchFacturas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .in('clasificacion', ['mercancia', 'sistematizada'])
        .not('numero_serie', 'is', null)
        .order('numero_serie', { ascending: true });

      if (error) throw error;
      setFacturas(data || []);
    } catch (error) {
      console.error('Error fetching facturas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las facturas",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Filtrar y ordenar facturas por término de búsqueda, estado, mes y por serie
  const facturasFiltradas = facturas
    .filter(factura => {
      // Filtro por estado
      let estadoFactura = factura.estado_mercancia || 'sin_estado';

      // Si la clasificacion es sistematizada, usar ese estado
      if (factura.clasificacion === 'sistematizada') {
        estadoFactura = 'sistematizada';
      }

      const estadoIncluido = selectedEstados.includes(estadoFactura);

      if (!estadoIncluido) return false;

      // Filtro por mes
      if (selectedMes) {
        const fechaFactura = factura.fecha_emision || factura.created_at;
        if (fechaFactura) {
          const mesFactura = new Date(fechaFactura).getMonth() + 1;
          const mesFacturaString = mesFactura.toString().padStart(2, '0');
          if (mesFacturaString !== selectedMes) return false;
        } else {
          return false; // Excluir facturas sin fecha si se filtra por mes
        }
      }

      // Filtro por búsqueda
      const searchLower = searchTerm.toLowerCase();

      // Verificar que los campos existan y convertir a string para búsqueda
      const serieMatch = factura.numero_serie
        ? String(factura.numero_serie).toLowerCase().includes(searchLower)
        : false;

      const emisorMatch = factura.emisor_nombre && typeof factura.emisor_nombre === 'string'
        ? factura.emisor_nombre.toLowerCase().includes(searchLower)
        : false;

      const facturaMatch = factura.numero_factura && typeof factura.numero_factura === 'string'
        ? factura.numero_factura.toLowerCase().includes(searchLower)
        : false;

      return serieMatch || emisorMatch || facturaMatch;
    })
    .sort((a, b) => {
      // Obtener series como strings
      const serieA = a.numero_serie ? String(a.numero_serie).trim() : 'Sin serie';
      const serieB = b.numero_serie ? String(b.numero_serie).trim() : 'Sin serie';

      // Manejar caso especial "Sin serie" al final
      if (serieA === 'Sin serie' && serieB !== 'Sin serie') return 1;
      if (serieB === 'Sin serie' && serieA !== 'Sin serie') return -1;
      if (serieA === 'Sin serie' && serieB === 'Sin serie') return 0;

      // Intentar convertir a número para ordenamiento numérico
      const numA = parseInt(serieA, 10);
      const numB = parseInt(serieB, 10);

      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }

      // Si no son números, ordenar alfabéticamente
      return serieA.localeCompare(serieB, 'es', { numeric: true });
    });

  // Calcular estadísticas para las series únicas
  const seriesUnicas = new Set(
    facturasFiltradas.map(f => f.numero_serie ? String(f.numero_serie).trim() : 'Sin serie')
  );

  const totalSeries = seriesUnicas.size;

  // Analizar series numéricas faltantes
  const seriesNumericas = Array.from(seriesUnicas)
    .filter(serie => serie !== 'Sin serie' && !isNaN(parseInt(serie)))
    .map(serie => parseInt(serie))
    .sort((a, b) => a - b);

  const maxSerie = seriesNumericas.length > 0 ? Math.max(...seriesNumericas) : 0;
  const seriesFaltantes = [];

  if (maxSerie > 0) {
    for (let i = 1; i <= maxSerie; i++) {
      if (!seriesNumericas.includes(i)) {
        seriesFaltantes.push(i);
      }
    }
  }

  const handleEstadoChange = (estado: string, checked: boolean) => {
    if (checked) {
      setSelectedEstados(prev => [...prev, estado]);
    } else {
      setSelectedEstados(prev => prev.filter(e => e !== estado));
    }
  };

  const handleSelectAll = () => {
    if (selectedEstados.length === ESTADOS_DISPONIBLES.length) {
      setSelectedEstados([]);
    } else {
      setSelectedEstados(ESTADOS_DISPONIBLES.map(e => e.value));
    }
  };

  const getEstadoBadge = (factura: Factura) => {
    if (factura.clasificacion === 'sistematizada') {
      return <Badge variant="default" className="bg-purple-500">Sistematizada</Badge>;
    } else if (factura.estado_mercancia === 'pagada') {
      return <Badge variant="default" className="bg-green-500">Pagada</Badge>;
    } else if (factura.estado_mercancia === 'pendiente') {
      return <Badge variant="secondary">Pendiente</Badge>;
    }
    return <Badge variant="outline">Sin estado</Badge>;
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

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
    <ModernLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Hash className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Facturas por Serie</h1>
          </div>
          <Badge variant="outline" className="flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3" />
            Ordenado por serie
          </Badge>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <Search className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1">
                <Label htmlFor="search" className="sr-only">Buscar</Label>
                <Input
                  id="search"
                  placeholder="Buscar por serie, emisor o número de factura..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Filter by Estado */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="w-4 h-4" />
                    Estados ({selectedEstados.length})
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Filtrar por Estado</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAll}
                        className="h-8 px-2 text-xs"
                      >
                        {selectedEstados.length === ESTADOS_DISPONIBLES.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {ESTADOS_DISPONIBLES.map((estado) => (
                        <div key={estado.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={estado.value}
                            checked={selectedEstados.includes(estado.value)}
                            onCheckedChange={(checked) => handleEstadoChange(estado.value, checked as boolean)}
                          />
                          <label htmlFor={estado.value} className="flex items-center space-x-2 text-sm cursor-pointer">
                            <div className={`w-3 h-3 rounded-full ${estado.color}`}></div>
                            <span>{estado.label}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Filter by Month */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {selectedMes ? MESES.find(m => m.value === selectedMes)?.label : 'Todos los meses'}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56" align="end">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Filtrar por Mes</h4>
                    <div className="space-y-2">
                      {MESES.map((mes) => (
                        <div key={mes.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={mes.value}
                            checked={selectedMes === mes.value}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedMes(mes.value);
                              } else {
                                setSelectedMes('');
                              }
                            }}
                          />
                          <label htmlFor={mes.value} className="text-sm cursor-pointer">
                            {mes.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Series</CardTitle>
              <Hash className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSeries}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Facturas</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{facturasFiltradas.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Series Faltantes</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{seriesFaltantes.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(facturasFiltradas.reduce((total, f) => total + f.total_a_pagar, 0))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Series Faltantes Card */}
        {seriesFaltantes.length > 0 && (
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-orange-700">
                <AlertTriangle className="w-5 h-5" />
                <span>Series Faltantes (del 1 al {maxSerie})</span>
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                  {seriesFaltantes.length} faltantes
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {seriesFaltantes.map((serie) => (
                  <Badge
                    key={serie}
                    variant="outline"
                    className="border-orange-300 text-orange-700 bg-white dark:bg-orange-950/40"
                  >
                    {serie}
                  </Badge>
                ))}
              </div>
              {seriesFaltantes.length > 20 && (
                <p className="text-sm text-orange-600 mt-2">
                  Se muestran todas las series faltantes. Desplázate para ver más.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tabla única con todas las facturas ordenadas por serie */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Hash className="w-5 h-5 text-primary" />
              <span>Todas las Facturas por Serie</span>
              <Badge variant="secondary">{facturasFiltradas.length} facturas</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FacturasTable
              facturas={facturasFiltradas}
              onClassifyClick={() => {}}
              refreshData={fetchFacturas}
              highlightedId={highlightedId}
            />
          </CardContent>
        </Card>

        {facturasFiltradas.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Hash className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay facturas con serie</h3>
              <p className="text-muted-foreground">
                No se encontraron facturas de mercancía con número de serie asignado.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ModernLayout>
  );
}