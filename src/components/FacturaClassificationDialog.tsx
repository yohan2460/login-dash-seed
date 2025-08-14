import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Package, CreditCard } from 'lucide-react';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  total_a_pagar: number;
  clasificacion?: string | null;
}

interface FacturaClassificationDialogProps {
  factura: Factura | null;
  isOpen: boolean;
  onClose: () => void;
  onClassificationUpdated: () => void;
}

export function FacturaClassificationDialog({
  factura,
  isOpen,
  onClose,
  onClassificationUpdated
}: FacturaClassificationDialogProps) {
  const [classification, setClassification] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [tieneRetencion, setTieneRetencion] = useState<boolean>(false);
  const [montoRetencion, setMontoRetencion] = useState<string>('');
  const [porcentajeProntoPago, setPorcentajeProntoPago] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!factura || !classification) return;

    setIsUpdating(true);
    try {
      const updateData: any = {
        clasificacion: classification,
        descripcion: descripcion || null,
        tiene_retencion: tieneRetencion,
        monto_retencion: tieneRetencion && montoRetencion ? parseFloat(montoRetencion) : 0,
        porcentaje_pronto_pago: porcentajeProntoPago && porcentajeProntoPago !== "0" ? parseFloat(porcentajeProntoPago) : null
      };

      const { error } = await supabase
        .from('facturas')
        .update(updateData)
        .eq('id', factura.id);

      if (error) throw error;

      toast({
        title: "Clasificación actualizada",
        description: `La factura ${factura.numero_factura} ha sido clasificada como ${classification}`
      });

      onClassificationUpdated();
      onClose();
      // Reset all form fields
      setClassification('');
      setDescripcion('');
      setTieneRetencion(false);
      setMontoRetencion('');
      setPorcentajeProntoPago('');
    } catch (error) {
      console.error('Error updating classification:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la clasificación",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Calcular ahorro por pronto pago
  const calcularAhorro = () => {
    if (!factura || !porcentajeProntoPago || porcentajeProntoPago === "0") return 0;
    return (factura.total_a_pagar * parseFloat(porcentajeProntoPago)) / 100;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clasificar Factura</DialogTitle>
        </DialogHeader>
        
        {factura && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Factura: {factura.numero_factura}
              </p>
              <p className="text-sm text-muted-foreground">
                Emisor: {factura.emisor_nombre}
              </p>
            </div>

            <div className="space-y-4">
              <Label className="text-base font-medium">
                Selecciona el tipo de factura:
              </Label>
              
              <RadioGroup
                value={classification}
                onValueChange={setClassification}
                className="space-y-3"
              >
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="mercancia" id="mercancia" />
                  <Label htmlFor="mercancia" className="flex items-center space-x-2 cursor-pointer flex-1">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span>Compra de Mercancía</span>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="gastos" id="gastos" />
                  <Label htmlFor="gastos" className="flex items-center space-x-2 cursor-pointer flex-1">
                    <CreditCard className="w-4 h-4 text-green-600" />
                    <span>Gasto</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="descripcion" className="text-sm font-medium">
                  Descripción (opcional)
                </Label>
                <Textarea
                  id="descripcion"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Agregar descripción adicional..."
                  className="mt-1"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="tiene_retencion"
                  checked={tieneRetencion}
                  onCheckedChange={(checked) => setTieneRetencion(checked === true)}
                />
                <Label htmlFor="tiene_retencion" className="text-sm">
                  Tiene retención
                </Label>
              </div>

              {tieneRetencion && (
                <div>
                  <Label htmlFor="monto_retencion" className="text-sm font-medium">
                    Monto de retención
                  </Label>
                  <Input
                    id="monto_retencion"
                    type="number"
                    value={montoRetencion}
                    onChange={(e) => setMontoRetencion(e.target.value)}
                    placeholder="Ingrese el monto de la retención..."
                    className="mt-1"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="porcentaje_pronto_pago" className="text-sm font-medium">
                  Porcentaje de pronto pago
                </Label>
                <Select value={porcentajeProntoPago} onValueChange={setPorcentajeProntoPago}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Seleccionar porcentaje" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sin descuento</SelectItem>
                    <SelectItem value="1">1%</SelectItem>
                    <SelectItem value="2">2%</SelectItem>
                    <SelectItem value="3">3%</SelectItem>
                    <SelectItem value="4">4%</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                  </SelectContent>
                </Select>
                {porcentajeProntoPago && porcentajeProntoPago !== "0" && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Ahorro estimado: ${calcularAhorro().toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isUpdating}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!classification || isUpdating}
                className="flex-1"
              >
                {isUpdating ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}