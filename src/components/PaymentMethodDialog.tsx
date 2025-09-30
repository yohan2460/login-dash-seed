import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { CreditCard, Building2, Percent, Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calcularValorRealAPagar, calcularMontoRetencionReal } from '@/utils/calcularValorReal';

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
  valor_real_a_pagar?: number | null;
  descuentos_antes_iva?: string | null;
  total_sin_iva?: number | null;
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };


  // Obtener valor real disponible (prioritariamente de BD, sino calculado)
  const obtenerValorRealDisponible = (factura: Factura) => {
    // Si ya tenemos el valor_real_a_pagar en la BD, usarlo
    if (factura.valor_real_a_pagar !== null && factura.valor_real_a_pagar !== undefined) {
      return factura.valor_real_a_pagar;
    }

    // Si no, calcularlo dinámicamente
    return calcularValorRealAPagar(factura);
  };

  // Obtener valor final basado en la selección del usuario
  const obtenerValorFinal = (factura: Factura) => {
    // Si el usuario no ha seleccionado aún, usar el valor de la BD
    if (!usedProntoPago) {
      return obtenerValorRealDisponible(factura);
    }

    // Si el usuario seleccionó "Sí, con descuento", usar el valor real a pagar (que ya incluye descuento)
    if (usedProntoPago === 'yes') {
      return obtenerValorRealDisponible(factura);
    }

    // Si el usuario seleccionó "No, sin descuento", recalcular SIN el descuento de pronto pago
    if (usedProntoPago === 'no') {
      // Calcular dinámicamente sin el descuento de pronto pago
      const facturaParaCalculo = {
        ...factura,
        porcentaje_pronto_pago: null // Anular el pronto pago
      };

      return calcularValorRealAPagar(facturaParaCalculo);
    }

    return obtenerValorRealDisponible(factura);
  };

  // Actualizar automáticamente el monto pagado cuando cambie el pronto pago
  useEffect(() => {
    if (factura) {
      const valorReal = obtenerValorFinal(factura);
      setAmountPaid(new Intl.NumberFormat('es-CO').format(valorReal));
    }
  }, [usedProntoPago, factura]);

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
      // Calcular el valor real a pagar basado en la decisión final del usuario
      const facturaParaCalculo = {
        ...factura,
        porcentaje_pronto_pago: usedProntoPago === 'yes' ? factura.porcentaje_pronto_pago : null
      };
      const valorRealAPagar = calcularValorRealAPagar(facturaParaCalculo);

      const { error } = await supabase
        .from('facturas')
        .update({
          estado_mercancia: 'pagada',
          metodo_pago: selectedPaymentMethod,
          uso_pronto_pago: usedProntoPago === 'yes',
          fecha_pago: new Date().toISOString(),
          valor_real_a_pagar: valorRealAPagar
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
            <p className="mb-2"><strong>Factura:</strong> {factura.numero_factura}</p>
            <p className="mb-3"><strong>Emisor:</strong> {factura.emisor_nombre}</p>

            {/* Desglose de valores */}
            <div className="border-t pt-3 mt-3 space-y-1">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Desglose de la factura:</p>

              {/* Valor antes de IVA */}
              <div className="flex justify-between items-center">
                <span className="text-xs">Valor antes de IVA:</span>
                <span className="font-medium">
                  {formatCurrency(factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0)))}
                </span>
              </div>

              {/* IVA */}
              {factura.factura_iva && factura.factura_iva > 0 && (
                <div className="flex justify-between items-center text-blue-600">
                  <span className="text-xs">
                    IVA ({factura.factura_iva_porcentaje || 19}%):
                  </span>
                  <span className="font-medium">
                    +{formatCurrency(factura.factura_iva)}
                  </span>
                </div>
              )}

              {/* Total con IVA */}
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-xs font-semibold">Total con IVA:</span>
                <span className="font-bold text-base">
                  {formatCurrency(factura.total_a_pagar)}
                </span>
              </div>
            </div>

            {/* Mostrar descuentos antes de IVA si existen */}
            {factura.descuentos_antes_iva && (() => {
              try {
                const descuentos = JSON.parse(factura.descuentos_antes_iva);
                const totalDescuentos = descuentos.reduce((sum: number, desc: any) => {
                  if (desc.tipo === 'porcentaje') {
                    const base = factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0));
                    return sum + (base * desc.valor / 100);
                  }
                  return sum + desc.valor;
                }, 0);

                return (
                  <div className="text-purple-600 text-xs space-y-1 mt-2 p-2 bg-purple-50 rounded">
                    <p className="font-semibold">Descuentos aplicados:</p>
                    {descuentos.map((desc: any, index: number) => (
                      <p key={index} className="ml-2">
                        • {desc.concepto}: {desc.tipo === 'porcentaje' ? `${desc.valor}%` : formatCurrency(desc.valor)}
                        {desc.tipo === 'porcentaje' && ` = ${formatCurrency((factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0))) * desc.valor / 100)}`}
                      </p>
                    ))}
                    <p className="font-semibold mt-1">
                      Total descuentos: -{formatCurrency(totalDescuentos)}
                    </p>
                  </div>
                );
              } catch {
                return null;
              }
            })()}

            {/* Mostrar retención si aplica */}
            {factura.tiene_retencion && factura.monto_retencion && (
              <p className="text-orange-600 text-xs mt-2">
                <strong>Retención:</strong> -{formatCurrency(calcularMontoRetencionReal(factura))} ({factura.monto_retencion}%)
              </p>
            )}

            {/* Mostrar descuento por pronto pago si está disponible */}
            {factura.porcentaje_pronto_pago && (
              <p className="text-green-600 text-xs mt-2">
                <strong>Descuento pronto pago disponible:</strong> {factura.porcentaje_pronto_pago}%
                (-{formatCurrency((factura.total_sin_iva || (factura.total_a_pagar - (factura.factura_iva || 0))) * factura.porcentaje_pronto_pago / 100)})
              </p>
            )}

            {/* Valor real a pagar destacado */}
            <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded border-l-2 border-red-500">
              <p className="text-red-700 dark:text-red-300 font-bold text-base">
                <strong>Valor Real a Pagar:</strong> {formatCurrency(obtenerValorRealDisponible(factura))}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">
                (Valor óptimo con retenciones{factura.porcentaje_pronto_pago ? ' y descuento por pronto pago aplicados' : ''})
              </p>
            </div>
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

            {/* Monto sugerido basado en valor real a pagar */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-medium text-blue-800 mb-1">
                💡 Monto sugerido (Valor Real a Pagar):
              </div>
              <div className="text-lg font-bold text-blue-700">
                {formatCurrency(obtenerValorFinal(factura))}
              </div>
              <div className="text-xs text-blue-600 mt-1">
                {usedProntoPago === 'no'
                  ? 'Recalculado sin descuento de pronto pago'
                  : usedProntoPago === 'yes'
                    ? 'Con descuento de pronto pago aplicado'
                    : factura.valor_real_a_pagar
                      ? 'Valor calculado desde la base de datos'
                      : 'Valor calculado dinámicamente'
                }
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => {
                  const valorReal = obtenerValorFinal(factura);
                  setAmountPaid(new Intl.NumberFormat('es-CO').format(valorReal));
                }}
              >
                Usar este monto
              </Button>
            </div>
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