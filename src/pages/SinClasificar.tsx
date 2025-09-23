import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText } from 'lucide-react';
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
        <div className="flex flex-col space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Facturas Sin Clasificar</h1>
          <p className="text-muted-foreground">
            Gestiona las facturas que aún no han sido clasificadas como mercancía o gasto.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            ) : facturas.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No hay facturas sin clasificar</p>
              </div>
            ) : (
              <FacturasTable
                facturas={facturas}
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