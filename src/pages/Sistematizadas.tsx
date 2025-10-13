import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Package, CreditCard, Filter, FileText } from 'lucide-react';
import { ModernStatsCard } from '@/components/ModernStatsCard';
import { FacturasTable } from '@/components/FacturasTable';
import { ModernLayout } from '@/components/ModernLayout';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { FacturaInfoDialog } from '@/components/FacturaInfoDialog';
import { PDFViewer } from '@/components/PDFViewer';
import { useToast } from '@/hooks/use-toast';

interface Factura {
  id: string;
  numero_factura: string;
  numero_serie?: string | null;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  nombre_carpeta_factura: string;
  factura_cufe: string;
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
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  metodo_pago?: string | null;
  monto_pagado?: number | null;
  valor_real_a_pagar?: number | null;
  total_sin_iva?: number | null;
  descuentos_antes_iva?: string | null;
  notas?: string | null;
  estado_mercancia?: string | null;
}

export function Sistematizadas() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtroTipo, setFiltroTipo] = useState<string>('all');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectedFacturaForInfo, setSelectedFacturaForInfo] = useState<Factura | null>(null);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isPDFViewerOpen, setIsPDFViewerOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [selectedFacturaForPDF, setSelectedFacturaForPDF] = useState<Factura | null>(null);
  const { data: facturasData, isLoading, refetch } = useSupabaseQuery<Factura[]>(
    ['facturas', 'sistematizadas'],
    async () => {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .eq('clasificacion', 'sistematizada')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    { enabled: !!user }
  );
  const facturas = facturasData ?? [];

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const getFilteredFacturas = () => {
    if (filtroTipo === 'all') {
      return facturas;
    }
    return facturas.filter(f => f.clasificacion_original === filtroTipo);
  };

  const calcularTotalSistematizadas = () => {
    return getFilteredFacturas().length;
  };

  const calcularTotalMercancia = () => {
    return facturas.filter(f => f.clasificacion_original === 'mercancia').length;
  };

  const calcularTotalGastos = () => {
    return facturas.filter(f => f.clasificacion_original === 'gasto').length;
  };

  const calcularMontoTotal = () => {
    return getFilteredFacturas().reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  // Función para abrir el diálogo de información
  const handleViewInfo = (factura: Factura) => {
    setSelectedFacturaForInfo(factura);
    setIsInfoDialogOpen(true);
  };

  // Función para abrir el visor de PDF
  const handleViewPDF = async (factura: Factura) => {
    if (!factura.pdf_file_path) {
      toast({
        title: "PDF no disponible",
        description: "Esta factura no tiene un archivo PDF asociado",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(factura.pdf_file_path, 3600);

      if (error) throw error;

      if (data?.signedUrl) {
        setSelectedFacturaForPDF(factura);
        setPdfUrl(data.signedUrl);
        setIsPDFViewerOpen(true);
      }
    } catch (error) {
      console.error('Error viewing PDF:', error);
      toast({
        title: "Error",
        description: "No se pudo abrir el archivo PDF",
        variant: "destructive"
      });
    }
  };

  // Función para abrir PDF desde el diálogo de información
  const handleViewPDFFromInfo = async () => {
    if (selectedFacturaForInfo) {
      setIsInfoDialogOpen(false);
      await handleViewPDF(selectedFacturaForInfo);
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
          <h1 className="text-3xl font-bold tracking-tight">Facturas Sistematizadas</h1>
          <p className="text-muted-foreground">
            Gestión de facturas que han sido sistematizadas en el proceso contable.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <ModernStatsCard
            title="Total Sistematizadas"
            value={calcularTotalSistematizadas().toString()}
            icon={CheckCircle}
            color="purple"
          />
          <ModernStatsCard
            title="De Mercancía"
            value={calcularTotalMercancia().toString()}
            icon={Package}
            color="blue"
          />
          <ModernStatsCard
            title="De Gastos"
            value={calcularTotalGastos().toString()}
            icon={CreditCard}
            color="green"
          />
          <ModernStatsCard
            title="Monto Total"
            value={formatCurrency(calcularMontoTotal())}
            icon={FileText}
            color="orange"
          />
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>
              Filtra las facturas sistematizadas por su clasificación original
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtrar por tipo:</span>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Seleccionar filtro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="mercancia">Solo Mercancía</SelectItem>
                  <SelectItem value="gasto">Solo Gastos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Facturas Sistematizadas
              {filtroTipo !== 'all' && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({filtroTipo === 'mercancia' ? 'Mercancía' : 'Gastos'})
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Gestión de facturas que han sido sistematizadas en el proceso
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p>Cargando facturas...</p>
              </div>
            ) : filteredFacturas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium mb-2">
                  {filtroTipo === 'all'
                    ? "No hay facturas sistematizadas"
                    : `No hay facturas de ${filtroTipo === 'mercancia' ? 'mercancía' : 'gastos'} sistematizadas`
                  }
                </p>
                <p className="text-sm">
                  Las facturas sistematizadas aparecerán aquí una vez que sean procesadas.
                </p>
              </div>
            ) : (
              <FacturasTable
                facturas={filteredFacturas}
                onClassifyClick={() => {}}
                refreshData={refetch}
                showActions={true}
                showOriginalClassification={true}
                showClassifyButton={false}
                highlightedId={highlightedId}
                allowDelete={false}
                showViewButtons={true}
                onViewInfoClick={handleViewInfo}
                onViewPDFClick={handleViewPDF}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diálogo de información de factura */}
      <FacturaInfoDialog
        isOpen={isInfoDialogOpen}
        onClose={() => {
          setIsInfoDialogOpen(false);
          setSelectedFacturaForInfo(null);
        }}
        factura={selectedFacturaForInfo}
        onViewPDF={handleViewPDFFromInfo}
      />

      {/* Visor de PDF */}
      <PDFViewer
        isOpen={isPDFViewerOpen}
        onClose={() => {
          setIsPDFViewerOpen(false);
          setPdfUrl(null);
          setSelectedFacturaForPDF(null);
        }}
        pdfUrl={pdfUrl}
        title={selectedFacturaForPDF ? `Factura #${selectedFacturaForPDF.numero_factura} - ${selectedFacturaForPDF.emisor_nombre}` : "Visualizador de Factura"}
        descuentosAntesIva={selectedFacturaForPDF?.descuentos_antes_iva}
        totalAPagar={selectedFacturaForPDF?.total_a_pagar}
        totalSinIva={selectedFacturaForPDF?.total_sin_iva}
      />
    </ModernLayout>
  );
}
