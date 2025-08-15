import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FileText, Search, ExpandIcon, ShrinkIcon, RefreshCw, Building2, Calculator } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProveedorAccordion } from '@/components/ProveedorAccordion';
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

interface ProveedorGroup {
  proveedor: string;
  nit: string;
  facturas: Factura[];
  totalFacturas: number;
  valorTotal: number;
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
  const [expandedAll, setExpandedAll] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  useEffect(() => {
    // Filtrar facturas por término de búsqueda
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
      console.error('Error fetching facturas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las facturas",
        variant: "destructive"
      });
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


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  // Agrupar facturas por proveedor
  const groupFacturasByProveedor = (): ProveedorGroup[] => {
    const groups: { [key: string]: ProveedorGroup } = {};
    
    filteredFacturas.forEach(factura => {
      const key = `${factura.emisor_nombre}-${factura.emisor_nit}`;
      
      if (!groups[key]) {
        groups[key] = {
          proveedor: factura.emisor_nombre,
          nit: factura.emisor_nit,
          facturas: [],
          totalFacturas: 0,
          valorTotal: 0
        };
      }
      
      groups[key].facturas.push(factura);
      groups[key].totalFacturas++;
      groups[key].valorTotal += factura.total_a_pagar;
    });
    
    return Object.values(groups).sort((a, b) => a.proveedor.localeCompare(b.proveedor));
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
      title="Facturas por Proveedor"
      subtitle="Gestiona todas las facturas organizadas por proveedor"
    >
      <div className="space-y-6">
        {/* Search and Controls */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar por número de factura o emisor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedAll(!expandedAll)}
                >
                  {expandedAll ? (
                    <>
                      <ShrinkIcon className="w-4 h-4 mr-2" />
                      Contraer Todo
                    </>
                  ) : (
                    <>
                      <ExpandIcon className="w-4 h-4 mr-2" />
                      Expandir Todo
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchFacturas}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Actualizar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-l-4 border-l-slate-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Total de Facturas
                  </p>
                  <h3 className="text-3xl font-bold text-foreground">
                    {totalFacturas}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    facturas encontradas
                  </p>
                </div>
                <div className="p-3 bg-slate-100 rounded-full">
                  <FileText className="w-6 h-6 text-slate-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-slate-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Proveedores Únicos
                  </p>
                  <h3 className="text-3xl font-bold text-foreground">
                    {totalProveedores}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    empresas diferentes
                  </p>
                </div>
                <div className="p-3 bg-slate-100 rounded-full">
                  <Building2 className="w-6 h-6 text-slate-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-slate-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Valor Total
                  </p>
                  <h3 className="text-2xl font-bold text-foreground">
                    {formatCurrency(valorTotal)}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    suma de todas las facturas
                  </p>
                </div>
                <div className="p-3 bg-slate-100 rounded-full">
                  <Calculator className="w-6 h-6 text-slate-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Facturas por Proveedor */}
        <Card>
          <CardContent className="p-6">
            {proveedoresAgrupados.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No se encontraron facturas</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Las facturas aparecerán aquí cuando lleguen por n8n'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {proveedoresAgrupados.map((grupo, index) => (
                  <ProveedorAccordion
                    key={`${grupo.proveedor}-${grupo.nit}`}
                    grupo={grupo}
                    onClassifyClick={handleClassifyClick}
                    onPayClick={handlePayClick}
                    isExpanded={expandedAll}
                    formatCurrency={formatCurrency}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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