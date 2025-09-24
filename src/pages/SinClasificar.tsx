import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Plus, Search, SortAsc } from 'lucide-react';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
import { FacturaClassificationDialog } from '@/components/FacturaClassificationDialog';
import { ManualFacturaDialog } from '@/components/ManualFacturaDialog';
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
  created_at: string;
  factura_iva?: number | null;
  descripcion?: string | null;
}

export function SinClasificar() {
  const { user, loading } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isClassificationDialogOpen, setIsClassificationDialogOpen] = useState(false);
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
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
        .is('clasificacion', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFacturas(data || []);
    } catch (error) {
      console.error('Error fetching facturas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClassify = (factura: Factura) => {
    setSelectedFactura(factura);
    setIsClassificationDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularTotalFacturas = () => {
    return facturas.reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalImpuestos = () => {
    return facturas.reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const getFilteredFacturas = () => {
    let filtered = facturas;

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
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);

      if (sortByDate === 'oldest') {
        return dateA.getTime() - dateB.getTime();
      } else {
        return dateB.getTime() - dateA.getTime();
      }
    });

    return filtered;
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <ModernLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Facturas Sin Clasificar</h1>
            <p className="text-muted-foreground">
              Gestiona las facturas que aún no han sido clasificadas como mercancía o gasto.
            </p>
          </div>
          <Button
            onClick={() => setIsManualDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Crear Factura Manual
          </Button>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros de Búsqueda</CardTitle>
            <CardDescription>
              Filtra y ordena las facturas según tus criterios
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4">
          <ModernStatsCard
            title="Total Facturas"
            value={facturas.length.toString()}
            icon={FileText}
            color="orange"
          />
          <ModernStatsCard
            title="Monto Total"
            value={formatCurrency(calcularTotalFacturas())}
            icon={FileText}
            color="blue"
          />
          <ModernStatsCard
            title="Total Impuestos"
            value={formatCurrency(calcularTotalImpuestos())}
            icon={FileText}
            color="green"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Facturas Sin Clasificar
            </CardTitle>
            <CardDescription>
              Haz clic en "Clasificar" para asignar una categoría a cada factura
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p>Cargando facturas...</p>
              </div>
            ) : getFilteredFacturas().length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchKeyword ? "No se encontraron facturas con los criterios de búsqueda" : "No hay facturas sin clasificar"}
                </p>
              </div>
            ) : (
              <FacturasTable
                facturas={getFilteredFacturas()}
                onClassifyClick={handleClassify}
                refreshData={fetchFacturas}
              />
            )}
          </CardContent>
        </Card>

        {/* Dialogs */}
        <FacturaClassificationDialog
          factura={selectedFactura}
          isOpen={isClassificationDialogOpen}
          onClose={() => {
            setIsClassificationDialogOpen(false);
            setSelectedFactura(null);
          }}
          onClassificationUpdated={fetchFacturas}
        />

        <ManualFacturaDialog
          isOpen={isManualDialogOpen}
          onClose={() => setIsManualDialogOpen(false)}
          onFacturaCreated={fetchFacturas}
        />
      </div>
    </ModernLayout>
  );
}