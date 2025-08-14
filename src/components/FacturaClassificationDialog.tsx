import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Package, CreditCard } from 'lucide-react';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
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
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!factura || !classification) return;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('facturas')
        .update({ clasificacion: classification })
        .eq('id', factura.id);

      if (error) throw error;

      toast({
        title: "Clasificación actualizada",
        description: `La factura ${factura.numero_factura} ha sido clasificada como ${classification}`
      });

      onClassificationUpdated();
      onClose();
      setClassification('');
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
                  <RadioGroupItem value="gasto" id="gasto" />
                  <Label htmlFor="gasto" className="flex items-center space-x-2 cursor-pointer flex-1">
                    <CreditCard className="w-4 h-4 text-green-600" />
                    <span>Gasto</span>
                  </Label>
                </div>
              </RadioGroup>
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