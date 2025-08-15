import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { 
  FileText, Package, CreditCard, TrendingUp, Receipt, 
  Calculator, Minus, Percent, Filter, CalendarIcon 
} from 'lucide-react';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
import { FacturaClassificationDialog } from '@/components/FacturaClassificationDialog';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
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
}

export default function ModernDashboard() {
  const { user, loading } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(true);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isClassificationDialogOpen, setIsClassificationDialogOpen] = useState(false);
  const [selectedPaymentFactura, setSelectedPaymentFactura] = useState<Factura | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }

  const fetchFacturas = async () => {
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setFacturas(data || []);
    } catch (error) {
      console.error('Error fetching facturas:', error);
    } finally {
      setLoadingFacturas(false);
    }
  };

  const handleClassifyClick = (factura: Factura) => {
    setSelectedFactura(factura);
    setIsClassificationDialogOpen(true);
  };

  const handleClassificationUpdated = () => {
    fetchFacturas();
  };

  const handlePayClick = (factura: Factura) => {
    setSelectedPaymentFactura(factura);
    setIsPaymentDialogOpen(true);
  };

  const handlePaymentProcessed = () => {
    fetchFacturas();
  };

  // Filtering functions
  const filterFacturasByType = (type: string | null) => {
    return facturas.filter(f => f.clasificacion === type);
  };

  const filterFacturasByMercanciaState = (estado: string | null) => {
    const mercanciaFacturas = facturas.filter(f => f.clasificacion === 'mercancia');
    if (estado === null) {
      return mercanciaFacturas.filter(f => f.estado_mercancia !== 'pagada');
    }
    return mercanciaFacturas.filter(f => f.estado_mercancia === estado);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularTotalPagadoBancos = () => {
    return facturas
      .filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Pago Banco')
      .reduce((total, factura) => total + (factura.monto_pagado || 0), 0);
  };

  const calcularTotalPagadoTobias = () => {
    return facturas
      .filter(f => f.clasificacion === 'mercancia' && f.estado_mercancia === 'pagada' && f.metodo_pago === 'Pago Tobías')
      .reduce((total, factura) => total + (factura.monto_pagado || 0), 0);
  };

  const calcularTotalFacturas = () => {
    return facturas
      .filter(f => f.clasificacion === null)
      .reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalImpuestos = () => {
    return facturas
      .filter(f => f.clasificacion === null)
      .reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

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
    <ModernLayout
      title="Dashboard"
      subtitle="Gestión completa de facturas y proveedores"
    >
      {loadingFacturas ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : facturas.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No hay facturas</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Las facturas aparecerán aquí cuando lleguen a través del sistema automatizado
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ModernStatsCard
              title="Sin Clasificar"
              value={filterFacturasByType(null).length.toString()}
              icon={FileText}
              color="red"
            />
            <ModernStatsCard
              title="Mercancía"
              value={filterFacturasByType('mercancia').length.toString()}
              icon={Package}
              color="blue"
            />
            <ModernStatsCard
              title="Gastos"
              value={filterFacturasByType('gasto').length.toString()}
              icon={CreditCard}
              color="green"
            />
            <ModernStatsCard
              title="Total Valor"
              value={formatCurrency(facturas.reduce((sum, f) => sum + f.total_a_pagar, 0))}
              icon={TrendingUp}
              color="purple"
            />
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Todas las Facturas</CardTitle>
            </CardHeader>
            <CardContent>
              <FacturasTable
                facturas={facturas}
                onClassifyClick={handleClassifyClick}
                onPayClick={handlePayClick}
              />
            </CardContent>
          </Card>
        </div>

      )}

      {/* Dialogs */}
      <FacturaClassificationDialog
        factura={selectedFactura}
        isOpen={isClassificationDialogOpen}
        onClose={() => setIsClassificationDialogOpen(false)}
        onClassificationUpdated={handleClassificationUpdated}
      />

      <PaymentMethodDialog
        factura={selectedPaymentFactura}
        isOpen={isPaymentDialogOpen}
        onClose={() => setIsPaymentDialogOpen(false)}
        onPaymentProcessed={handlePaymentProcessed}
      />
    </ModernLayout>
  );
}