import { useState, useEffect, useCallback } from 'react';
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
import { Package, CreditCard, Lightbulb, Loader2 } from 'lucide-react';
import { SerieNumberSuggestion } from '@/utils/serieNumberSuggestion';
import { calcularValorRealAPagar } from '@/utils/calcularValorReal';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  factura_iva?: number;
  clasificacion?: string | null;
}

interface FacturaUpdateData {
  clasificacion: string;
  descripcion: string | null;
  tiene_retencion: boolean;
  monto_retencion: number;
  porcentaje_pronto_pago: number | null;
  numero_serie: string | null;
  estado_mercancia: string | null;
  total_a_pagar: number;
  factura_iva: number;
  valor_real_a_pagar: number;
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
  const [customRetencion, setCustomRetencion] = useState<string>('');
  const [isCustomRetencion, setIsCustomRetencion] = useState<boolean>(false);
  const [porcentajeProntoPago, setPorcentajeProntoPago] = useState<string>('');
  const [numeroSerie, setNumeroSerie] = useState<string>('');
  const [estadoMercancia, setEstadoMercancia] = useState<string>('');
  const [totalAPagar, setTotalAPagar] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestedSerie, setSuggestedSerie] = useState<string | null>(null);
  const { toast } = useToast();

  // Función para obtener sugerencia de número de serie
  const fetchSerieSuggestion = useCallback(async () => {
    if (!factura?.emisor_nit || classification !== 'mercancia') {
      setSuggestedSerie(null);
      return;
    }

    setSuggestionLoading(true);
    try {
      // EJECUTAR DEBUG PARA VER QUÉ PASA
      console.log('🔧 Ejecutando debug antes de sugerir...');
      await SerieNumberSuggestion.debugSeries();

      const suggestion = await SerieNumberSuggestion.suggestNextSerie(factura.emisor_nit);
      console.log(`🎯 Sugerencia final para emisor ${factura.emisor_nit}:`, suggestion);
      setSuggestedSerie(suggestion);
    } catch (error) {
      console.error('Error getting serie suggestion:', error);
      setSuggestedSerie(null);
    } finally {
      setSuggestionLoading(false);
    }
  }, [factura?.emisor_nit, classification]);

  // Efecto para obtener sugerencia cuando se selecciona mercancía
  useEffect(() => {
    if (classification === 'mercancia' && factura?.emisor_nit) {
      fetchSerieSuggestion();
    } else {
      setSuggestedSerie(null);
    }
  }, [classification, factura?.emisor_nit, fetchSerieSuggestion]);

  // Efecto para limpiar estados cuando se cierre el diálogo
  useEffect(() => {
    if (!isOpen) {
      // Reset all form fields when dialog closes
      setClassification('');
      setDescripcion('');
      setTieneRetencion(false);
      setMontoRetencion('');
      setCustomRetencion('');
      setIsCustomRetencion(false);
      setPorcentajeProntoPago('');
      setNumeroSerie('');
      setEstadoMercancia('');
      setTotalAPagar('');
      setSuggestedSerie(null);
      setSuggestionLoading(false);
    }
  }, [isOpen]);

  // Efecto para inicializar el valor del total cuando se abra con una factura
  useEffect(() => {
    if (isOpen && factura) {
      setTotalAPagar(factura.total_a_pagar.toString());
    }
  }, [isOpen, factura]);

  // Función para usar la sugerencia
  const useSuggestion = () => {
    if (suggestedSerie) {
      setNumeroSerie(suggestedSerie);
    }
  };


  const handleSubmit = async () => {
    if (!factura || !classification) return;

    setIsUpdating(true);
    try {
      if (!factura?.id) {
        throw new Error('Factura ID no encontrado');
      }

      const nuevoTotal = parseFloat(totalAPagar) || factura.total_a_pagar;
      const nuevoIVA = calcularIVA();

      // Validar datos
      if (isNaN(nuevoTotal) || nuevoTotal < 0) {
        throw new Error('El total debe ser un número válido mayor a 0');
      }

      console.log('💰 Actualizando factura con nuevos valores:');
      console.log(`📊 Total original: ${formatCurrency(factura.total_a_pagar)}`);
      console.log(`📊 Total nuevo: ${formatCurrency(nuevoTotal)}`);
      console.log(`📊 IVA original: ${formatCurrency(factura.factura_iva || 0)}`);
      console.log(`📊 IVA nuevo: ${formatCurrency(nuevoIVA)}`);

      // Construir los datos para la tabla facturas (incluyendo IVA y valor real a pagar)
      const facturaParaCalculo = {
        total_a_pagar: nuevoTotal,
        tiene_retencion: tieneRetencion,
        monto_retencion: tieneRetencion && (isCustomRetencion ? customRetencion : montoRetencion) ? parseFloat(isCustomRetencion ? customRetencion : montoRetencion) : 0,
        porcentaje_pronto_pago: porcentajeProntoPago && porcentajeProntoPago !== "0" ? parseFloat(porcentajeProntoPago) : null,
        factura_iva: nuevoIVA
      };

      const valorRealAPagar = calcularValorRealAPagar(facturaParaCalculo);

      const updateData: FacturaUpdateData = {
        clasificacion: classification,
        descripcion: descripcion || null,
        tiene_retencion: tieneRetencion,
        monto_retencion: tieneRetencion && (isCustomRetencion ? customRetencion : montoRetencion) ? parseFloat(isCustomRetencion ? customRetencion : montoRetencion) : 0,
        porcentaje_pronto_pago: porcentajeProntoPago && porcentajeProntoPago !== "0" ? parseFloat(porcentajeProntoPago) : null,
        numero_serie: classification === 'mercancia' ? numeroSerie || null : null,
        estado_mercancia: classification === 'mercancia' ? 'pendiente' : null,
        total_a_pagar: nuevoTotal,
        factura_iva: nuevoIVA,
        valor_real_a_pagar: valorRealAPagar
      };

      console.log(`📊 Valor real a pagar calculado: ${formatCurrency(valorRealAPagar)}`);

      console.log('📝 Datos a enviar a tabla facturas:', updateData);

      // Actualizar la tabla facturas
      const { error } = await supabase
        .from('facturas')
        .update(updateData)
        .eq('id', factura.id);

      if (error) {
        console.error('❌ Error actualizando tabla facturas:', error);
        throw error;
      }

      console.log('✅ Tabla facturas actualizada exitosamente con IVA');

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
      setCustomRetencion('');
      setIsCustomRetencion(false);
      setPorcentajeProntoPago('');
      setNumeroSerie('');
      setEstadoMercancia('');
      setTotalAPagar('');
      setSuggestedSerie(null);
      setSuggestionLoading(false);
    } catch (error) {
      console.error('Error updating classification:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      toast({
        title: "Error al clasificar",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Calcular ahorro por pronto pago
  const calcularAhorro = () => {
    if (!totalAPagar || !porcentajeProntoPago || porcentajeProntoPago === "0") return 0;
    const total = parseFloat(totalAPagar) || 0;
    return (total * parseFloat(porcentajeProntoPago)) / 100;
  };

  // Formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  // Calcular IVA automáticamente basado en el total
  const calcularIVA = () => {
    try {
      if (!totalAPagar || !factura) return 0;

      const nuevoTotal = parseFloat(totalAPagar) || 0;
      const totalOriginal = factura.total_a_pagar || 0;

      if (totalOriginal === 0) return 0;

      // Si el total original tenía IVA, calculamos proporcionalmente
      if (factura.factura_iva && factura.factura_iva > 0) {
        // Calcular el porcentaje de IVA original
        const porcentajeIVAOriginal = (factura.factura_iva / totalOriginal) * 100;
        // Aplicar el mismo porcentaje al nuevo total
        return (nuevoTotal * porcentajeIVAOriginal) / 100;
      }

      // Si no había IVA original, asumir 19% si el monto es significativo
      if (nuevoTotal > 0) {
        return nuevoTotal * 0.19; // IVA del 19%
      }

      return 0;
    } catch (error) {
      console.error('Error calculando IVA:', error);
      return 0;
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

            {/* Campo de Total a Pagar */}
            <div className="space-y-2">
              <Label htmlFor="total_a_pagar" className="text-sm font-medium">
                Total a Pagar
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="total_a_pagar"
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalAPagar}
                  onChange={(e) => setTotalAPagar(e.target.value)}
                  placeholder="0.00"
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground min-w-fit">
                  {totalAPagar && !isNaN(parseFloat(totalAPagar)) ? formatCurrency(parseFloat(totalAPagar)) : 'COP $0'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Valor original: {formatCurrency(factura.total_a_pagar)}
                  {factura.factura_iva && factura.factura_iva > 0 && (
                    <span className="ml-2">
                      (IVA original: {formatCurrency(factura.factura_iva)})
                    </span>
                  )}
                </p>
                {totalAPagar && parseFloat(totalAPagar) !== factura.total_a_pagar && (
                  <p className="text-xs text-blue-600 font-medium">
                    IVA recalculado: {formatCurrency(calcularIVA())}
                    {factura.factura_iva && factura.factura_iva > 0 && (
                      <span className="ml-2 text-muted-foreground">
                        (Diferencia: {formatCurrency(calcularIVA() - factura.factura_iva)})
                      </span>
                    )}
                  </p>
                )}
              </div>
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
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Porcentaje de retención
                  </Label>

                  <Select
                    value={isCustomRetencion ? 'custom' : montoRetencion}
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        setIsCustomRetencion(true);
                        setMontoRetencion('');
                      } else {
                        setIsCustomRetencion(false);
                        setMontoRetencion(value);
                        setCustomRetencion('');
                      }
                    }}
                  >
                    <SelectTrigger className="bg-background border-input">
                      <SelectValue placeholder="Seleccionar porcentaje de retención" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-input shadow-lg z-50">
                      <SelectItem value="1" className="hover:bg-accent">1%</SelectItem>
                      <SelectItem value="1.5" className="hover:bg-accent">1.5%</SelectItem>
                      <SelectItem value="2" className="hover:bg-accent">2%</SelectItem>
                      <SelectItem value="2.5" className="hover:bg-accent">2.5%</SelectItem>
                      <SelectItem value="3" className="hover:bg-accent">3%</SelectItem>
                      <SelectItem value="3.5" className="hover:bg-accent">3.5%</SelectItem>
                      <SelectItem value="4" className="hover:bg-accent">4%</SelectItem>
                      <SelectItem value="custom" className="hover:bg-accent">Porcentaje personalizado</SelectItem>
                    </SelectContent>
                  </Select>

                  {isCustomRetencion && (
                    <div>
                      <Label htmlFor="custom_retencion" className="text-sm font-medium">
                        Porcentaje personalizado
                      </Label>
                      <Input
                        id="custom_retencion"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={customRetencion}
                        onChange={(e) => setCustomRetencion(e.target.value)}
                        placeholder="Ej: 2.3"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Ingrese el porcentaje (ej: 2.3 para 2.3%)
                      </p>
                    </div>
                  )}

                  {tieneRetencion && (isCustomRetencion ? customRetencion : montoRetencion) && totalAPagar && (
                    <p className="text-sm text-muted-foreground">
                      Retención estimada: {formatCurrency(((parseFloat(totalAPagar) || 0) * parseFloat(isCustomRetencion ? customRetencion : montoRetencion)) / 100)}
                    </p>
                  )}
                </div>
              )}

              {classification === 'mercancia' && (
                <div className="space-y-3">
                  <Label htmlFor="numero_serie" className="text-sm font-medium">
                    Número de serie
                  </Label>

                  {/* Mostrar sugerencia si está disponible */}
                  {suggestedSerie && !suggestionLoading && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <Lightbulb className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <div className="flex-1">
                        <div className="text-sm text-blue-800 dark:text-blue-300">
                          <span className="font-medium">Sugerencia: </span>
                          <span className="font-mono">{suggestedSerie}</span>
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-400">
                          Basado en el patrón del emisor
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={useSuggestion}
                        className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-800"
                      >
                        Usar
                      </Button>
                    </div>
                  )}

                  {/* Indicador de carga */}
                  {suggestionLoading && (
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Analizando patrones de numeración...
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      id="numero_serie"
                      value={numeroSerie}
                      onChange={(e) => setNumeroSerie(e.target.value)}
                      placeholder={suggestedSerie ? `Sugerencia: ${suggestedSerie}` : "Ingrese el número de serie..."}
                      className="flex-1"
                    />
                    {suggestedSerie && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={fetchSerieSuggestion}
                        disabled={suggestionLoading}
                        className="px-3"
                        title="Obtener nueva sugerencia"
                      >
                        {suggestionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Lightbulb className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}


              <div>
                <Label htmlFor="porcentaje_pronto_pago" className="text-sm font-medium">
                  Porcentaje de pronto pago
                </Label>
                <Select value={porcentajeProntoPago} onValueChange={setPorcentajeProntoPago}>
                  <SelectTrigger className="mt-1 bg-background border-input">
                    <SelectValue placeholder="Seleccionar porcentaje" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-input shadow-lg z-50">
                    <SelectItem value="0" className="hover:bg-accent">Sin descuento</SelectItem>
                    <SelectItem value="1" className="hover:bg-accent">1%</SelectItem>
                    <SelectItem value="2" className="hover:bg-accent">2%</SelectItem>
                    <SelectItem value="3" className="hover:bg-accent">3%</SelectItem>
                    <SelectItem value="4" className="hover:bg-accent">4%</SelectItem>
                    <SelectItem value="5" className="hover:bg-accent">5%</SelectItem>
                  </SelectContent>
                </Select>
                {porcentajeProntoPago && porcentajeProntoPago !== "0" && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Ahorro estimado: {formatCurrency(calcularAhorro())}
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