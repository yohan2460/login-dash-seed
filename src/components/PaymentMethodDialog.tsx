import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CreditCard, Building2 } from 'lucide-react';
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
  factura_iva?: number | null;
  factura_iva_porcentaje?: number | null;
  descripcion?: string | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  numero_serie?: string | null;
  estado_mercancia?: string | null;
}

interface PaymentMethodDialogProps {
  factura: Factura | null;
  isOpen: boolean;
  onClose: () => void;
  onPaymentProcessed: () => void;
}

export function PaymentMethodDialog({ factura, isOpen, onClose, onPaymentProcessed }: PaymentMethodDialogProps) {
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  const handlePayment = async (paymentMethod: string) => {
    if (!factura) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('facturas')
        .update({ estado_mercancia: 'pagada' })
        .eq('id', factura.id);

      if (error) throw error;

      toast({
        title: "Factura pagada",
        description: `Factura ${factura.numero_factura} marcada como pagada via ${paymentMethod}`,
      });

      onPaymentProcessed();
      onClose();
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast({
        title: "Error",
        description: "No se pudo procesar el pago",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!factura) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Cómo fue el pago?</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground mb-4">
            <p><strong>Factura:</strong> {factura.numero_factura}</p>
            <p><strong>Emisor:</strong> {factura.emisor_nombre}</p>
            <p><strong>Total:</strong> {new Intl.NumberFormat('es-CO', {
              style: 'currency',
              currency: 'COP'
            }).format(factura.total_a_pagar)}</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={() => handlePayment('Pago Banco')}>
              <CardContent className="p-4">
                <Button 
                  variant="ghost" 
                  className="w-full h-auto p-0 flex items-center space-x-3"
                  disabled={processing}
                >
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Pago Banco</div>
                    <div className="text-sm text-muted-foreground">Transferencia bancaria</div>
                  </div>
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={() => handlePayment('Pago Tobías')}>
              <CardContent className="p-4">
                <Button 
                  variant="ghost" 
                  className="w-full h-auto p-0 flex items-center space-x-3"
                  disabled={processing}
                >
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CreditCard className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Pago Tobías</div>
                    <div className="text-sm text-muted-foreground">Método Tobías</div>
                  </div>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={processing}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}