import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CreditCard, DollarSign, Calculator, TrendingUp } from 'lucide-react';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
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
  estado_mercancia?: string | null;
  created_at: string;
  factura_iva?: number | null;
  descripcion?: string | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  uso_pronto_pago?: boolean | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  valor_real_a_pagar?: number | null;
}

export function GastosPendientes() {
  const { user, loading } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

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
        .or('estado_mercancia.is.null,estado_mercancia.neq.pagada')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFacturas(data || []);
    } catch (error) {
      console.error('Error fetching facturas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePay = (factura: Factura) => {
    setSelectedFactura(factura);
    setIsPaymentDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularMontoRetencionReal = (factura: Factura) => {
    if (!factura.tiene_retencion || !factura.monto_retencion) return 0;
    return (factura.total_a_pagar * factura.monto_retencion) / 100;
  };

  const calcularTotalFacturas = () => {
    return facturas.reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalImpuestos = () => {
    return facturas.reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const calcularTotalRetenciones = () => {
    return facturas.reduce((total, factura) => total + calcularMontoRetencionReal(factura), 0);
  };

  const calcularTotalProntoPago = () => {
    return facturas
      .filter(f => f.uso_pronto_pago)
      .reduce((total, factura) => {
        const montoBase = factura.total_a_pagar - (factura.factura_iva || 0);
        const descuento = montoBase * ((factura.porcentaje_pronto_pago || 0) / 100);
        return total + descuento;
      }, 0);
  };

  const calcularValorRealAPagar = (factura: Factura) => {
    let valorReal = factura.total_a_pagar;

    // Restar retención si aplica
    if (factura.tiene_retencion && factura.monto_retencion) {
      const retencion = calcularMontoRetencionReal(factura);
      valorReal -= retencion;
    }

    // Restar descuento por pronto pago si está disponible
    if (factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0) {
      const montoBase = factura.total_a_pagar - (factura.factura_iva || 0);
      const descuento = montoBase * (factura.porcentaje_pronto_pago / 100);
      valorReal -= descuento;
    }

    return valorReal;
  };

  const calcularTotalValorReal = () => {
    return facturas.reduce((total, factura) => total + calcularValorRealAPagar(factura), 0);
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
          <h1 className="text-3xl font-bold tracking-tight">Gastos Pendientes</h1>
          <p className="text-muted-foreground">
            Gestiona las facturas de gastos que están pendientes de pago.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <ModernStatsCard
            title="Total Facturas"
            value={facturas.length.toString()}
            icon={CreditCard}
            color="green"
          />
          <ModernStatsCard
            title="Monto Total"
            value={formatCurrency(calcularTotalFacturas())}
            icon={DollarSign}
            color="blue"
          />
          <ModernStatsCard
            title="Valor Real a Pagar"
            value={formatCurrency(calcularTotalValorReal())}
            icon={DollarSign}
            color="red"
          />
          <ModernStatsCard
            title="Total Retenciones"
            value={formatCurrency(calcularTotalRetenciones())}
            icon={Calculator}
            color="orange"
          />
          <ModernStatsCard
            title="Ahorro Pronto Pago"
            value={formatCurrency(calcularTotalProntoPago())}
            icon={TrendingUp}
            color="purple"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Facturas de Gastos Pendientes
            </CardTitle>
            <CardDescription>
              Facturas clasificadas como gastos que están pendientes de pago
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p>Cargando facturas...</p>
              </div>
            ) : facturas.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No hay gastos pendientes de pago</p>
              </div>
            ) : (
              <FacturasTable
                facturas={facturas}
                onClassifyClick={() => {}}
                onPayClick={handlePay}
                refreshData={fetchFacturas}
                showClassifyButton={false}
                showValorRealAPagar={true}
              />
            )}
          </CardContent>
        </Card>

        {/* Payment Dialog */}
        <PaymentMethodDialog
          factura={selectedFactura}
          isOpen={isPaymentDialogOpen}
          onClose={() => {
            setIsPaymentDialogOpen(false);
            setSelectedFactura(null);
          }}
          onPaymentProcessed={fetchFacturas}
        />
      </div>
    </ModernLayout>
  );
}