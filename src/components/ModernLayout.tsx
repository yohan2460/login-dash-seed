import { ReactNode, useState, useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Search, Sun, Moon, FileText, X, Eye, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { calcularMontoRetencionReal, calcularValorRealAPagar } from "@/utils/calcularValorReal";

interface ModernLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

interface Factura {
  id: string;
  numero_factura: string;
  numero_serie: string | null;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  clasificacion: string | null;
  clasificacion_original: string | null;
  estado_mercancia: string | null;
  metodo_pago: string | null;
  factura_iva: number | null;
  monto_pagado: number | null;
  valor_real_a_pagar: number | null;
  uso_pronto_pago: boolean | null;
  porcentaje_pronto_pago: number | null;
  tiene_retencion: boolean | null;
  monto_retencion: number | null;
  total_sin_iva: number | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  fecha_pago: string | null;
  pdf_file_path: string | null;
  notas: string | null;
}

export function ModernLayout({ children, title, subtitle, actions }: ModernLayoutProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Factura[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Cerrar resultados al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Búsqueda en tiempo real
  useEffect(() => {
    const searchFacturas = async () => {
      if (searchTerm.trim().length < 2) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      console.log('🔍 Buscando:', searchTerm);
      setSearching(true);
      try {
        // Búsqueda solo en campos de texto garantizados
        const { data, error } = await supabase
          .from('facturas')
          .select('*')
          .or(`numero_factura.ilike.%${searchTerm}%,emisor_nombre.ilike.%${searchTerm}%,emisor_nit.ilike.%${searchTerm}%`)
          .limit(20);

        if (error) {
          console.error('❌ Error en búsqueda:', error);
          throw error;
        }

        console.log('✅ Resultados encontrados:', data?.length || 0);
        setSearchResults(data || []);
        setShowResults(true);
      } catch (error) {
        console.error('Error buscando facturas:', error);
        setSearchResults([]);
        setShowResults(false);
      } finally {
        setSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchFacturas, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatFechaSafe = (fecha: string | null): string => {
    if (!fecha) return 'No especificada';
    try {
      const fechaSoloFecha = fecha.split('T')[0];
      const [year, month, day] = fechaSoloFecha.split('-').map(num => parseInt(num, 10));
      const dayStr = day.toString().padStart(2, '0');
      const monthStr = month.toString().padStart(2, '0');
      const yearStr = year.toString();
      return `${dayStr}/${monthStr}/${yearStr}`;
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const getFacturaRoute = (factura: Factura) => {
    console.log('🔍 Debug getFacturaRoute:', {
      id: factura.id,
      numero: factura.numero_factura,
      clasificacion: factura.clasificacion,
      clasificacion_original: factura.clasificacion_original,
      estado_mercancia: factura.estado_mercancia
    });

    // Nota de crédito
    if (factura.clasificacion === 'nota_credito') {
      return `/notas-credito?highlight=${factura.id}`;
    }

    // Sistematizada
    if (factura.clasificacion === 'sistematizada') {
      return `/sistematizadas?highlight=${factura.id}`;
    }

    // Sin clasificar
    if (!factura.clasificacion || factura.clasificacion === 'sin clasificar') {
      return `/sin-clasificar?highlight=${factura.id}`;
    }

    // Mercancía - usar clasificacion (no clasificacion_original)
    if (factura.clasificacion?.toLowerCase() === 'mercancia') {
      if (factura.estado_mercancia === 'pagada') {
        return `/mercancia-pagada?highlight=${factura.id}`;
      } else if (factura.estado_mercancia === 'pendiente') {
        return `/mercancia-pendiente?highlight=${factura.id}`;
      }
    }

    // Gastos - usar clasificacion (no clasificacion_original)
    if (factura.clasificacion?.toLowerCase() === 'gastos') {
      if (factura.estado_mercancia === 'pagada') {
        return `/gastos-pagados?highlight=${factura.id}`;
      } else if (factura.estado_mercancia === 'pendiente') {
        return `/gastos-pendientes?highlight=${factura.id}`;
      }
    }

    // Por defecto
    console.log('⚠️ Ninguna condición coincidió, usando /sin-clasificar por defecto');
    return `/sin-clasificar?highlight=${factura.id}`;
  };

  const handleViewDetails = (factura: Factura) => {
    setSelectedFactura(factura);
    setShowDetailDialog(true);
    setShowResults(false);
  };

  const handleViewPdf = async (factura: Factura) => {
    if (factura.pdf_file_path) {
      try {
        const { data, error } = await supabase.storage
          .from('facturas-pdf')
          .createSignedUrl(factura.pdf_file_path, 3600);

        if (error) throw error;
        if (data?.signedUrl) {
          window.open(data.signedUrl, '_blank');
        }
      } catch (error) {
        console.error('Error al abrir PDF:', error);
      }
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Modern Header - Sticky/Fixed */}
          <header className="sticky top-0 z-50 h-16 border-b bg-card/95 backdrop-blur-sm flex items-center justify-between px-6 shadow-sm">
            <div className="flex items-center space-x-4">
              <SidebarTrigger className="h-10 w-10 hover:bg-primary/10 hover:text-primary transition-all border border-border rounded-lg flex items-center justify-center" />
              <div className="hidden md:flex items-center space-x-4">
                <div className="relative" ref={searchRef}>
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Buscar facturas (mín. 2 caracteres)..."
                    className="pl-10 pr-10 w-80 bg-muted/30 border-border/50 focus:bg-card focus:border-border transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => {
                        setSearchTerm("");
                        setShowResults(false);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}

                  {/* Resultados de búsqueda */}
                  {showResults && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                      {searching ? (
                        <div className="p-4 text-center text-muted-foreground">
                          Buscando...
                        </div>
                      ) : searchResults.length > 0 ? (
                        <div className="p-2">
                          {searchResults.map((factura) => (
                            <div
                              key={factura.id}
                              className="p-3 hover:bg-muted/50 rounded-lg cursor-pointer border-b border-border/50 last:border-0"
                              onClick={() => handleViewDetails(factura)}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-blue-600" />
                                    <span className="font-semibold text-sm">
                                      {factura.numero_factura}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {factura.clasificacion || 'Sin clasificar'}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {factura.emisor_nombre}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    NIT: {factura.emisor_nit}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold text-sm">
                                    {formatCurrency(factura.total_a_pagar)}
                                  </p>
                                  <Badge
                                    variant={factura.estado_mercancia === 'pagada' ? 'default' : 'destructive'}
                                    className="text-xs mt-1"
                                  >
                                    {factura.estado_mercancia || 'Pendiente'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground">
                          No se encontraron facturas
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="hover:bg-muted transition-colors"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="hover:bg-muted transition-colors">
                <Bell className="w-4 h-4" />
              </Button>
            </div>
          </header>

          {/* Page Header */}
          {(title || subtitle || actions) && (
            <div className="bg-muted/30 border-b px-6 py-8">
              <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div>
                  {title && (
                    <h1 className="text-3xl font-semibold text-foreground">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>
                  )}
                </div>
                {actions && (
                  <div className="flex items-center space-x-3">
                    {actions}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Content */}
          <main className="flex-1 p-6 bg-muted/10 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>

        {/* Modal de detalles de factura */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Detalles de Factura
              </DialogTitle>
            </DialogHeader>

            {selectedFactura && (
              <div className="space-y-6">
                {/* Información Principal */}
                <Card>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Número de Factura</p>
                        <p className="text-lg font-bold">{selectedFactura.numero_factura}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Número de Serie</p>
                        <p className="text-lg font-semibold">{selectedFactura.numero_serie || 'No especificado'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Proveedor</p>
                        <p className="text-lg font-semibold">{selectedFactura.emisor_nombre}</p>
                        <p className="text-sm text-muted-foreground">NIT: {selectedFactura.emisor_nit}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Clasificación y Estado */}
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Ubicación en el Sistema
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Clasificación</p>
                        <Badge variant="outline" className="mt-1">
                          {selectedFactura.clasificacion_original || selectedFactura.clasificacion || 'Sin clasificar'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Estado</p>
                        <Badge
                          variant={selectedFactura.estado_mercancia === 'pagada' ? 'default' : 'destructive'}
                          className="mt-1"
                        >
                          {selectedFactura.estado_mercancia || 'Pendiente'}
                        </Badge>
                      </div>
                      {selectedFactura.metodo_pago && (
                        <div className="col-span-2">
                          <p className="text-sm text-muted-foreground">Método de Pago</p>
                          <p className="font-medium">{selectedFactura.metodo_pago}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Montos */}
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold mb-4">Información Financiera</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Factura</p>
                        <p className="text-2xl font-bold">{formatCurrency(selectedFactura.total_a_pagar)}</p>
                      </div>
                      {selectedFactura.factura_iva && (
                        <div>
                          <p className="text-sm text-muted-foreground">IVA</p>
                          <p className="text-xl font-semibold text-blue-600">{formatCurrency(selectedFactura.factura_iva)}</p>
                        </div>
                      )}
                      {selectedFactura.valor_real_a_pagar && (
                        <div>
                          <p className="text-sm text-muted-foreground">Valor Real a Pagar</p>
                          <p className="text-xl font-bold text-green-600">{formatCurrency(selectedFactura.valor_real_a_pagar)}</p>
                        </div>
                      )}
                      {selectedFactura.monto_pagado && (
                        <div>
                          <p className="text-sm text-muted-foreground">Monto Pagado</p>
                          <p className="text-xl font-semibold text-green-600">{formatCurrency(selectedFactura.monto_pagado)}</p>
                        </div>
                      )}
                      {selectedFactura.tiene_retencion && (
                        <div>
                          <p className="text-sm text-muted-foreground">Retención ({selectedFactura.monto_retencion}%)</p>
                          <p className="text-lg font-semibold text-orange-600">
                            {formatCurrency(calcularMontoRetencionReal(selectedFactura))}
                          </p>
                        </div>
                      )}
                      {selectedFactura.porcentaje_pronto_pago && (
                        <div>
                          <p className="text-sm text-muted-foreground">Pronto Pago ({selectedFactura.porcentaje_pronto_pago}%)</p>
                          <Badge variant={selectedFactura.uso_pronto_pago ? 'default' : 'secondary'}>
                            {selectedFactura.uso_pronto_pago ? 'Utilizado' : 'No utilizado'}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Fechas */}
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold mb-4">Fechas</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Emisión</p>
                        <p className="font-medium">{formatFechaSafe(selectedFactura.fecha_emision)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Vencimiento</p>
                        <p className="font-medium">{formatFechaSafe(selectedFactura.fecha_vencimiento)}</p>
                      </div>
                      {selectedFactura.fecha_pago && (
                        <div>
                          <p className="text-sm text-muted-foreground">Pago</p>
                          <p className="font-medium text-blue-600">{formatFechaSafe(selectedFactura.fecha_pago)}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Acciones */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      const route = getFacturaRoute(selectedFactura);
                      setShowDetailDialog(false);
                      // Usar window.location para navegación completa y forzar recarga
                      window.location.href = route;
                    }}
                    className="flex-1"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Ir a la Factura
                  </Button>
                  {selectedFactura.pdf_file_path && (
                    <Button
                      variant="outline"
                      onClick={() => handleViewPdf(selectedFactura)}
                      className="flex-1"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Ver PDF
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </SidebarProvider>
  );
}