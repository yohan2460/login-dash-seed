import { useState, useEffect, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useInvalidateFacturas } from '@/hooks/useInvalidateFacturas';
import { PeriodoFilter } from '@/components/PeriodoFilter';
import { filtrarPorPeriodo, obtenerAniosDisponibles, PERIODO_VACIO, type Periodo } from '@/utils/periodo';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/integrations/supabase/fetchAll';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CreditCard, DollarSign, Calculator, TrendingUp, Search, SortAsc } from 'lucide-react';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
import { EditFacturaDialog } from '@/components/EditFacturaDialog';
import { MultiplePaymentDialog } from '@/components/MultiplePaymentDialog';
import { NotaCreditoDialog } from '@/components/NotaCreditoDialog';
import { ModernLayout } from '@/components/ModernLayout';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { calcularValorRealAPagar, calcularMontoRetencionReal, obtenerBaseSinIVAOriginal } from '@/utils/calcularValorReal';

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
  total_sin_iva?: number | null;
  notas?: string | null;
  descuentos_antes_iva?: string | null;
}

export function GastosPendientes() {
  const { user, loading } = useAuth();
  const invalidarFacturas = useInvalidateFacturas();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: facturasData,
    isLoading
  } = useSupabaseQuery<Factura[]>(
    ['facturas', 'gastos-pendientes'],
    async () => {
      return await fetchAllRows<Factura>(
        (from, to) => supabase
          .from('facturas')
          .select('*')
          .eq('clasificacion', 'gasto')
          .or('estado_mercancia.is.null,estado_mercancia.neq.pagada')
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
        { label: 'gastos pendientes' }
      );
    },
    { enabled: !!user }
  );
  const facturas = facturasData ?? [];
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedFacturaForEdit, setSelectedFacturaForEdit] = useState<Factura | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [sortByDate, setSortByDate] = useState<'newest' | 'oldest'>('newest');
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_VACIO);
  const [campoFecha, setCampoFecha] = useState<'emision' | 'vencimiento'>('emision');
  const [searchKeyword, setSearchKeyword] = useState('');

  const aniosDisponibles = useMemo(
    () => obtenerAniosDisponibles(facturas, f =>
      campoFecha === 'vencimiento' ? f.fecha_vencimiento : (f.fecha_emision || f.created_at)
    ),
    [facturas, campoFecha]
  );
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectedFacturasForPayment, setSelectedFacturasForPayment] = useState<Factura[]>([]);
  const [isMultiplePaymentDialogOpen, setIsMultiplePaymentDialogOpen] = useState(false);
  const [selectedFacturaForNotaCredito, setSelectedFacturaForNotaCredito] = useState<Factura | null>(null);
  const [isNotaCreditoDialogOpen, setIsNotaCreditoDialogOpen] = useState(false);

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

  const handleNotaCredito = (factura: Factura) => {
    setSelectedFacturaForNotaCredito(factura);
    setIsNotaCreditoDialogOpen(true);
  };

  const handleNotaCreditoCreated = () => {
    invalidarFacturas();
    setIsNotaCreditoDialogOpen(false);
    setSelectedFacturaForNotaCredito(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  // Estas cinco sumas alimentan las tarjetas de arriba. Reciben la lista ya
  // filtrada a propósito: antes leían `facturas` sin filtrar, así que filtrar
  // por período cambiaba la tabla pero las tarjetas seguían mostrando el total
  // de TODO. Un filtro que no se refleja en los totales es peor que no tenerlo:
  // parece que la plata no cuadra. MercanciaPendiente ya lo hacía bien.
  const calcularTotalFacturas = (lista: Factura[]) => {
    return lista.reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalImpuestos = (lista: Factura[]) => {
    return lista.reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const calcularTotalRetenciones = (lista: Factura[]) => {
    return lista.reduce((total, factura) => total + calcularMontoRetencionReal(factura), 0);
  };

  const calcularTotalProntoPago = (lista: Factura[]) => {
    return lista
      .filter(f => f.porcentaje_pronto_pago && f.porcentaje_pronto_pago > 0)
      .reduce((total, factura) => {
        const montoBase = obtenerBaseSinIVAOriginal(factura);
        const descuento = montoBase * ((factura.porcentaje_pronto_pago || 0) / 100);
        return total + descuento;
      }, 0);
  };

  const calcularTotalValorReal = (lista: Factura[]) => {
    return lista.reduce((total, factura) => total + calcularValorRealAPagar(factura), 0);
  };

  const getFilteredFacturas = () => {
    // Filtro por período. En pendientes el campo importa: por emisión
    // respondés "qué facturé en septiembre", por vencimiento respondés
    // "qué tengo que pagar en septiembre". Dan conjuntos distintos.
    let filtered = filtrarPorPeriodo(facturas, periodo, f =>
      campoFecha === 'vencimiento' ? f.fecha_vencimiento : (f.fecha_emision || f.created_at)
    );

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

  // Una sola evaluación por render. Antes se llamaba a getFilteredFacturas()
  // siete veces —cinco tarjetas más dos usos en el JSX— y cada llamada
  // recorría y reordenaba la lista completa de nuevo.
  const filteredFacturas = useMemo(
    () => getFilteredFacturas(),
    [facturas, periodo, campoFecha, searchKeyword, sortByDate]
  );

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

              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">Filtrar por</label>
                <Select
                  value={campoFecha}
                  onValueChange={(value: 'emision' | 'vencimiento') => setCampoFecha(value)}
                >
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emision">Fecha de emisión</SelectItem>
                    <SelectItem value="vencimiento">Fecha de vencimiento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <PeriodoFilter
                anios={aniosDisponibles}
                periodo={periodo}
                onChange={setPeriodo}
                mostrarLimpiar={false}
              />

              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchKeyword('');
                    setSortByDate('newest');
                    setPeriodo(PERIODO_VACIO);
                    setCampoFecha('emision');
                  }}
                >
                  Limpiar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <ModernStatsCard
            title="Total Facturas"
            value={filteredFacturas.length.toString()}
            icon={CreditCard}
            color="green"
          />
          <ModernStatsCard
            title="Monto Total"
            value={formatCurrency(calcularTotalFacturas(filteredFacturas))}
            icon={DollarSign}
            color="blue"
          />
          <ModernStatsCard
            title="Valor Real a Pagar"
            value={formatCurrency(calcularTotalValorReal(filteredFacturas))}
            icon={DollarSign}
            color="red"
          />
          <ModernStatsCard
            title="Total Retenciones"
            value={formatCurrency(calcularTotalRetenciones(filteredFacturas))}
            icon={Calculator}
            color="orange"
          />
          <ModernStatsCard
            title="Ahorro Pronto Pago"
            value={formatCurrency(calcularTotalProntoPago(filteredFacturas))}
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
            ) : filteredFacturas.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchKeyword ? "No se encontraron facturas con los criterios de búsqueda" : "No hay gastos pendientes de pago"}
                </p>
              </div>
            ) : (
              <FacturasTable
                facturas={filteredFacturas}
                onClassifyClick={() => {}}
                onPayClick={handlePay}
                refreshData={invalidarFacturas}
                showClassifyButton={false}
                showValorRealAPagar={true}
                showEditButton={true}
                onEditClick={handleEdit}
                onNotaCreditoClick={handleNotaCredito}
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
          onPaymentProcessed={invalidarFacturas}
        />

        {/* Edit Factura Dialog */}
        <EditFacturaDialog
          isOpen={isEditDialogOpen}
          onClose={() => {
            setIsEditDialogOpen(false);
            setSelectedFacturaForEdit(null);
          }}
          factura={selectedFacturaForEdit}
          onSave={invalidarFacturas}
        />

        {/* Multiple Payment Dialog */}
        <MultiplePaymentDialog
          isOpen={isMultiplePaymentDialogOpen}
          onClose={() => {
            setIsMultiplePaymentDialogOpen(false);
            setSelectedFacturasForPayment([]);
          }}
          facturas={selectedFacturasForPayment}
          onPaymentProcessed={invalidarFacturas}
        />

        {/* Nota de Crédito Dialog */}
        <NotaCreditoDialog
          factura={selectedFacturaForNotaCredito}
          isOpen={isNotaCreditoDialogOpen}
          onClose={() => {
            setIsNotaCreditoDialogOpen(false);
            setSelectedFacturaForNotaCredito(null);
          }}
          onNotaCreditoCreated={handleNotaCreditoCreated}
        />
      </div>
    </ModernLayout>
  );
}
