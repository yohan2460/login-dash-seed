import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { CreditCard, Building2, Percent, Banknote } from 'lucide-react';
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
  fecha_pago?: string | null;
}

interface PaymentMethodDialogProps {
  factura: Factura | null;
  isOpen: boolean;
  onClose: () => void;
  onPaymentProcessed: () => void;
}

export function PaymentMethodDialog({ factura, isOpen, onClose, onPaymentProcessed }: PaymentMethodDialogProps) {
  const [processing, setProcessing] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [usedProntoPago, setUsedProntoPago] = useState<string>('');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const { toast } = useToast();

  const handlePayment = async () => {
    if (!factura || !selectedPaymentMethod || !usedProntoPago || !amountPaid) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos requeridos",
        variant: "destructive"
      });
      return;
    }

    const cleanAmount = amountPaid.replace(/,/g, '');
    const amountNumber = parseFloat(cleanAmount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      toast({
        title: "Monto inválido",
        description: "Por favor ingresa un monto válido",
        variant: "destructive"
      });
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('facturas')
        .update({ 
          estado_mercancia: 'pagada',
          metodo_pago: selectedPaymentMethod,
          uso_pronto_pago: usedProntoPago === 'yes',
          monto_pagado: amountNumber,
          fecha_pago: new Date().toISOString()
        })
        .eq('id', factura.id);

      if (error) throw error;

      const prontoPagoText = usedProntoPago === 'yes' ? ' con descuento pronto pago' : ' sin descuento pronto pago';
      
      toast({
        title: "Factura pagada",
        description: `Factura ${factura.numero_factura} marcada como pagada via ${selectedPaymentMethod}${prontoPagoText}`,
      });

      onPaymentProcessed();
      onClose();
      // Reset form
      setSelectedPaymentMethod('');
      setUsedProntoPago('');
      setAmountPaid('');
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
        
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground mb-4 p-3 bg-muted/50 rounded-lg">
            <p><strong>Factura:</strong> {factura.numero_factura}</p>
            <p><strong>Emisor:</strong> {factura.emisor_nombre}</p>
            <p><strong>Total:</strong> {new Intl.NumberFormat('es-CO', {
              style: 'currency',
              currency: 'COP'
            }).format(factura.total_a_pagar)}</p>
            {factura.porcentaje_pronto_pago && (
              <p className="text-green-600 font-medium">
                <strong>Descuento pronto pago disponible:</strong> {factura.porcentaje_pronto_pago}% 
                (${new Intl.NumberFormat('es-CO').format((factura.total_a_pagar * factura.porcentaje_pronto_pago) / 100)})
              </p>
            )}
          </div>

          {/* Método de pago */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Método de pago:</Label>
            <RadioGroup value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
              <div className="grid grid-cols-1 gap-3">
                <Card className={`cursor-pointer transition-all duration-200 ${selectedPaymentMethod === 'Pago Banco' ? 'ring-2 ring-primary bg-accent/50' : 'hover:bg-accent/20'}`}>
                  <CardContent className="p-4">
                    <Label htmlFor="banco" className="cursor-pointer flex items-center space-x-3 w-full">
                      <RadioGroupItem value="Pago Banco" id="banco" />
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Pago Banco</div>
                        <div className="text-sm text-muted-foreground">Transferencia bancaria</div>
                      </div>
                    </Label>
                  </CardContent>
                </Card>

                <Card className={`cursor-pointer transition-all duration-200 ${selectedPaymentMethod === 'Pago Tobías' ? 'ring-2 ring-primary bg-accent/50' : 'hover:bg-accent/20'}`}>
                  <CardContent className="p-4">
                    <Label htmlFor="tobias" className="cursor-pointer flex items-center space-x-3 w-full">
                      <RadioGroupItem value="Pago Tobías" id="tobias" />
                      <div className="p-2 bg-green-100 rounded-lg">
                        <CreditCard className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Pago Tobías</div>
                        <div className="text-sm text-muted-foreground">Método Tobías</div>
                      </div>
                    </Label>
                  </CardContent>
                </Card>

                <Card className={`cursor-pointer transition-all duration-200 ${selectedPaymentMethod === 'Caja' ? 'ring-2 ring-primary bg-accent/50' : 'hover:bg-accent/20'}`}>
                  <CardContent className="p-4">
                    <Label htmlFor="caja" className="cursor-pointer flex items-center space-x-3 w-full">
                      <RadioGroupItem value="Caja" id="caja" />
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <Banknote className="w-5 h-5 text-orange-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Caja</div>
                        <div className="text-sm text-muted-foreground">Pago en efectivo</div>
                      </div>
                    </Label>
                  </CardContent>
                </Card>
              </div>
            </RadioGroup>
          </div>

          {/* Monto pagado */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Monto pagado:</Label>
            <Input
              type="text"
              placeholder="Ingresa el monto pagado (ej: 1,250,000.50)"
              value={amountPaid}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.,]/g, '');
                setAmountPaid(value);
              }}
            />
            {usedProntoPago === 'yes' && factura.porcentaje_pronto_pago && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-sm font-medium text-green-800 mb-1">
                  💡 Monto sugerido con descuento:
                </div>
                <div className="text-lg font-bold text-green-700">
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP'
                  }).format(factura.total_a_pagar - (factura.total_a_pagar * factura.porcentaje_pronto_pago / 100))}
                </div>
                <div className="text-xs text-green-600 mt-1">
                  Ahorro: {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP'
                  }).format(factura.total_a_pagar * factura.porcentaje_pronto_pago / 100)} ({factura.porcentaje_pronto_pago}%)
                </div>
              </div>
            )}
          </div>

          {/* ¿Se aplicó pronto pago? */}
          <div className="space-y-3">
            <Label className="text-base font-medium">¿Se aplicó descuento por pronto pago?</Label>
            <RadioGroup value={usedProntoPago} onValueChange={setUsedProntoPago}>
              <div className="flex space-x-6">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="pronto-si" />
                  <Label htmlFor="pronto-si" className="cursor-pointer flex items-center space-x-2">
                    <Percent className="w-4 h-4 text-green-600" />
                    <span>Sí, con descuento</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="pronto-no" />
                  <Label htmlFor="pronto-no" className="cursor-pointer">
                    No, sin descuento
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="flex justify-between pt-6 border-t">
            <Button variant="outline" onClick={onClose} disabled={processing}>
              Cancelar
            </Button>
            <Button 
              onClick={handlePayment} 
              disabled={processing || !selectedPaymentMethod || !usedProntoPago || !amountPaid}
              className="min-w-[120px]"
            >
              {processing ? "Procesando..." : "Confirmar Pago"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}