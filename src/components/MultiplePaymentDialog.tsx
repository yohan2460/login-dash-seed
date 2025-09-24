import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Package, Calculator, X, CheckCircle } from 'lucide-react';
import { calcularValorRealAPagar } from '@/utils/calcularValorReal';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  clasificacion?: string | null;
  factura_iva?: number | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  valor_real_a_pagar?: number | null;
}

interface MultiplePaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  facturas: Factura[];
  onPaymentProcessed: () => void;
}

export function MultiplePaymentDialog({
  isOpen,
  onClose,
  facturas,
  onPaymentProcessed
}: MultiplePaymentDialogProps) {
  const [metodoPago, setMetodoPago] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const calcularTotalOriginal = () => {
    return facturas.reduce((total, factura) => total + factura.total_a_pagar, 0);
  };

  const calcularTotalReal = () => {
    return facturas.reduce((total, factura) => {
      const valorReal = factura.valor_real_a_pagar || calcularValorRealAPagar(factura);
      return total + valorReal;
    }, 0);
  };

  const calcularTotalIVA = () => {
    return facturas.reduce((total, factura) => total + (factura.factura_iva || 0), 0);
  };

  const calcularTotalRetenciones = () => {
    return facturas.reduce((total, factura) => {
      if (!factura.tiene_retencion || !factura.monto_retencion) return total;
      return total + (factura.total_a_pagar * factura.monto_retencion) / 100;
    }, 0);
  };

  const calcularTotalProntoPago = () => {
    return facturas.reduce((total, factura) => {
      if (!factura.porcentaje_pronto_pago || factura.porcentaje_pronto_pago === 0) return total;
      const montoBase = factura.total_a_pagar - (factura.factura_iva || 0);
      const descuento = montoBase * (factura.porcentaje_pronto_pago / 100);
      return total + descuento;
    }, 0);
  };

  const handlePayment = async () => {
    if (!metodoPago) {
      toast({
        title: "Error",
        description: "Selecciona un método de pago",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Actualizar todas las facturas
      const updates = facturas.map(factura => ({
        id: factura.id,
        estado_mercancia: 'pagada',
        metodo_pago: metodoPago,
        fecha_pago: new Date().toISOString(),
        uso_pronto_pago: (factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0) ? true : false,
        monto_pagado: factura.valor_real_a_pagar || calcularValorRealAPagar(factura)
      }));

      // Procesar todas las actualizaciones
      const updatePromises = updates.map(update =>
        supabase
          .from('facturas')
          .update(update)
          .eq('id', update.id)
      );

      const results = await Promise.all(updatePromises);

      // Verificar si hubo errores
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        throw new Error(`Error en ${errors.length} facturas`);
      }

      toast({
        title: "Pago múltiple procesado",
        description: `Se procesaron ${facturas.length} facturas por un total de ${formatCurrency(calcularTotalReal())}`,
      });

      onPaymentProcessed();
      onClose();
    } catch (error) {
      console.error('Error processing multiple payment:', error);
      toast({
        title: "Error en el pago múltiple",
        description: "No se pudieron procesar todas las facturas. Inténtalo de nuevo.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Pago Múltiple - {facturas.length} Facturas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Resumen General */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Resumen del Pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Facturas</p>
                  <p className="text-2xl font-bold text-blue-600">{facturas.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Total Original</p>
                  <p className="text-lg font-semibold">{formatCurrency(calcularTotalOriginal())}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Total a Pagar</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(calcularTotalReal())}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Ahorro Total</p>
                  <p className="text-lg font-semibold text-green-500">
                    {formatCurrency(calcularTotalOriginal() - calcularTotalReal())}
                  </p>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground">IVA Total</p>
                  <p className="font-semibold">{formatCurrency(calcularTotalIVA())}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Retenciones</p>
                  <p className="font-semibold text-orange-600">-{formatCurrency(calcularTotalRetenciones())}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">Pronto Pago</p>
                  <p className="font-semibold text-green-600">-{formatCurrency(calcularTotalProntoPago())}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Facturas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Facturas Seleccionadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {facturas.map((factura, index) => (
                  <div key={factura.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">#{factura.numero_factura}</span>
                        <Badge variant="outline" className="text-xs">
                          {factura.clasificacion === 'mercancia' ? 'Mercancía' : 'Gasto'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {factura.emisor_nombre}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatCurrency(factura.valor_real_a_pagar || calcularValorRealAPagar(factura))}
                      </p>
                      {factura.total_a_pagar !== (factura.valor_real_a_pagar || calcularValorRealAPagar(factura)) && (
                        <p className="text-xs text-muted-foreground line-through">
                          {formatCurrency(factura.total_a_pagar)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Método de Pago */}
          <Card>
            <CardHeader>
              <CardTitle>Método de Pago</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={metodoPago} onValueChange={setMetodoPago}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar método de pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pago Banco">Pago Banco</SelectItem>
                  <SelectItem value="Pago Tobías">Pago Tobías</SelectItem>
                  <SelectItem value="Caja">Caja</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Botones */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isProcessing}
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={handlePayment}
              className="flex-1"
              disabled={!metodoPago || isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Procesando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Pagar {formatCurrency(calcularTotalReal())}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}