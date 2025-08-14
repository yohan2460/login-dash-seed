import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  pdf_file_path: string | null;
  clasificacion?: string | null;
  created_at: string;
}

interface FacturasTableProps {
  facturas: Factura[];
  onClassifyClick: (factura: Factura) => void;
}

export function FacturasTable({ facturas, onClassifyClick }: FacturasTableProps) {
  const { toast } = useToast();

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
      const { data } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(factura.pdf_file_path, 60 * 60);

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

  const getClassificationBadge = (clasificacion: string | null | undefined) => {
    if (!clasificacion) return null;
    
    const styles = {
      mercancia: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      gastos: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    };

    const labels = {
      mercancia: 'Mercancía',
      gastos: 'Gasto'
    };

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[clasificacion as keyof typeof styles]}`}>
        {labels[clasificacion as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número de Factura</TableHead>
            <TableHead>Emisor</TableHead>
            <TableHead>Clasificación</TableHead>
            <TableHead>Total a Pagar</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {facturas.map(factura => (
            <TableRow key={factura.id} className="hover:bg-muted/50">
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
                {getClassificationBadge(factura.clasificacion) || (
                  <span className="text-sm text-muted-foreground">Sin clasificar</span>
                )}
              </TableCell>
              <TableCell className="font-medium">
                {formatCurrency(factura.total_a_pagar)}
              </TableCell>
              <TableCell>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onClassifyClick(factura)}
                    className="transition-all duration-200 hover:scale-105"
                  >
                    <Tag className="w-4 h-4 mr-1" />
                    Clasificar
                  </Button>
                  
                  {factura.pdf_file_path && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => viewPDF(factura)}
                      className="transition-all duration-200 hover:scale-105"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Ver
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}