import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CheckCircle, Package, CreditCard, Filter, FileText, Search, X, Eye, Download, Receipt, FileCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ModernStatsCard } from '@/components/ModernStatsCard';
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
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
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
  const facturas = facturasData || [];

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
    let filtered = facturas;

    // Filtro por tipo
    if (filtroTipo !== 'all') {
      filtered = filtered.filter(f => f.clasificacion_original === filtroTipo);
    }

    // Filtro por búsqueda
    if (searchTerm.trim() !== '') {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(f =>
        f.numero_factura.toLowerCase().includes(searchLower) ||
        f.emisor_nombre.toLowerCase().includes(searchLower) ||
        f.emisor_nit.toLowerCase().includes(searchLower) ||
        (f.numero_serie && f.numero_serie.toLowerCase().includes(searchLower)) ||
        (f.descripcion && f.descripcion.toLowerCase().includes(searchLower))
      );
    }

    // Filtro por fechas
    if (fechaInicio) {
      filtered = filtered.filter(f => {
        const fechaFactura = f.fecha_emision || f.created_at;
        return fechaFactura >= fechaInicio;
      });
    }

    if (fechaFin) {
      filtered = filtered.filter(f => {
        const fechaFactura = f.fecha_emision || f.created_at;
        return fechaFactura <= fechaFin;
      });
    }

    return filtered;
  };

  const limpiarFiltros = () => {
    setSearchTerm('');
    setFechaInicio('');
    setFechaFin('');
    setFiltroTipo('all');
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

  // Función para obtener comprobante de pago
  const obtenerComprobantePago = async (facturaId: string) => {
    const { data: comprobantes, error } = await supabase
      .from('comprobantes_pago')
      .select('*')
      .filter('facturas_ids', 'cs', `{${facturaId}}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    if (!comprobantes || comprobantes.length === 0) {
      return null;
    }

    return comprobantes[0];
  };

  // Función para descargar comprobante de pago (PDF generado)
  const descargarComprobantePago = async (facturaId: string) => {
    try {
      const comprobante = await obtenerComprobantePago(facturaId);

      if (!comprobante) {
        toast({
          title: "Comprobante no encontrado",
          description: "No hay comprobante de pago asociado a esta factura.",
          variant: "destructive"
        });
        return;
      }

      // Parsear detalles si existen
      let detallesComprobante = null;
      if (comprobante.detalles) {
        try {
          detallesComprobante = typeof comprobante.detalles === 'string'
            ? JSON.parse(comprobante.detalles)
            : comprobante.detalles;
        } catch (error) {
          console.error('Error parseando detalles del comprobante:', error);
        }
      }

      // Obtener el path del PDF (puede estar en el campo directo o en detalles)
      let pdfPath = null;
      if (comprobante.pdf_file_path) {
        pdfPath = comprobante.pdf_file_path;
      } else if (detallesComprobante && typeof detallesComprobante === 'object') {
        const detallesObj = detallesComprobante as any;
        if (detallesObj.pdf_file_path) {
          pdfPath = detallesObj.pdf_file_path;
        }
      }

      if (!pdfPath) {
        toast({
          title: "Archivo no disponible",
          description: "El comprobante no tiene asociado un PDF.",
          variant: "destructive"
        });
        return;
      }

      // IMPORTANTE: El comprobante se guarda en el bucket 'facturas-pdf'
      const { data: urlData, error } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(pdfPath, 3600);

      if (error) throw error;

      if (urlData && urlData.signedUrl) {
        window.open(urlData.signedUrl, '_blank');
        toast({
          title: "Comprobante abierto",
          description: "El comprobante de pago se abrió en una nueva pestaña"
        });
      }
    } catch (error) {
      console.error('Error al abrir comprobante:', error);
      toast({
        title: "Error",
        description: "Hubo un error al abrir el comprobante",
        variant: "destructive"
      });
    }
  };

  // Función para descargar soporte de pago
  const descargarSoportePago = async (facturaId: string) => {
    try {
      const comprobante = await obtenerComprobantePago(facturaId);

      const soportePath = comprobante && comprobante.soporte_pago_file_path
        ? comprobante.soporte_pago_file_path
        : null;

      if (!comprobante || !soportePath) {
        toast({
          title: "Soporte no disponible",
          description: "No se encontró un soporte de pago asociado a esta factura.",
          variant: "destructive"
        });
        return;
      }

      const { data: urlData, error } = await supabase.storage
        .from('soportes-pago')
        .createSignedUrl(soportePath, 3600);

      if (error) throw error;

      if (urlData && urlData.signedUrl) {
        window.open(urlData.signedUrl, '_blank');
        toast({
          title: "Soporte abierto",
          description: "El soporte de pago se abrió en una nueva pestaña"
        });
      }
    } catch (error) {
      console.error('Error al abrir soporte:', error);
      toast({
        title: "Error",
        description: "Hubo un error al abrir el soporte de pago",
        variant: "destructive"
      });
    }
  };

  // Función para descargar factura original
  const descargarFacturaOriginal = async (factura: Factura) => {
    try {
      if (!factura.pdf_file_path) {
        toast({
          title: "Error",
          description: "No hay PDF disponible para esta factura",
          variant: "destructive"
        });
        return;
      }

      const { data } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(factura.pdf_file_path, 3600);

      if (data && data.signedUrl) {
        const link = document.createElement('a');
        link.href = data.signedUrl;
        link.download = 'factura_' + factura.numero_factura + '.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({
          title: "Descarga iniciada",
          description: "El PDF se está descargando...",
        });
      }
    } catch (error) {
      console.error('Error descargando PDF:', error);
      toast({
        title: "Error",
        description: "No se pudo descargar el PDF",
        variant: "destructive"
      });
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
            <CardTitle className="flex items-center justify-between">
              <span>Filtros</span>
              {(searchTerm || fechaInicio || fechaFin || filtroTipo !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={limpiarFiltros}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4 mr-2" />
                  Limpiar filtros
                </Button>
              )}
            </CardTitle>
            <CardDescription>
              Filtra las facturas sistematizadas por tipo, fechas o búsqueda
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Búsqueda */}
              <div className="flex items-center gap-4">
                <Search className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por número de factura, emisor, NIT, serie o descripción..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Filtros en fila */}
              <div className="flex flex-wrap items-center gap-4">
                <Filter className="w-4 h-4 text-muted-foreground" />

                {/* Filtro por tipo */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium whitespace-nowrap">Tipo:</span>
                  <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Seleccionar filtro" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="mercancia">Solo Mercancía</SelectItem>
                      <SelectItem value="gasto">Solo Gastos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Filtro por fecha inicio */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium whitespace-nowrap">Desde:</span>
                  <Input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-[160px]"
                  />
                </div>

                {/* Filtro por fecha fin */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium whitespace-nowrap">Hasta:</span>
                  <Input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
              </div>

              {/* Indicador de resultados */}
              {(searchTerm || fechaInicio || fechaFin || filtroTipo !== 'all') && (
                <div className="text-sm text-muted-foreground">
                  Mostrando {filteredFacturas.length} de {facturas.length} facturas
                </div>
              )}
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
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Factura</TableHead>
                      <TableHead>Emisor</TableHead>
                      <TableHead>NIT</TableHead>
                      <TableHead>Tipo Original</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Fecha Emisión</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFacturas.map((factura) => (
                      <TableRow
                        key={factura.id}
                        className={highlightedId === factura.id ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}
                      >
                        <TableCell className="font-medium">{factura.numero_factura}</TableCell>
                        <TableCell>{factura.emisor_nombre}</TableCell>
                        <TableCell>{factura.emisor_nit}</TableCell>
                        <TableCell>
                          <Badge variant={factura.clasificacion_original === 'mercancia' ? 'default' : 'secondary'}>
                            {factura.clasificacion_original === 'mercancia' ? 'Mercancía' : 'Gasto'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('es-CO', {
                            style: 'currency',
                            currency: 'COP',
                            minimumFractionDigits: 0
                          }).format(factura.total_a_pagar)}
                        </TableCell>
                        <TableCell>
                          {factura.fecha_emision
                            ? new Date(factura.fecha_emision).toLocaleDateString('es-CO')
                            : new Date(factura.created_at).toLocaleDateString('es-CO')
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {/* Ver factura original (PDF) */}
                            {factura.pdf_file_path && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleViewPDF(factura)}
                                      className="h-8 w-8 p-0 hover:bg-blue-50"
                                    >
                                      <Eye className="w-4 h-4 text-blue-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Ver factura original (PDF)
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            {/* Ver resumen de factura */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewInfo(factura)}
                                    className="h-8 w-8 p-0 hover:bg-green-50"
                                  >
                                    <FileText className="w-4 h-4 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Ver resumen de factura
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {/* Ver PDF generado de pago (comprobante) */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => descargarComprobantePago(factura.id)}
                                    className="h-8 w-8 p-0 hover:bg-purple-50"
                                  >
                                    <FileCheck className="w-4 h-4 text-purple-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Ver comprobante de pago (PDF generado)
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {/* Ver soporte de pago */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => descargarSoportePago(factura.id)}
                                    className="h-8 w-8 p-0 hover:bg-orange-50"
                                  >
                                    <Receipt className="w-4 h-4 text-orange-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Ver soporte de pago
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {/* Descargar factura original */}
                            {factura.pdf_file_path && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => descargarFacturaOriginal(factura)}
                                      className="h-8 w-8 p-0 hover:bg-gray-50"
                                    >
                                      <Download className="w-4 h-4 text-gray-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Descargar factura original
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
        descuentosAntesIva={selectedFacturaForPDF && selectedFacturaForPDF.descuentos_antes_iva ? selectedFacturaForPDF.descuentos_antes_iva : undefined}
        totalAPagar={selectedFacturaForPDF && selectedFacturaForPDF.total_a_pagar ? selectedFacturaForPDF.total_a_pagar : undefined}
        totalSinIva={selectedFacturaForPDF && selectedFacturaForPDF.total_sin_iva ? selectedFacturaForPDF.total_sin_iva : undefined}
      />
    </ModernLayout>
  );
}
