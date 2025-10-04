import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Package, DollarSign, Calculator, TrendingUp, Archive, AlertTriangle, Search, SortAsc } from 'lucide-react';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
import { EditFacturaDialog } from '@/components/EditFacturaDialog';
import { MultiplePaymentDialog } from '@/components/MultiplePaymentDialog';
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
  ingresado_sistema?: boolean | null;
}

export function MercanciaPendiente() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedFacturaForEdit, setSelectedFacturaForEdit] = useState<Factura | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [sortByDate, setSortByDate] = useState<'newest' | 'oldest'>('newest');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectedFacturasForPayment, setSelectedFacturasForPayment] = useState<Factura[]>([]);
  const [isMultiplePaymentDialogOpen, setIsMultiplePaymentDialogOpen] = useState(false);

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
        .select('*, ingresado_sistema')
        .eq('clasificacion', 'mercancia')
        .neq('estado_mercancia', 'pagada')
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

  const handleEdit = (factura: Factura) => {
    setSelectedFacturaForEdit(factura);
    setIsEditDialogOpen(true);
  };

  const handleMultiplePayment = (facturas: Factura[]) => {
    setSelectedFacturasForPayment(facturas);
    setIsMultiplePaymentDialogOpen(true);
  };

  const handleIngresoSistema = async (factura: Factura) => {
    try {
      const nuevoEstadoSistema = !factura.ingresado_sistema;

      const { error } = await supabase
        .from('facturas')
        .update({ ingresado_sistema: nuevoEstadoSistema })
        .eq('id', factura.id);

      if (error) throw error;

      // Actualizar localmente para feedback inmediato
      setFacturas(prev => prev.map(f =>
        f.id === factura.id
          ? { ...f, ingresado_sistema: nuevoEstadoSistema }
          : f
      ));

    } catch (error) {
      console.error('Error updating ingresado_sistema:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularMontoRetencionReal = (factura: Factura) => {
    if (!factura.tiene_retencion || !factura.monto_retencion) return 0;
    const baseParaRetencion = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
    return (baseParaRetencion * factura.monto_retencion) / 100;
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
      .filter(f => f.porcentaje_pronto_pago && f.porcentaje_pronto_pago > 0)
      .reduce((total, factura) => {
        const montoBase = factura.total_a_pagar - (factura.factura_iva || 0);
        const descuento = montoBase * ((factura.porcentaje_pronto_pago || 0) / 100);
        return total + descuento;
      }, 0);
  };

  const calcularTotalValorReal = () => {
    return facturas.reduce((total, factura) => total + calcularValorRealAPagar(factura), 0);
  };

  const calcularFacturasPendientes = () => {
    return facturas.filter(f => !f.ingresado_sistema).length;
  };

  const calcularFacturasIngresadas = () => {
    return facturas.filter(f => f.ingresado_sistema === true).length;
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
          <h1 className="text-3xl font-bold tracking-tight">Mercancía Pendiente</h1>
          <p className="text-muted-foreground">
            Gestiona las facturas de mercancía que están pendientes de pago.
          </p>
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <ModernStatsCard
            title="Total Facturas"
            value={facturas.length.toString()}
            icon={Package}
            color="blue"
          />
          <ModernStatsCard
            title="Monto Total Facturas"
            value={formatCurrency(calcularTotalFacturas())}
            icon={DollarSign}
            color="blue"
          />
          <ModernStatsCard
            title="Total Impuestos"
            value={formatCurrency(calcularTotalImpuestos())}
            icon={Calculator}
            color="purple"
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
            color="purple"
          />
          <ModernStatsCard
            title="Ahorro Pronto Pago"
            value={formatCurrency(calcularTotalProntoPago())}
            icon={TrendingUp}
            color="green"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Facturas de Mercancía Pendientes
            </CardTitle>
            <CardDescription>
              Facturas clasificadas como mercancía que están pendientes de pago
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p>Cargando facturas...</p>
              </div>
            ) : getFilteredFacturas().length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchKeyword ? "No se encontraron facturas con los criterios de búsqueda" : "No hay facturas pendientes de pago"}
                </p>
              </div>
            ) : (
              <FacturasTable
                facturas={getFilteredFacturas()}
                onClassifyClick={() => {}}
                onPayClick={handlePay}
                refreshData={fetchFacturas}
                showClassifyButton={false}
                showValorRealAPagar={true}
                showIngresoSistema={true}
                onIngresoSistemaClick={handleIngresoSistema}
                showEditButton={true}
                onEditClick={handleEdit}
                showMultiplePayment={true}
                onMultiplePayClick={handleMultiplePayment}
                highlightedId={highlightedId}
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

        {/* Edit Factura Dialog */}
        <EditFacturaDialog
          isOpen={isEditDialogOpen}
          onClose={() => {
            setIsEditDialogOpen(false);
            setSelectedFacturaForEdit(null);
          }}
          factura={selectedFacturaForEdit}
          onSave={fetchFacturas}
        />

        {/* Multiple Payment Dialog */}
        <MultiplePaymentDialog
          isOpen={isMultiplePaymentDialogOpen}
          onClose={() => {
            setIsMultiplePaymentDialogOpen(false);
            setSelectedFacturasForPayment([]);
          }}
          facturas={selectedFacturasForPayment}
          onPaymentProcessed={fetchFacturas}
        />
      </div>
    </ModernLayout>
  );
}