import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LogOut, FileText, Plus, Eye, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  notas: string;
  total_a_pagar: number;
  nombre_carpeta_factura: string;
  factura_cufe: string;
  pdf_file_path: string | null;
  created_at: string;
}
export default function Dashboard() {
  const {
    user,
    signOut,
    loading
  } = useAuth();
  const {
    toast
  } = useToast();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(true);
  const [generatingData, setGeneratingData] = useState(false);
  useEffect(() => {
    if (user) {
      fetchFacturas();
    }
  }, [user]);

  // Redirigir a login si no está autenticado
  if (!user && !loading) {
    return <Navigate to="/auth" replace />;
  }
  const fetchFacturas = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('facturas').select('*').order('created_at', {
        ascending: false
      });
      if (error) throw error;
      setFacturas(data || []);
    } catch (error) {
      console.error('Error fetching facturas:', error);
    } finally {
      setLoadingFacturas(false);
    }
  };
  const generateSampleData = async () => {
    setGeneratingData(true);
    try {
      const {
        error
      } = await supabase.rpc('insert_sample_facturas');
      if (error) throw error;
      toast({
        title: "Datos generados",
        description: "Se han agregado 5 facturas de prueba"
      });

      // Recargar las facturas
      fetchFacturas();
    } catch (error) {
      console.error('Error generating sample data:', error);
      toast({
        title: "Error",
        description: "No se pudieron generar los datos de prueba",
        variant: "destructive"
      });
    } finally {
      setGeneratingData(false);
    }
  };
  const handleSignOut = async () => {
    await signOut();
  };
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };
  const viewPDF = async (factura: Factura) => {
    if (!factura.pdf_file_path) {
      toast({
        title: "PDF no disponible",
        description: "Esta factura no tiene un archivo PDF asociado",
        variant: "destructive"
      });
      return;
    }
    try {
      const {
        data
      } = await supabase.storage.from('facturas-pdf').createSignedUrl(factura.pdf_file_path, 60 * 60); // URL válida por 1 hora

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      } else {
        throw new Error('No se pudo generar la URL del PDF');
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
  const downloadPDF = async (factura: Factura) => {
    if (!factura.pdf_file_path) {
      toast({
        title: "PDF no disponible",
        description: "Esta factura no tiene un archivo PDF asociado",
        variant: "destructive"
      });
      return;
    }
    try {
      const {
        data
      } = await supabase.storage.from('facturas-pdf').createSignedUrl(factura.pdf_file_path, 60 * 60); // URL válida por 1 hora

      if (data?.signedUrl) {
        const link = document.createElement('a');
        link.href = data.signedUrl;
        link.download = `factura_${factura.numero_factura}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        throw new Error('No se pudo generar la URL del PDF');
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: "Error",
        description: "No se pudo descargar el archivo PDF",
        variant: "destructive"
      });
    }
  };
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  return <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-semibold">Gestión de Facturas</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="transition-all duration-300 hover:scale-105">
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <Card className="shadow-medium">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl bg-gradient-primary bg-clip-text text-transparent">
                  Facturas Recibidas
                </CardTitle>
                <Button onClick={generateSampleData} variant="outline" size="sm" disabled={generatingData} className="transition-all duration-300 hover:scale-105">
                  <Plus className="w-4 h-4 mr-2" />
                  {generatingData ? 'Generando...' : 'Datos de prueba'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingFacturas ? <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div> : facturas.length === 0 ? <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No hay facturas</h3>
                  <p className="text-muted-foreground">
                    Las facturas aparecerán aquí cuando lleguen por n8n
                  </p>
                </div> : <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número de Factura</TableHead>
                        <TableHead>Emisor</TableHead>
                        <TableHead>Notas</TableHead>
                        <TableHead>Total a Pagar</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {facturas.map(factura => <TableRow key={factura.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">
                            {factura.numero_factura}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{factura.emisor_nombre}</div>
                              <div className="text-sm text-muted-foreground">
                                NIT: {factura.emisor_nit}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate" title={factura.notas}>
                              {factura.notas || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(factura.total_a_pagar)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              {factura.pdf_file_path ? <>
                                  <Button variant="outline" size="sm" onClick={() => viewPDF(factura)} className="transition-all duration-200 hover:scale-105">
                                    <Eye className="w-4 h-4 mr-1" />
                                    Ver
                                  </Button>
                                  
                                </> : <div className="text-sm text-muted-foreground">
                                  PDF no disponible
                                </div>}
                            </div>
                          </TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </div>}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>;
}