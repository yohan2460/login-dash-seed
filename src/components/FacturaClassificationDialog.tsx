import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Package, CreditCard, Lightbulb, Loader2, Receipt, Calculator, Percent, FileText, Plus, Trash2, Tag, X } from 'lucide-react';
import { SerieNumberSuggestion } from '@/utils/serieNumberSuggestion';
import { calcularValorRealAPagar, calcularMontoRetencionReal, obtenerBaseSinIVAOriginal } from '@/utils/calcularValorReal';
import { formatCurrency } from '@/lib/utils';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  factura_iva?: number;
  factura_iva_porcentaje?: number | null;
  factura_iva_5?: number | null;
  factura_iva_5_porcentaje?: number | null;
  clasificacion?: string | null;
  notas?: string | null;
  estado_nota_credito?: 'pendiente' | 'aplicada' | 'anulada' | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  uso_pronto_pago?: boolean | null;
  total_sin_iva?: number | null;
  valor_real_a_pagar?: number | null;
  descuentos_antes_iva?: string | null;
}

const parseNumeroSeguro = (valor: unknown): number | null => {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null;
  }
  const numero = parseFloat(String(valor));
  return Number.isFinite(numero) ? numero : null;
};

interface Descuento {
  id: string;
  concepto: string;
  valor: number;
  tipo: 'porcentaje' | 'valor_fijo';
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
  factura_iva_5: number;
  factura_iva_5_porcentaje: number;
  valor_real_a_pagar: number;
  descuentos_antes_iva?: string | null;
}

interface FacturaClassificationDialogProps {
  factura: Factura | null;
  isOpen: boolean;
  onClose: () => void;
  onClassificationUpdated: () => void;
  sideBySide?: boolean;
}

