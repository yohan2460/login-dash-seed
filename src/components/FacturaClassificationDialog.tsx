import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Package, CreditCard, Lightbulb, Loader2, Receipt, Calculator, Percent, FileText } from 'lucide-react';
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5" />
            Clasificar Factura
          </DialogTitle>
        </DialogHeader>

        {factura && (
          <div className="space-y-6">
            {/* Información de la Factura */}
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="w-4 h-4" />
                  Información de la Factura
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Número de Factura</p>
                    <p className="text-sm text-muted-foreground">{factura.numero_factura}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Emisor</p>
                    <p className="text-sm text-muted-foreground">{factura.emisor_nombre}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">NIT</p>
                    <p className="text-sm text-muted-foreground">{factura.emisor_nit}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Total Original</p>
                    <p className="text-sm font-semibold text-blue-600">{formatCurrency(factura.total_a_pagar)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ajuste de Valores */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calculator className="w-4 h-4" />
                  Ajuste de Valores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="total_a_pagar" className="text-sm font-medium">
                      Total a Pagar
                    </Label>
                    <Input
                      id="total_a_pagar"
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalAPagar}
                      onChange={(e) => setTotalAPagar(e.target.value)}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-muted-foreground">
                      {totalAPagar && !isNaN(parseFloat(totalAPagar)) ? formatCurrency(parseFloat(totalAPagar)) : 'Ingrese el monto'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Información de IVA</Label>
                    <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                      <p className="text-xs text-muted-foreground">
                        IVA original: {formatCurrency(factura.factura_iva || 0)}
                      </p>
                      {totalAPagar && parseFloat(totalAPagar) !== factura.total_a_pagar && (
                        <p className="text-xs text-blue-600 font-medium">
                          IVA recalculado: {formatCurrency(calcularIVA())}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tipo de Clasificación */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="w-4 h-4" />
                  Tipo de Clasificación
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={classification}
                  onValueChange={setClassification}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div className="relative">
                    <RadioGroupItem value="mercancia" id="mercancia" className="peer sr-only" />
                    <Label
                      htmlFor="mercancia"
                      className="flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-blue-50 dark:hover:bg-blue-900/20 peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-50 dark:peer-data-[state=checked]:bg-blue-900/20"
                    >
                      <Package className="w-5 h-5 text-blue-600" />
                      <div>
                        <div className="font-medium">Compra de Mercancía</div>
                        <div className="text-sm text-muted-foreground">Productos para reventa</div>
                      </div>
                    </Label>
                  </div>

                  <div className="relative">
                    <RadioGroupItem value="gasto" id="gasto" className="peer sr-only" />
                    <Label
                      htmlFor="gasto"
                      className="flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-green-50 dark:hover:bg-green-900/20 peer-data-[state=checked]:border-green-500 peer-data-[state=checked]:bg-green-50 dark:peer-data-[state=checked]:bg-green-900/20"
                    >
                      <CreditCard className="w-5 h-5 text-green-600" />
                      <div>
                        <div className="font-medium">Gasto</div>
                        <div className="text-sm text-muted-foreground">Gastos operacionales</div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Configuraciones Adicionales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Columna Izquierda */}
              <div className="space-y-6">
                {/* Descripción */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="w-4 h-4" />
                      Descripción
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      id="descripcion"
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value)}
                      placeholder="Agregar descripción adicional..."
                      rows={3}
                    />
                  </CardContent>
                </Card>

                {/* Retenciones */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Percent className="w-4 h-4" />
                      Retenciones
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="tiene_retencion"
                        checked={tieneRetencion}
                        onCheckedChange={(checked) => setTieneRetencion(checked === true)}
                      />
                      <Label htmlFor="tiene_retencion" className="text-sm font-medium">
                        Aplicar retención
                      </Label>
                    </div>

                    {tieneRetencion && (
                      <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
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
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar porcentaje de retención" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1%</SelectItem>
                            <SelectItem value="1.5">1.5%</SelectItem>
                            <SelectItem value="2">2%</SelectItem>
                            <SelectItem value="2.5">2.5%</SelectItem>
                            <SelectItem value="3">3%</SelectItem>
                            <SelectItem value="3.5">3.5%</SelectItem>
                            <SelectItem value="4">4%</SelectItem>
                            <SelectItem value="custom">Porcentaje personalizado</SelectItem>
                          </SelectContent>
                        </Select>

                        {isCustomRetencion && (
                          <div>
                            <Input
                              id="custom_retencion"
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={customRetencion}
                              onChange={(e) => setCustomRetencion(e.target.value)}
                              placeholder="Ej: 2.3"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Ingrese el porcentaje (ej: 2.3 para 2.3%)
                            </p>
                          </div>
                        )}

                        {tieneRetencion && (isCustomRetencion ? customRetencion : montoRetencion) && totalAPagar && (
                          <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded border-l-2 border-orange-400">
                            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                              Retención estimada: {formatCurrency(((parseFloat(totalAPagar) || 0) * parseFloat(isCustomRetencion ? customRetencion : montoRetencion)) / 100)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Columna Derecha */}
              <div className="space-y-6">
                {/* Número de Serie (solo para mercancía) */}
                {classification === 'mercancia' && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Package className="w-4 h-4" />
                        Número de Serie
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
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
                    </CardContent>
                  </Card>
                )}

                {/* Pronto Pago */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calculator className="w-4 h-4" />
                      Descuento por Pronto Pago
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Select value={porcentajeProntoPago} onValueChange={setPorcentajeProntoPago}>
                      <SelectTrigger>
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
                      <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border-l-2 border-green-400">
                        <p className="text-sm font-medium text-green-800 dark:text-green-300">
                          Ahorro estimado: {formatCurrency(calcularAhorro())}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Separador */}
            <Separator />

            {/* Resumen y Acciones */}
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Resumen de valores */}
                  {classification && totalAPagar && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-muted-foreground">Total Original</p>
                        <p className="font-semibold text-lg">{formatCurrency(factura.total_a_pagar)}</p>
                      </div>
                      {totalAPagar && parseFloat(totalAPagar) !== factura.total_a_pagar && (
                        <div className="text-center">
                          <p className="text-muted-foreground">Total Ajustado</p>
                          <p className="font-semibold text-lg text-blue-600">{formatCurrency(parseFloat(totalAPagar))}</p>
                        </div>
                      )}
                      {(tieneRetencion || (porcentajeProntoPago && porcentajeProntoPago !== "0")) && (
                        <div className="text-center">
                          <p className="text-muted-foreground">Valor Final Estimado</p>
                          <p className="font-semibold text-lg text-green-600">
                            {formatCurrency(
                              parseFloat(totalAPagar) -
                              (tieneRetencion && (isCustomRetencion ? customRetencion : montoRetencion) ?
                                ((parseFloat(totalAPagar) || 0) * parseFloat(isCustomRetencion ? customRetencion : montoRetencion)) / 100 : 0) -
                              (porcentajeProntoPago && porcentajeProntoPago !== "0" ? calcularAhorro() : 0)
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Botones de acción */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className="flex-1 h-11"
                      disabled={isUpdating}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={!classification || isUpdating}
                      className="flex-1 h-11"
                      size="lg"
                    >
                      {isUpdating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4 mr-2" />
                          Clasificar Factura
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}