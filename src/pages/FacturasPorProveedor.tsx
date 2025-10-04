import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FileText, Search, RefreshCw, ChevronDown, ChevronRight, Eye, Tag, CreditCard, LayoutGrid, List, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FacturaClassificationDialog } from '@/components/FacturaClassificationDialog';
import { PaymentMethodDialog } from '@/components/PaymentMethodDialog';
import { ModernLayout } from '@/components/ModernLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

// Vista Overview con tarjetas expandibles
function OverviewCards({ proveedores, formatCurrency, onViewPDF, onClassifyClick, onPayClick }: any) {
  const [expandedProveedor, setExpandedProveedor] = useState<string | null>(null);
  const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const toggleProveedor = (key: string) => {
    setExpandedProveedor(expandedProveedor === key ? null : key);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {proveedores.map((proveedor: any) => {
        const proveedorKey = `${proveedor.proveedor}-${proveedor.nit}`;
        const isExpanded = expandedProveedor === proveedorKey;

        return (
          <Card key={proveedorKey} className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div
                className="p-4 cursor-pointer hover:bg-muted/20"
                onClick={() => toggleProveedor(proveedorKey)}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{proveedor.proveedor}</h3>
                      <p className="text-xs text-muted-foreground">NIT: {proveedor.nit}</p>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 flex-shrink-0 mt-1" />}
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold">{proveedor.totalFacturas}</p>
                      <p className="text-xs text-muted-foreground">facturas</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(proveedor.valorTotal)}</p>
                      <p className="text-xs text-muted-foreground">valor total</p>
                    </div>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t bg-muted/10">
                  {Object.keys(proveedor.años).sort((a, b) => Number(b) - Number(a)).map((año) => (
                    <div key={año} className="p-3 space-y-2 border-b last:border-b-0">
                      <div className="text-xs font-semibold text-muted-foreground">{año}</div>
                      {Object.keys(proveedor.años[año]).sort((a, b) => Number(b) - Number(a)).map((mes) => {
                        const facturas = proveedor.años[año][mes];
                        return (
                          <div key={mes} className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground pl-2">
                              {mesesNombres[Number(mes)]} ({facturas.length})
                            </div>
                            <div className="space-y-1">
                              {facturas.map((factura: Factura) => (
                                <div key={factura.id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-muted/30 text-xs">
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-medium truncate">{factura.numero_factura}</span>
                                      {factura.numero_serie && (
                                        <span className="text-[10px] text-muted-foreground">Serie: {factura.numero_serie}</span>
                                      )}
                                    </div>
                                    {factura.clasificacion && (
                                      <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${factura.clasificacion === 'mercancia' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                        {factura.clasificacion === 'mercancia' ? 'M' : 'G'}
                                      </span>
                                    )}
                                    {factura.estado_mercancia === 'pagada' && (
                                      <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700">✓</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className="font-semibold">{formatCurrency(factura.total_a_pagar)}</span>
                                    <div className="flex gap-0.5">
                                      {factura.pdf_file_path && (
                                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onViewPDF(factura); }} className="h-6 w-6 p-0 hover:bg-muted">
                                          <Eye className="w-3 h-3" />
                                        </Button>
                                      )}
                                      {!factura.clasificacion && (
                                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onClassifyClick(factura); }} className="h-6 w-6 p-0 hover:bg-muted">
                                          <Tag className="w-3 h-3" />
                                        </Button>
                                      )}
                                      {factura.clasificacion && factura.estado_mercancia !== 'pagada' && (
                                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onPayClick(factura); }} className="h-6 w-6 p-0 hover:bg-muted">
                                          <CreditCard className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Componente para visualizar PDF
function PDFViewer({ pdfUrl, facturaNumero, onClose }: { pdfUrl: string; facturaNumero: string; onClose: () => void }) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>Factura {facturaNumero}</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 w-full overflow-hidden">
          <iframe
            src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`}
            className="w-full h-full border-0"
            title={`PDF Factura ${facturaNumero}`}
            style={{ minHeight: '600px' }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Componente minimalista de proveedor
function ProveedorMinimal({ proveedor, onViewPDF, onClassifyClick, onPayClick, formatCurrency }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-md hover:bg-muted/20 transition-colors">
        <CollapsibleTrigger asChild>
          <div className="p-3 cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isOpen ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
              <span className="font-medium truncate text-sm">{proveedor.proveedor}</span>
              <span className="text-xs text-muted-foreground">({proveedor.totalFacturas})</span>
            </div>
            <span className="text-sm font-semibold flex-shrink-0">{formatCurrency(proveedor.valorTotal)}</span>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t bg-muted/10 p-3 space-y-3">
            {Object.keys(proveedor.años).sort((a, b) => Number(b) - Number(a)).map((año) => (
              <div key={año} className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground px-1">{año}</div>
                {Object.keys(proveedor.años[año]).sort((a, b) => Number(b) - Number(a)).map((mes) => {
                  const facturas = proveedor.años[año][mes];
                  return (
                    <MesMinimal
                      key={mes}
                      mesNombre={mesesNombres[Number(mes)]}
                      facturas={facturas}
                      formatCurrency={formatCurrency}
                      onViewPDF={onViewPDF}
                      onClassifyClick={onClassifyClick}
                      onPayClick={onPayClick}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// Componente minimalista de mes
function MesMinimal({ mesNombre, facturas, formatCurrency, onViewPDF, onClassifyClick, onPayClick }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const total = facturas.reduce((sum: number, f: Factura) => sum + f.total_a_pagar, 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="bg-background rounded border">
        <CollapsibleTrigger asChild>
          <div className="p-2 cursor-pointer hover:bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="text-xs font-medium">{mesNombre}</span>
              <span className="text-xs text-muted-foreground">({facturas.length})</span>
            </div>
            <span className="text-xs font-semibold">{formatCurrency(total)}</span>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t">
            {facturas.map((factura: Factura) => (
              <div key={factura.id} className="p-2 border-b last:border-b-0 hover:bg-muted/20 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium truncate">{factura.numero_factura}</span>
                    {factura.numero_serie && (
                      <span className="text-[10px] text-muted-foreground"> <strong>Serie:</strong>  {factura.numero_serie}</span>
                    )}
                  </div>
                  {factura.clasificacion && (
                    <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${factura.clasificacion === 'mercancia' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {factura.clasificacion === 'mercancia' ? 'M' : 'G'}
                    </span>
                  )}
                  {factura.estado_mercancia === 'pagada' && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700">✓</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="font-semibold">{formatCurrency(factura.total_a_pagar)}</span>
                  <div className="flex gap-0.5">
                    {factura.pdf_file_path && (
                      <Button variant="ghost" size="sm" onClick={() => onViewPDF(factura)} className="h-6 w-6 p-0 hover:bg-muted">
                        <Eye className="w-3 h-3" />
                      </Button>
                    )}
                    {!factura.clasificacion && (
                      <Button variant="ghost" size="sm" onClick={() => onClassifyClick(factura)} className="h-6 w-6 p-0 hover:bg-muted">
                        <Tag className="w-3 h-3" />
                      </Button>
                    )}
                    {factura.clasificacion && factura.estado_mercancia !== 'pagada' && (
                      <Button variant="ghost" size="sm" onClick={() => onPayClick(factura)} className="h-6 w-6 p-0 hover:bg-muted">
                        <CreditCard className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function FacturasPorProveedor() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [filteredFacturas, setFilteredFacturas] = useState<Factura[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [isClassificationDialogOpen, setIsClassificationDialogOpen] = useState(false);
  const [selectedPaymentFactura, setSelectedPaymentFactura] = useState<Factura | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(null);
  const [currentPdfFactura, setCurrentPdfFactura] = useState<string>('');

  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredFacturas(facturas);
    } else {
      const filtered = facturas.filter(factura =>
        factura.numero_factura.toLowerCase().includes(searchTerm.toLowerCase()) ||
        factura.emisor_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        factura.emisor_nit.includes(searchTerm)
      );
      setFilteredFacturas(filtered);
    }
  }, [searchTerm, facturas]);

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
      toast({
        title: "Error",
        description: "No se pudieron cargar las facturas",
        variant: "destructive"
      });
    } finally {
      setLoadingFacturas(false);
    }
  };

  const handleViewPDF = async (factura: Factura) => {
    if (!factura.pdf_file_path) {
      toast({ title: "PDF no disponible", variant: "destructive" });
      return;
    }

    try {
      const { data } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(factura.pdf_file_path, 60 * 60);

      if (data?.signedUrl) {
        setCurrentPdfUrl(data.signedUrl);
        setCurrentPdfFactura(factura.numero_factura);
        setPdfViewerOpen(true);
      }
    } catch (error) {
      toast({ title: "Error al abrir PDF", variant: "destructive" });
    }
  };

  const handleClassifyClick = (factura: Factura) => {
    setSelectedFactura(factura);
    setIsClassificationDialogOpen(true);
  };

  const handlePayClick = (factura: Factura) => {
    setSelectedPaymentFactura(factura);
    setIsPaymentDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const groupFacturasByProveedor = () => {
    const groups: any = {};

    filteredFacturas.forEach(factura => {
      const proveedorKey = `${factura.emisor_nombre}-${factura.emisor_nit}`;

      // Usar fecha de emisión si está disponible, sino usar created_at
      const fechaStr = factura.fecha_emision || factura.created_at;
      const fecha = new Date(fechaStr);
      const año = fecha.getFullYear();
      const mes = fecha.getMonth();

      if (!groups[proveedorKey]) {
        groups[proveedorKey] = {
          proveedor: factura.emisor_nombre,
          nit: factura.emisor_nit,
          años: {},
          totalFacturas: 0,
          valorTotal: 0
        };
      }

      if (!groups[proveedorKey].años[año]) {
        groups[proveedorKey].años[año] = {};
      }

      if (!groups[proveedorKey].años[año][mes]) {
        groups[proveedorKey].años[año][mes] = [];
      }

      groups[proveedorKey].años[año][mes].push(factura);
      groups[proveedorKey].totalFacturas++;
      groups[proveedorKey].valorTotal += factura.total_a_pagar;
    });

    return Object.values(groups).sort((a: any, b: any) => a.proveedor.localeCompare(b.proveedor));
  };

  const proveedoresAgrupados = groupFacturasByProveedor();
  const totalFacturas = filteredFacturas.length;
  const totalProveedores = proveedoresAgrupados.length;
  const valorTotal = filteredFacturas.reduce((sum, factura) => sum + factura.total_a_pagar, 0);

  if (loading || loadingFacturas) {
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
      title="Gestión de Facturas"
      subtitle="Explora todas las facturas organizadas por rubro, año, mes y carpeta individual"
    >
      <div className="space-y-4">
        {/* Estadísticas compactas */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{totalFacturas}</div>
              <div className="text-xs text-muted-foreground">Facturas encontradas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{totalProveedores}</div>
              <div className="text-xs text-muted-foreground">Proveedores </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{formatCurrency(valorTotal)}</div>
              <div className="text-xs text-muted-foreground">Valor total</div>
            </CardContent>
          </Card>
        </div>

        {/* Búsqueda y controles */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número de factura o emisor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchFacturas}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs para vista Overview y Lista */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="w-4 h-4" />
              Lista
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            {proveedoresAgrupados.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No se encontraron facturas</h3>
                  <p className="text-sm text-muted-foreground">
                    {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Las facturas aparecerán aquí cuando lleguen'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <OverviewCards
                proveedores={proveedoresAgrupados}
                formatCurrency={formatCurrency}
                onViewPDF={handleViewPDF}
                onClassifyClick={handleClassifyClick}
                onPayClick={handlePayClick}
              />
            )}
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            {proveedoresAgrupados.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No se encontraron facturas</h3>
                  <p className="text-sm text-muted-foreground">
                    {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Las facturas aparecerán aquí cuando lleguen'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {proveedoresAgrupados.map((proveedor: any) => (
                  <ProveedorMinimal
                    key={`${proveedor.proveedor}-${proveedor.nit}`}
                    proveedor={proveedor}
                    onViewPDF={handleViewPDF}
                    onClassifyClick={handleClassifyClick}
                    onPayClick={handlePayClick}
                    formatCurrency={formatCurrency}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <FacturaClassificationDialog
        factura={selectedFactura}
        isOpen={isClassificationDialogOpen}
        onClose={() => setIsClassificationDialogOpen(false)}
        onClassificationUpdated={fetchFacturas}
      />

      <PaymentMethodDialog
        factura={selectedPaymentFactura}
        isOpen={isPaymentDialogOpen}
        onClose={() => setIsPaymentDialogOpen(false)}
        onPaymentProcessed={fetchFacturas}
      />

      {/* PDF Viewer */}
      {pdfViewerOpen && currentPdfUrl && (
        <PDFViewer
          pdfUrl={currentPdfUrl}
          facturaNumero={currentPdfFactura}
          onClose={() => {
            setPdfViewerOpen(false);
            setCurrentPdfUrl(null);
            setCurrentPdfFactura('');
          }}
        />
      )}
    </ModernLayout>
  );
}