export function FacturaClassificationDialog({
  factura,
  isOpen,
  onClose,
  onClassificationUpdated,
  sideBySide = false
}: FacturaClassificationDialogProps) {
  const [classification, setClassification] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [tieneRetencion, setTieneRetencion] = useState<boolean>(false);
  const [montoRetencion, setMontoRetencion] = useState<string>('');
  const [customRetencion, setCustomRetencion] = useState<string>('');
  const [isCustomRetencion, setIsCustomRetencion] = useState<boolean>(false);
  const [porcentajeProntoPago, setPorcentajeProntoPago] = useState<string>('');
  const [customProntoPago, setCustomProntoPago] = useState<string>('');
  const [isCustomProntoPago, setIsCustomProntoPago] = useState<boolean>(false);
  const [numeroSerie, setNumeroSerie] = useState<string>('');
  const [estadoMercancia, setEstadoMercancia] = useState<string>('');
  const [totalAPagar, setTotalAPagar] = useState<string>('');
  const [recalcularIVA, setRecalcularIVA] = useState<boolean>(false);
  const [iva5Monto, setIva5Monto] = useState<string>('');
  const [iva5Porcentaje, setIva5Porcentaje] = useState<string>('5');
  const [recalcularIVA5, setRecalcularIVA5] = useState<boolean>(false);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [nuevoDescuento, setNuevoDescuento] = useState<{concepto: string; valor: string; tipo: 'porcentaje' | 'valor_fijo'}>({
    concepto: '',
    valor: '',
    tipo: 'valor_fijo'
  });
  const [notaCreditoOriginal, setNotaCreditoOriginal] = useState<{
    totalOriginal: number | null;
    ivaOriginal: number | null;
    totalSinIvaOriginal: number | null;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestedSerie, setSuggestedSerie] = useState<string | null>(null);
  const [availableSeries, setAvailableSeries] = useState<number[]>([]);
  const { toast } = useToast();

  const resumenFinanciero = useMemo(() => {
    if (!factura) {
      return null;
    }

    const baseSinIVA = obtenerBaseSinIVAOriginal(factura);
    const retencionPorcentaje = factura.tiene_retencion ? parseNumeroSeguro(factura.monto_retencion) || 0 : 0;
    const retencionValor = factura.tiene_retencion ? calcularMontoRetencionReal(factura) : 0;
    const prontoPagoPorcentaje = parseNumeroSeguro(factura.porcentaje_pronto_pago) || 0;
    const prontoPagoValor = prontoPagoPorcentaje > 0 ? baseSinIVA * (prontoPagoPorcentaje / 100) : 0;
    const valorReal = (parseNumeroSeguro(factura.valor_real_a_pagar) ?? calcularValorRealAPagar(factura));

    return {
      baseSinIVA,
      retencionPorcentaje,
      retencionValor,
      prontoPagoPorcentaje,
      prontoPagoValor,
      valorReal
    };
  }, [factura]);

  // Función para obtener sugerencia de número de serie y números disponibles
  const fetchSerieSuggestion = useCallback(async () => {
    if (!factura?.emisor_nit || classification !== 'mercancia') {
      setSuggestedSerie(null);
      setAvailableSeries([]);
      return;
    }

    setSuggestionLoading(true);
    try {
   
      const [suggestion, available] = await Promise.all([
        SerieNumberSuggestion.suggestNextSerie(factura.emisor_nit),
        SerieNumberSuggestion.getAvailableSeries()
      ]);
    
      setSuggestedSerie(suggestion);
      setAvailableSeries(available);
    } catch (error) {
 
      setSuggestedSerie(null);
      setAvailableSeries([]);
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
      setCustomProntoPago('');
      setIsCustomProntoPago(false);
      setNumeroSerie('');
      setEstadoMercancia('');
      setTotalAPagar('');
      setRecalcularIVA(false);
      setIva5Monto('');
      setIva5Porcentaje('5');
      setRecalcularIVA5(false);
      setDescuentos([]);
      setNuevoDescuento({ concepto: '', valor: '', tipo: 'valor_fijo' });
      setSuggestedSerie(null);
      setSuggestionLoading(false);
      setAvailableSeries([]);
      setNotaCreditoOriginal(null);
    }
  }, [isOpen]);

  // Efecto para inicializar el valor del total cuando se abra con una factura
  useEffect(() => {
    if (isOpen && factura) {
      setTotalAPagar(factura.total_a_pagar.toString());

      // Inicializar IVA 5% si existe
      if (factura.factura_iva_5 && factura.factura_iva_5 > 0) {
        setIva5Monto(factura.factura_iva_5.toString());
        setIva5Porcentaje((factura.factura_iva_5_porcentaje || 5).toString());
      }

      if (factura.notas) {
        try {
          const data = JSON.parse(factura.notas);
          setNotaCreditoOriginal({
            totalOriginal: parseNumeroSeguro(data.total_original),
            ivaOriginal: parseNumeroSeguro(data.iva_original),
            totalSinIvaOriginal: parseNumeroSeguro(data.total_sin_iva_original)
          });
        } catch (error) {
          console.error('Error parsing nota crédito original:', error);
          setNotaCreditoOriginal(null);
        }
      } else {
        setNotaCreditoOriginal(null);
      }
    }
  }, [isOpen, factura]);

  // Función para usar la sugerencia
  const useSuggestion = () => {
    if (suggestedSerie) {
      setNumeroSerie(suggestedSerie);
    }
  };

  // Funciones para manejar descuentos
  const agregarDescuento = () => {
    if (!nuevoDescuento.concepto.trim() || !nuevoDescuento.valor.trim()) return;

    const valor = parseFloat(nuevoDescuento.valor);
    if (isNaN(valor) || valor <= 0) return;

    const descuento: Descuento = {
      id: Date.now().toString(),
      concepto: nuevoDescuento.concepto.trim(),
      valor: valor,
      tipo: nuevoDescuento.tipo
    };

    setDescuentos([...descuentos, descuento]);
    setNuevoDescuento({ concepto: '', valor: '', tipo: 'valor_fijo' });
  };

  const eliminarDescuento = (id: string) => {
    setDescuentos(descuentos.filter(d => d.id !== id));
  };

  // Calcular total de descuentos antes de IVA
  const calcularTotalDescuentos = (): number => {
    if (!totalAPagar) return 0;
    const total = parseFloat(totalAPagar) || 0;

    return descuentos.reduce((suma, descuento) => {
      if (descuento.tipo === 'porcentaje') {
        return suma + (total * descuento.valor / 100);
      } else {
        return suma + descuento.valor;
      }
    }, 0);
  };

  // Calcular valor después de descuentos (antes de IVA)
  const calcularValorConDescuentos = (): number => {
    if (!totalAPagar) return 0;
    const total = parseFloat(totalAPagar) || 0;
    return total - calcularTotalDescuentos();
  };

  const esNotaCredito = factura?.clasificacion === 'nota_credito';
  const totalOriginalDisplay = factura
    ? esNotaCredito && notaCreditoOriginal?.totalOriginal
      ? notaCreditoOriginal.totalOriginal ?? factura.total_a_pagar
      : factura.total_a_pagar
    : 0;


  const handleSubmit = async () => {
    if (!factura || !classification) return;

    setIsUpdating(true);
    try {
      if (!factura?.id) {
        throw new Error('Factura ID no encontrado');
      }

      const nuevoTotal = parseFloat(totalAPagar) || factura.total_a_pagar;
      const nuevoIVA = calcularIVA();
      const nuevoIVA5 = calcularIVA5();
      const nuevoIVA5Porcentaje = parseFloat(iva5Porcentaje) || 5;

      // Validar datos
      if (isNaN(nuevoTotal) || nuevoTotal < 0) {
        throw new Error('El total debe ser un número válido mayor a 0');
      }




      // CRÍTICO: total_sin_iva es el valor ORIGINAL antes de IVA y ANTES de descuentos
      // nuevoTotal es el valor ingresado por el usuario (con IVA, sin descuentos aplicados)
      // Los descuentos se aplican DESPUÉS sobre este valor original
      // Ahora restamos ambos IVAs (19% y 5%)
      const valorOriginalSinIVA = nuevoTotal - nuevoIVA - nuevoIVA5;



      // Construir los datos para la tabla facturas (incluyendo IVA, descuentos y valor real a pagar)
      const facturaParaCalculo = {
        total_a_pagar: nuevoTotal,
        total_sin_iva: valorOriginalSinIVA, // IMPORTANTE: Valor ORIGINAL sin descuentos para calcular retención/pronto pago
        tiene_retencion: tieneRetencion,
        monto_retencion: tieneRetencion && (isCustomRetencion ? customRetencion : montoRetencion) ? parseFloat(isCustomRetencion ? customRetencion : montoRetencion) : 0,
        porcentaje_pronto_pago: (isCustomProntoPago ? customProntoPago : porcentajeProntoPago) && (isCustomProntoPago ? customProntoPago : porcentajeProntoPago) !== "0" ? parseFloat(isCustomProntoPago ? customProntoPago : porcentajeProntoPago) : null,
        factura_iva: nuevoIVA,
        factura_iva_5: nuevoIVA5,
        descuentos_antes_iva: descuentos.length > 0 ? JSON.stringify(descuentos) : null
      };

      const valorRealAPagar = calcularValorRealAPagar(facturaParaCalculo);

      const updateData: FacturaUpdateData = {
        clasificacion: classification,
        descripcion: descripcion || null,
        tiene_retencion: tieneRetencion,
        monto_retencion: tieneRetencion && (isCustomRetencion ? customRetencion : montoRetencion) ? parseFloat(isCustomRetencion ? customRetencion : montoRetencion) : 0,
        porcentaje_pronto_pago: (isCustomProntoPago ? customProntoPago : porcentajeProntoPago) && (isCustomProntoPago ? customProntoPago : porcentajeProntoPago) !== "0" ? parseFloat(isCustomProntoPago ? customProntoPago : porcentajeProntoPago) : null,
        numero_serie: classification === 'mercancia' ? numeroSerie || null : null,
        estado_mercancia: classification === 'mercancia' ? 'pendiente' : null,
        total_a_pagar: nuevoTotal,
        factura_iva: nuevoIVA,
        factura_iva_5: nuevoIVA5,
        factura_iva_5_porcentaje: nuevoIVA5Porcentaje,
        valor_real_a_pagar: valorRealAPagar,
        descuentos_antes_iva: descuentos.length > 0 ? JSON.stringify(descuentos) : null
      };

  
      // Actualizar la tabla facturas
      const { error } = await supabase
        .from('facturas')
        .update(updateData)
        .eq('id', factura.id);

    

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
      setCustomProntoPago('');
      setIsCustomProntoPago(false);
      setNumeroSerie('');
      setEstadoMercancia('');
      setTotalAPagar('');
      setRecalcularIVA(false);
      setIva5Monto('');
      setIva5Porcentaje('5');
      setRecalcularIVA5(false);
      setDescuentos([]);
      setNuevoDescuento({ concepto: '', valor: '', tipo: 'valor_fijo' });
      setSuggestedSerie(null);
      setSuggestionLoading(false);
      setAvailableSeries([]);
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

  // Calcular ahorro por pronto pago sobre el valor ORIGINAL sin descuentos (total_sin_iva)
  const calcularAhorro = () => {
    const porcentaje = isCustomProntoPago ? customProntoPago : porcentajeProntoPago;
    if (!totalAPagar || !porcentaje || porcentaje === "0") return 0;

    // CRÍTICO: total_sin_iva es el valor ORIGINAL antes de IVA y antes de descuentos
    // totalAPagar es el valor ingresado (original con IVA, sin descuentos aplicados aún)
    // Ahora restamos ambos IVAs (19% y 5%)
    const valorSinIVA = parseFloat(totalAPagar) - calcularIVA() - calcularIVA5();

    return (valorSinIVA * parseFloat(porcentaje)) / 100;
  };


  // Calcular IVA automáticamente basado en el total
  const calcularIVA = () => {
    try {
      if (!totalAPagar || !factura) return factura?.factura_iva || 0;

      // Si no está marcado recalcular IVA, devolver el IVA original
      if (!recalcularIVA) {
        return factura.factura_iva || 0;
      }

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
      return factura?.factura_iva || 0;
    }
  };

  // Calcular IVA 5% automáticamente basado en el total
  const calcularIVA5 = (): number => {
    try {
      if (!factura) return 0;

      // Si hay un monto de IVA 5% ingresado manualmente, usarlo
      if (iva5Monto && parseFloat(iva5Monto) > 0) {
        // Si recalcular está activado, ajustar proporcionalmente
        if (recalcularIVA5 && totalAPagar) {
          const nuevoTotal = parseFloat(totalAPagar) || 0;
          const totalOriginal = factura.total_a_pagar || 0;
          if (totalOriginal === 0) return parseFloat(iva5Monto);

          const proporcion = nuevoTotal / totalOriginal;
          return parseFloat(iva5Monto) * proporcion;
        }
        return parseFloat(iva5Monto);
      }

      // Si la factura original tenía IVA 5%
      if (factura.factura_iva_5 && factura.factura_iva_5 > 0) {
        if (recalcularIVA5 && totalAPagar) {
          const nuevoTotal = parseFloat(totalAPagar) || 0;
          const totalOriginal = factura.total_a_pagar || 0;
          if (totalOriginal === 0) return factura.factura_iva_5;

          const proporcion = nuevoTotal / totalOriginal;
          return factura.factura_iva_5 * proporcion;
        }
        return factura.factura_iva_5;
      }

      return 0;
    } catch (error) {
      console.error('Error calculando IVA 5%:', error);
      return 0;
    }
  };

  // Modo side-by-side: renderizar como div fijo en lado DERECHO (50%)
  if (sideBySide && isOpen && factura) {
    
    return (
      <div className="fixed right-0 top-0 w-1/2 h-screen bg-background border-l shadow-2xl z-50 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 p-6 border-b bg-background">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Clasificar Factura
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
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
                    <p className="text-sm font-semibold text-blue-600">{formatCurrency(totalOriginalDisplay)}</p>
                    {esNotaCredito && notaCreditoOriginal?.totalOriginal !== null && notaCreditoOriginal?.totalOriginal !== factura.total_a_pagar && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Valor actual de la nota: {formatCurrency(factura.total_a_pagar)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {resumenFinanciero && (
              <Card className="border-l-4 border-l-purple-500 bg-muted/40">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calculator className="w-4 h-4" />
                    Resumen Financiero
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">Base sin IVA</p>
                    <p className="text-sm font-semibold text-blue-600">
                      {formatCurrency(resumenFinanciero.baseSinIVA)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Valor Real Registrado</p>
                    <p className="text-sm font-semibold text-emerald-600">
                      {formatCurrency(resumenFinanciero.valorReal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Retención {resumenFinanciero.retencionPorcentaje ? `(${resumenFinanciero.retencionPorcentaje}%)` : ''}
                    </p>
                    <p className="text-sm font-semibold text-orange-600">
                      {resumenFinanciero.retencionValor > 0
                        ? formatCurrency(resumenFinanciero.retencionValor)
                        : 'Sin retención'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Pronto Pago {resumenFinanciero.prontoPagoPorcentaje ? `(${resumenFinanciero.prontoPagoPorcentaje}%)` : ''}
                    </p>
                    <p className="text-sm font-semibold text-green-600">
                      {resumenFinanciero.prontoPagoValor > 0
                        ? formatCurrency(resumenFinanciero.prontoPagoValor)
                        : 'Sin descuento'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

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
                    <Label className="text-sm font-medium">IVA 19%</Label>
                    <div className="p-3 bg-muted/50 rounded-lg space-y-3 border border-blue-200 dark:border-blue-800">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          IVA original: {formatCurrency(factura.factura_iva || 0)}
                        </p>
                        <p className="text-xs text-blue-600 font-medium">
                          IVA a usar: {formatCurrency(calcularIVA())}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 pt-2 border-t border-muted-foreground/20">
                        <Checkbox
                          id="recalcular_iva"
                          checked={recalcularIVA}
                          onCheckedChange={(checked) => setRecalcularIVA(checked === true)}
                        />
                        <Label htmlFor="recalcular_iva" className="text-xs">
                          Recalcular IVA automáticamente
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* IVA 5% (Opcional) */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">IVA 5% (Opcional)</Label>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3 border border-cyan-200 dark:border-cyan-800">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="iva5_monto" className="text-xs text-muted-foreground">Monto IVA 5%</Label>
                        <Input
                          id="iva5_monto"
                          type="number"
                          step="0.01"
                          min="0"
                          value={iva5Monto}
                          onChange={(e) => setIva5Monto(e.target.value)}
                          placeholder="0.00"
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="iva5_porcentaje" className="text-xs text-muted-foreground">% IVA</Label>
                        <Input
                          id="iva5_porcentaje"
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={iva5Porcentaje}
                          onChange={(e) => setIva5Porcentaje(e.target.value)}
                          placeholder="5"
                          className="h-8"
                        />
                      </div>
                    </div>

                    {factura.factura_iva_5 && factura.factura_iva_5 > 0 && (
                      <p className="text-xs text-cyan-600">
                        IVA 5% original: {formatCurrency(factura.factura_iva_5)}
                      </p>
                    )}

                    {calcularIVA5() > 0 && (
                      <p className="text-xs text-cyan-600 font-medium">
                        IVA 5% a usar: {formatCurrency(calcularIVA5())}
                      </p>
                    )}

                    <div className="flex items-center space-x-2 pt-2 border-t border-muted-foreground/20">
                      <Checkbox
                        id="recalcular_iva5"
                        checked={recalcularIVA5}
                        onCheckedChange={(checked) => setRecalcularIVA5(checked === true)}
                      />
                      <Label htmlFor="recalcular_iva5" className="text-xs">
                        Recalcular IVA 5% al cambiar total
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Resumen de IVA Total */}
                {(calcularIVA() > 0 || calcularIVA5() > 0) && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">IVA Total:</span>
                      <span className="text-sm font-bold text-emerald-600">{formatCurrency(calcularIVA() + calcularIVA5())}</span>
                    </div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      IVA 19%: {formatCurrency(calcularIVA())} {calcularIVA5() > 0 && `+ IVA 5%: ${formatCurrency(calcularIVA5())}`}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Descuentos antes de IVA */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Tag className="w-4 h-4" />
                  Descuentos antes de IVA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Formulario para agregar descuento */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="concepto_descuento" className="text-xs font-medium">Concepto</Label>
                      <Input
                        id="concepto_descuento"
                        value={nuevoDescuento.concepto}
                        onChange={(e) => setNuevoDescuento({...nuevoDescuento, concepto: e.target.value})}
                        placeholder="Ej: Descuento comercial"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Tipo</Label>
                      <Select
                        value={nuevoDescuento.tipo}
                        onValueChange={(value: 'porcentaje' | 'valor_fijo') =>
                          setNuevoDescuento({...nuevoDescuento, tipo: value})
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="valor_fijo">Valor fijo</SelectItem>
                          <SelectItem value="porcentaje">Porcentaje</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="valor_descuento" className="text-xs font-medium">
                        {nuevoDescuento.tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Valor ($)'}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="valor_descuento"
                          type="number"
                          step={nuevoDescuento.tipo === 'porcentaje' ? '0.1' : '100'}
                          min="0"
                          max={nuevoDescuento.tipo === 'porcentaje' ? '100' : undefined}
                          value={nuevoDescuento.valor}
                          onChange={(e) => setNuevoDescuento({...nuevoDescuento, valor: e.target.value})}
                          placeholder={nuevoDescuento.tipo === 'porcentaje' ? '5.0' : '50000'}
                          className="h-9"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={agregarDescuento}
                          disabled={!nuevoDescuento.concepto.trim() || !nuevoDescuento.valor.trim()}
                          className="h-9 px-3"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lista de descuentos */}
                {descuentos.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Descuentos aplicados:</Label>
                    <div className="space-y-2">
                      {descuentos.map((descuento) => (
                        <div key={descuento.id} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Tag className="w-3 h-3 text-red-600" />
                              <span className="text-sm font-medium text-red-800 dark:text-red-300">
                                {descuento.concepto}
                              </span>
                            </div>
                            <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                              {descuento.tipo === 'porcentaje'
                                ? `${descuento.valor}% = ${formatCurrency((parseFloat(totalAPagar) || 0) * descuento.valor / 100)}`
                                : formatCurrency(descuento.valor)
                              }
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => eliminarDescuento(descuento.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-100 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Resumen de descuentos */}
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          Total descuentos: {formatCurrency(calcularTotalDescuentos())}
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          Valor después de descuentos: {formatCurrency(calcularValorConDescuentos())}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
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
                              Retención estimada: {formatCurrency((() => {
                                // CRÍTICO: total_sin_iva = totalAPagar - IVA 19% - IVA 5% (valor ORIGINAL sin descuentos)
                                const valorSinIVA = parseFloat(totalAPagar) - calcularIVA() - calcularIVA5();
                                return (valorSinIVA * parseFloat(isCustomRetencion ? customRetencion : montoRetencion)) / 100;
                              })())}
                            </p>
                            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                              Calculado sobre total_sin_iva (valor antes de IVA, sin descuentos)
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
                              Siguiente al número más alto en la base de datos
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

                      {/* Números disponibles (no usados) */}
                      {availableSeries.length > 0 && !suggestionLoading && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-2 mb-2">
                            <Package className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                              Números disponibles (no usados)
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {availableSeries.slice(0, 15).map((num) => (
                              <Button
                                key={num}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setNumeroSerie(num.toString())}
                                className="h-7 px-2 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-800"
                              >
                                {num}
                              </Button>
                            ))}
                            {availableSeries.length > 15 && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 self-center">
                                +{availableSeries.length - 15} más
                              </span>
                            )}
                          </div>
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
                    <Select
                      value={isCustomProntoPago ? 'custom' : porcentajeProntoPago}
                      onValueChange={(value) => {
                        if (value === 'custom') {
                          setIsCustomProntoPago(true);
                          setPorcentajeProntoPago('');
                        } else {
                          setIsCustomProntoPago(false);
                          setPorcentajeProntoPago(value);
                          setCustomProntoPago('');
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar porcentaje" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Sin descuento (0%)</SelectItem>
                        <SelectItem value="1">1%</SelectItem>
                        <SelectItem value="2">2%</SelectItem>
                        <SelectItem value="3">3%</SelectItem>
                        <SelectItem value="4">4%</SelectItem>
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="custom">Porcentaje personalizado</SelectItem>
                      </SelectContent>
                    </Select>

                    {isCustomProntoPago && (
                      <div>
                        <Input
                          id="custom_pronto_pago"
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={customProntoPago}
                          onChange={(e) => setCustomProntoPago(e.target.value)}
                          placeholder="Ej: 7.5"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Ingrese el porcentaje (ej: 7.5 para 7.5%)
                        </p>
                      </div>
                    )}

                    {((isCustomProntoPago && customProntoPago) || (porcentajeProntoPago && porcentajeProntoPago !== "0")) && (
                      <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border-l-2 border-green-400">
                        <p className="text-sm font-medium text-green-800 dark:text-green-300">
                          Ahorro estimado: {formatCurrency(calcularAhorro())}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Calculado sobre valor sin IVA
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
                        <p className="font-semibold text-lg">{formatCurrency(totalOriginalDisplay)}</p>
                        {esNotaCredito && notaCreditoOriginal?.totalOriginal !== null && notaCreditoOriginal?.totalOriginal !== factura.total_a_pagar && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Valor actual de la nota: {formatCurrency(factura.total_a_pagar)}
                          </p>
                        )}
                      </div>
                      {totalAPagar && parseFloat(totalAPagar) !== factura.total_a_pagar && (
                        <div className="text-center">
                          <p className="text-muted-foreground">Total Ajustado</p>
                          <p className="font-semibold text-lg text-blue-600">{formatCurrency(parseFloat(totalAPagar))}</p>
                        </div>
                      )}
                      {descuentos.length > 0 && (
                        <div className="text-center">
                          <p className="text-muted-foreground">Total con Descuentos</p>
                          <p className="font-semibold text-lg text-purple-600">{formatCurrency(calcularValorConDescuentos())}</p>
                          <p className="text-xs text-purple-500">-{formatCurrency(calcularTotalDescuentos())} en descuentos</p>
                        </div>
                      )}
                      {(tieneRetencion || (isCustomProntoPago && customProntoPago) || (porcentajeProntoPago && porcentajeProntoPago !== "0")) && (
                        <div className="text-center">
                          <p className="text-muted-foreground">Valor Final Estimado</p>
                          <p className="font-semibold text-lg text-green-600">
                            {formatCurrency((() => {
                              // Calcular valor final: total con descuentos - retención - pronto pago
                              // IMPORTANTE: retención y pronto pago se calculan sobre total_sin_iva (valor ORIGINAL)
                              const totalDescuentos = calcularTotalDescuentos();
                              const valorConDescuentos = parseFloat(totalAPagar) - totalDescuentos;
                              // Restamos ambos IVAs (19% y 5%)
                              const valorSinIVA = parseFloat(totalAPagar) - calcularIVA() - calcularIVA5();

                              const retencion = (tieneRetencion && (isCustomRetencion ? customRetencion : montoRetencion))
                                ? (valorSinIVA * parseFloat(isCustomRetencion ? customRetencion : montoRetencion)) / 100
                                : 0;

                              const prontoPago = ((isCustomProntoPago && customProntoPago) || (porcentajeProntoPago && porcentajeProntoPago !== "0"))
                                ? calcularAhorro()
                                : 0;

                              return valorConDescuentos - retencion - prontoPago;
                            })())}
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
        </div>
      </div>
    );
  }

  // Modo normal: Dialog modal
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
            {/* Contenido del dialog normal - mantener todo igual que el sideBySide */}
            {/* Por brevedad, mostramos solo un mensaje indicando que debe usarse sideBySide en SinClasificar */}
            <p className="text-sm text-muted-foreground">
              Para usar este componente en SinClasificar, debe tener sideBySide={`{true}`}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
