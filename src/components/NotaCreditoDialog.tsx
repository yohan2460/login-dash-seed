import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Search, CreditCard, AlertTriangle, Calculator, FileText, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { calcularValorRealAPagar, calcularTotalReal } from '@/utils/calcularValorReal';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  total_con_descuento?: number | null;
  created_at: string;
  clasificacion?: string | null;
  es_nota_credito?: boolean;
  factura_original_id?: string | null;
  valor_nota_credito?: number | null;
  notas?: string | null;
  estado_nota_credito?: 'pendiente' | 'aplicada' | 'anulada' | null;
  factura_iva?: number | null;
  factura_iva_porcentaje?: number | null;
  total_sin_iva?: number | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
}


interface NotaCreditoDialogProps {
  factura: Factura | null;
  isOpen: boolean;
  onClose: () => void;
  onNotaCreditoCreated: () => void;
}

export function NotaCreditoDialog({ factura, isOpen, onClose, onNotaCreditoCreated }: NotaCreditoDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Factura[]>([]);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [valorNotaCredito, setValorNotaCredito] = useState<number>(0);
  const [tipoNota, setTipoNota] = useState<'parcial' | 'total'>('total');
  const [searchLoading, setSearchLoading] = useState(false);

  const porcentajeRetencion = useMemo(() => {
    if (!selectedFactura?.tiene_retencion || !selectedFactura.monto_retencion) {
      return 0;
    }
    return selectedFactura.monto_retencion;
  }, [selectedFactura]);

  const porcentajeRetencionLabel = useMemo(() => {
    if (!porcentajeRetencion) return null;
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(porcentajeRetencion);
  }, [porcentajeRetencion]);

  const calcularRetencionDesdeBase = (baseSinIva: number) => {
    if (baseSinIva <= 0) return 0;
    if (!porcentajeRetencion || porcentajeRetencion <= 0) return 0;
    return Math.max(0, baseSinIva * (porcentajeRetencion / 100));
  };

  const resumenCalculo = useMemo(() => {
    if (!selectedFactura || !factura) {
      return null;
    }

    const facturaOriginalNotas = selectedFactura.notas || '{}';
    let notasOriginal;

    try {
      notasOriginal = JSON.parse(facturaOriginalNotas);
    } catch {
      notasOriginal = {};
    }

    const ivaOriginal = notasOriginal.iva_original ?? selectedFactura.factura_iva ?? 0;
    const totalSinIvaOriginal =
      notasOriginal.total_sin_iva_original ??
      selectedFactura.total_sin_iva ??
      (selectedFactura.total_a_pagar - (selectedFactura.factura_iva || 0));
    const totalOriginal = notasOriginal.total_original ?? selectedFactura.total_a_pagar;

    const notasPrevias = Array.isArray(notasOriginal.notas_credito) ? notasOriginal.notas_credito : [];
    const totalPrevioNCs = notasPrevias.reduce((sum: number, nc: any) => sum + (nc.valor_descuento || 0), 0);
    const totalPrevioNCsSinIVA = notasPrevias.reduce((sum: number, nc: any) => sum + (nc.descuento_sin_iva || 0), 0);
    const totalPrevioNCsIVA = notasPrevias.reduce((sum: number, nc: any) => sum + (nc.iva_descuento || 0), 0);

    const ncIVA = factura.factura_iva || 0;
    const ncValorSinIVA = factura.total_sin_iva || (factura.total_a_pagar - ncIVA);

    const totalNCsSinIVA = totalPrevioNCsSinIVA + ncValorSinIVA;
    const totalNCsIVA = totalPrevioNCsIVA + ncIVA;

    const nuevoTotalSinIVA = totalSinIvaOriginal - totalNCsSinIVA;
    const nuevoIVA = ivaOriginal - totalNCsIVA;
    const nuevoTotalAPagar = Math.max(0, nuevoTotalSinIVA + nuevoIVA);

    const retencionOriginal = calcularRetencionDesdeBase(totalSinIvaOriginal);
    const nuevaRetencion = calcularRetencionDesdeBase(Math.max(0, nuevoTotalSinIVA));
    const nuevoValorReal = Math.max(0, nuevoTotalAPagar - nuevaRetencion);

    return {
      totalOriginal,
      totalPrevioNCs,
      valorNotaActual: valorNotaCredito,
      retencionOriginal,
      nuevaRetencion,
      nuevoTotalAPagar,
      nuevoValorReal
    };
  }, [selectedFactura, factura, valorNotaCredito, porcentajeRetencion]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  useEffect(() => {
    if (factura && isOpen) {
      setValorNotaCredito(factura.total_a_pagar);
      setTipoNota('total');
      setSelectedFactura(null);
      setSearchTerm('');
      setSearchResults([]);
    }
  }, [factura, isOpen]);

  const searchFacturas = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    console.log('🔍 Buscando facturas con término:', searchTerm);
    console.log('🔍 Factura actual ID:', factura?.id);
    
    setSearchLoading(true);
    try {
      // Primero probemos una consulta más simple
      const { data: allFacturas, error: allError } = await supabase
        .from('facturas')
        .select('*')
        .limit(5);
        
      console.log('🔍 Todas las facturas (primeras 5):', allFacturas);
      console.log('🔍 Error al obtener todas:', allError);

      // Query más simple para buscar facturas (sin campo es_nota_credito hasta ejecutar migración)
      let query = supabase
        .from('facturas')
        .select('*');

      // Filtrar por texto de búsqueda
      query = query.or(`numero_factura.ilike.%${searchTerm}%,emisor_nombre.ilike.%${searchTerm}%,emisor_nit.ilike.%${searchTerm}%`);
      
      // Excluir la factura actual
      if (factura?.id) {
        query = query.neq('id', factura.id);
      }
      
      // TODO: Cuando se ejecute la migración, descomentar esta línea:
      // query = query.not('es_nota_credito', 'eq', true);
      
      query = query
        .order('created_at', { ascending: false })
        .limit(10);

      const { data, error } = await query;

      console.log('🔍 Resultados de búsqueda:', data);
      console.log('🔍 Error de búsqueda:', error);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('❌ Error searching facturas:', error);
      toast({
        title: "Error",
        description: "Error al buscar facturas",
        variant: "destructive"
      });
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(searchFacturas, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const handleFacturaSelect = (facturaSeleccionada: Factura) => {
    setSelectedFactura(facturaSeleccionada);
    setSearchTerm(facturaSeleccionada.numero_factura);
    setSearchResults([]);
  };

  const handleTipoNotaChange = (tipo: 'parcial' | 'total') => {
    setTipoNota(tipo);
    if (tipo === 'total') {
      setValorNotaCredito(factura?.total_a_pagar || 0);
    } else {
      setValorNotaCredito(0);
    }
  };

  const handleSubmit = async () => {
    if (!factura || !selectedFactura || !user) {
      return;
    }

    if (valorNotaCredito <= 0) {
      toast({
        title: "Error",
        description: "El valor de la nota de crédito debe ser mayor a 0",
        variant: "destructive"
      });
      return;
    }

    if (valorNotaCredito > factura.total_a_pagar) {
      toast({
        title: "Error",
        description: "El valor de la nota de crédito no puede ser mayor al total de la factura",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      console.log('🔄 Iniciando proceso de nota de crédito...');
      console.log('📋 Nota de Crédito:', {
        id: factura.id,
        numero: factura.numero_factura,
        total: factura.total_a_pagar,
        iva: factura.factura_iva
      });
      console.log('📋 Factura Original:', {
        id: selectedFactura.id,
        numero: selectedFactura.numero_factura,
        total: selectedFactura.total_a_pagar,
        iva: selectedFactura.factura_iva,
        total_sin_iva: selectedFactura.total_sin_iva
      });

      // PASO 1: Actualizar NOTA DE CRÉDITO
      // - NO modificar total_a_pagar ni factura_iva (se mantienen originales)
      // - Marcar clasificacion = 'nota_credito'
      // - Marcar estado_nota_credito = 'aplicada'
      // - Guardar relación con factura original en campo notas

      const notaCreditoInfo = JSON.stringify({
        tipo: 'nota_credito',
        factura_aplicada_id: selectedFactura.id,
        numero_factura_aplicada: selectedFactura.numero_factura,
        emisor_aplicada: selectedFactura.emisor_nombre,
        valor_aplicado: valorNotaCredito,
        fecha_aplicacion: new Date().toISOString()
      });

      const { error: errorNotaCredito } = await supabase
        .from('facturas')
        .update({
          estado_nota_credito: 'aplicada',
          clasificacion: 'nota_credito',
          notas: notaCreditoInfo
        })
        .eq('id', factura.id);

      if (errorNotaCredito) throw errorNotaCredito;

      console.log('✅ Nota de crédito marcada como aplicada (valores originales preservados)');

      // PASO 2: Actualizar FACTURA ORIGINAL
      // - Calcular descuento SIN IVA de la nota de crédito
      // - Restar el descuento sin IVA del total de la factura
      // - Recalcular el IVA sobre el nuevo total sin IVA
      // - Actualizar total_a_pagar con el nuevo valor

      const facturaOriginalNotas = selectedFactura.notas || '{}';
      let notasOriginal;

      try {
        notasOriginal = JSON.parse(facturaOriginalNotas);
      } catch {
        notasOriginal = {};
      }

      // Guardar valores originales si es la primera nota de crédito
      if (!notasOriginal.total_original) {
        const ivaOriginal = selectedFactura.factura_iva || 0;
        const totalSinIvaOriginal = selectedFactura.total_sin_iva || (selectedFactura.total_a_pagar - ivaOriginal);
        const retencionOriginal = calcularRetencionDesdeBase(totalSinIvaOriginal);

        notasOriginal.total_original = selectedFactura.total_a_pagar;
        notasOriginal.iva_original = ivaOriginal;
        notasOriginal.total_sin_iva_original = totalSinIvaOriginal;
        notasOriginal.retencion_original = retencionOriginal;
        notasOriginal.retencion_porcentaje = porcentajeRetencion;

        console.log('📝 Guardando valores originales de la factura:', {
          total_original: notasOriginal.total_original,
          iva_original: notasOriginal.iva_original,
          total_sin_iva_original: notasOriginal.total_sin_iva_original,
          retencion_original: notasOriginal.retencion_original,
          retencion_porcentaje: notasOriginal.retencion_porcentaje
        });
      } else {
        if (notasOriginal.retencion_porcentaje === undefined) {
          notasOriginal.retencion_porcentaje = porcentajeRetencion;
        }
        if (notasOriginal.retencion_original === undefined && notasOriginal.total_sin_iva_original !== undefined) {
          notasOriginal.retencion_original = calcularRetencionDesdeBase(notasOriginal.total_sin_iva_original);
        }

        console.log('📝 Usando valores originales guardados previamente:', {
          total_original: notasOriginal.total_original,
          iva_original: notasOriginal.iva_original,
          total_sin_iva_original: notasOriginal.total_sin_iva_original,
          retencion_original: notasOriginal.retencion_original,
          retencion_porcentaje: notasOriginal.retencion_porcentaje
        });
      }

      // Agregar o actualizar la lista de notas de crédito
      if (!notasOriginal.notas_credito) {
        notasOriginal.notas_credito = [];
      }

      // CALCULAR VALORES DE LA NOTA DE CRÉDITO
      // Usar los valores reales de IVA de la nota de crédito (extraídos del PDF)
      const ncIVA = factura.factura_iva || 0;
      const ncValorSinIVA = factura.total_sin_iva || (factura.total_a_pagar - ncIVA);

      const retencionReducida = calcularRetencionDesdeBase(ncValorSinIVA);

      console.log('💰 Valores de la Nota de Crédito:', {
        valorTotalNC: valorNotaCredito,
        total_a_pagar_nc: factura.total_a_pagar,
        ncValorSinIVA,
        ncIVA,
        factura_iva_porcentaje: factura.factura_iva_porcentaje,
        retencion_reducida: retencionReducida,
        retencion_porcentaje: porcentajeRetencion
      });

      notasOriginal.notas_credito.push({
        factura_id: factura.id,
        numero_factura: factura.numero_factura,
        valor_descuento: valorNotaCredito,
        descuento_sin_iva: ncValorSinIVA,
        iva_descuento: ncIVA,
        fecha_aplicacion: new Date().toISOString(),
        retencion_reducida: retencionReducida
      });

      // CALCULAR NUEVOS TOTALES - RESTAR DIRECTAMENTE
      // 1. Sumar todos los valores sin IVA de las NC aplicadas
      const totalNCsSinIVA = notasOriginal.notas_credito.reduce(
        (sum: number, nc: any) => sum + (nc.descuento_sin_iva || 0),
        0
      );

      // 2. Sumar todos los IVAs de las NC aplicadas
      const totalNCsIVA = notasOriginal.notas_credito.reduce(
        (sum: number, nc: any) => sum + (nc.iva_descuento || 0),
        0
      );

      // 3. Restar del valor sin IVA original
      const nuevoTotalSinIVA = Math.max(0, notasOriginal.total_sin_iva_original - totalNCsSinIVA);

      // 4. Restar del IVA original
      const nuevoIVA = Math.max(0, (notasOriginal.iva_original || 0) - totalNCsIVA);

      // 5. Nuevo total = nuevo valor sin IVA + nuevo IVA
      const nuevoTotalAPagar = Math.max(0, nuevoTotalSinIVA + nuevoIVA);

      // 6. Recalcular retención sobre la nueva base sin IVA
      const nuevaRetencion = calcularRetencionDesdeBase(nuevoTotalSinIVA);
      const nuevoValorRealAPagar = Math.max(0, nuevoTotalAPagar - nuevaRetencion);

      notasOriginal.retencion_actual = nuevaRetencion;
      notasOriginal.retencion_porcentaje = porcentajeRetencion;
      notasOriginal.valor_real_a_pagar = nuevoValorRealAPagar;

      console.log('📊 Nuevos totales calculados:', {
        total_original: notasOriginal.total_original,
        iva_original: notasOriginal.iva_original,
        total_sin_iva_original: notasOriginal.total_sin_iva_original,
        total_ncs_sin_iva: totalNCsSinIVA,
        total_ncs_iva: totalNCsIVA,
        nuevo_total_sin_iva: nuevoTotalSinIVA,
        nuevo_iva: nuevoIVA,
        nuevo_total_a_pagar: nuevoTotalAPagar,
        retencion_original: notasOriginal.retencion_original,
        nueva_retencion: nuevaRetencion,
        nuevo_valor_real_apagar: nuevoValorRealAPagar
      });

      // Determinar si la factura queda anulada (total <= 0)
      const estadoNotaCredito = nuevoTotalAPagar <= 0 ? 'anulada' : null;
      const nuevaClasificacion = nuevoTotalAPagar <= 0 ? 'nota_credito' : selectedFactura.clasificacion;

      // LOG: Verificar estructura de notasOriginal antes de guardar
      console.log('🔍 notasOriginal antes de stringify:', notasOriginal);
      console.log('🔍 notasOriginal.notas_credito:', notasOriginal.notas_credito);
      console.log('🔍 Cantidad de NCs:', notasOriginal.notas_credito?.length);

      const notasStringified = JSON.stringify(notasOriginal);
      console.log('🔍 notas stringificadas (primeros 200 chars):', notasStringified.substring(0, 200));
      console.log('🔍 Longitud del string:', notasStringified.length);

      // ACTUALIZAR FACTURA ORIGINAL en la base de datos
      const { error: updateOriginalError } = await supabase
        .from('facturas')
        .update({
          total_a_pagar: Math.round(nuevoTotalAPagar),      // ✅ ACTUALIZAR total a pagar
          factura_iva: Math.round(nuevoIVA),                // ✅ ACTUALIZAR IVA
          valor_real_a_pagar: Math.round(nuevoValorRealAPagar), // ✅ GUARDAR valor real a pagar considerando retención
          total_con_descuento: Math.round(nuevoTotalAPagar),
          notas: notasStringified,
          estado_nota_credito: estadoNotaCredito,
          clasificacion: nuevaClasificacion                 // ✅ Cambiar a 'nota_credito' si queda en $0
        })
        .eq('id', selectedFactura.id);

      if (updateOriginalError) {
        console.error('❌ Error actualizando factura original:', updateOriginalError);
        throw updateOriginalError;
      }

      console.log('✅ Factura original actualizada:', {
        nuevo_total_a_pagar: Math.round(nuevoTotalAPagar),
        nuevo_iva: Math.round(nuevoIVA),
        nueva_retencion: Math.round(notasOriginal.retencion_actual || 0),
        valor_real_a_pagar: Math.round(nuevoValorRealAPagar),
        estado: estadoNotaCredito || 'activa'
      });

      // Verificar que se guardó correctamente
      const { data: facturaVerificacion, error: errorVerificacion } = await supabase
        .from('facturas')
        .select('notas')
        .eq('id', selectedFactura.id)
        .single();

      if (errorVerificacion) {
        console.error('⚠️ Error verificando guardado:', errorVerificacion);
      } else {
        console.log('🔍 Verificación: Campo notas en BD:', facturaVerificacion?.notas);
        if (facturaVerificacion?.notas) {
          try {
            const notasGuardadas = JSON.parse(facturaVerificacion.notas);
            console.log('🔍 Notas guardadas parseadas:', notasGuardadas);
            console.log('🔍 NCs en BD:', notasGuardadas.notas_credito);
          } catch (e) {
            console.error('❌ Error parseando notas guardadas:', e);
          }
        } else {
          console.error('❌ ¡PROBLEMA! El campo notas está null/vacío en la BD después de guardar');
        }
      }

      // Si la factura queda anulada, también marcar la NC como anulada
      if (estadoNotaCredito === 'anulada') {
        const { error: errorAnularNC } = await supabase
          .from('facturas')
          .update({ estado_nota_credito: 'anulada' })
          .eq('id', factura.id);

        if (errorAnularNC) {
          console.error('❌ Error marcando NC como anulada:', errorAnularNC);
        } else {
          console.log('✅ Nota de crédito marcada como anulada (factura resultante en $0)');
        }
      }

      toast({
        title: "Nota de crédito procesada",
        description: `Se ha vinculado la nota de crédito ${factura.numero_factura} con la factura ${selectedFactura.numero_factura}. Valor: ${formatCurrency(valorNotaCredito)}`,
      });

      onNotaCreditoCreated();
      onClose();

    } catch (error: any) {
      console.error('Error processing nota credito:', error);
      toast({
        title: "Error",
        description: error.message || "Error al procesar la nota de crédito",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSearchTerm('');
    setSearchResults([]);
    setSelectedFactura(null);
    setValorNotaCredito(factura?.total_a_pagar || 0);
    setTipoNota('total');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!factura) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Configurar como Nota de Crédito
          </DialogTitle>
          <DialogDescription>
            Vincula esta factura como nota de crédito a otra factura existente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información de la nota de crédito actual */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-4 h-4" />
                Factura a marcar como Nota de Crédito
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Número de Factura</p>
                  <p className="font-semibold">{factura.numero_factura}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Emisor</p>
                  <p className="font-semibold">{factura.emisor_nombre}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="font-semibold text-lg">{formatCurrency(factura.total_a_pagar)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fecha</p>
                  <p className="font-semibold">{new Date(factura.created_at).toLocaleDateString('es-CO')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Búsqueda de factura original */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="w-4 h-4" />
                Buscar Factura Original
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="search-factura">Buscar por número, emisor o NIT</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search-factura"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Escribe para buscar..."
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Resultados de búsqueda */}
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium">Resultados de búsqueda:</p>
                  {searchResults.map((resultado) => (
                    <div
                      key={resultado.id}
                      className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleFacturaSelect(resultado)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">#{resultado.numero_factura}</p>
                          <p className="text-sm text-muted-foreground">{resultado.emisor_nombre}</p>
                          <p className="text-xs text-muted-foreground">NIT: {resultado.emisor_nit}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(resultado.total_a_pagar)}</p>
                          {resultado.total_con_descuento !== null && resultado.total_con_descuento !== undefined && (
                            <p className="text-sm text-green-600">
                              Actual: {formatCurrency(resultado.total_con_descuento)}
                            </p>
                          )}
                          <Badge variant="outline" className="text-xs mt-1">
                            {resultado.clasificacion || 'Sin clasificar'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchLoading && (
                <div className="text-center text-sm text-muted-foreground">
                  Buscando...
                </div>
              )}
            </CardContent>
          </Card>

          {/* Factura seleccionada */}
          {selectedFactura && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calculator className="w-4 h-4" />
                  Factura Original Seleccionada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Número</p>
                    <p className="font-semibold">{selectedFactura.numero_factura}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Emisor</p>
                    <p className="font-semibold">{selectedFactura.emisor_nombre}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Original</p>
                    <p className="font-semibold">{formatCurrency(selectedFactura.total_a_pagar)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Actual</p>
                    <p className="font-semibold">
                      {formatCurrency(selectedFactura.total_con_descuento ?? selectedFactura.total_a_pagar)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Configuración del valor */}
                <div className="space-y-4">
                  <div>
                    <Label>Tipo de Nota de Crédito</Label>
                    <Select value={tipoNota} onValueChange={handleTipoNotaChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total">Anular totalmente ({formatCurrency(factura.total_a_pagar)})</SelectItem>
                        <SelectItem value="parcial">Anular parcialmente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {tipoNota === 'parcial' && (
                    <div>
                      <Label htmlFor="valor-nota">Valor de la Nota de Crédito</Label>
                      <Input
                        id="valor-nota"
                        type="number"
                        value={valorNotaCredito}
                        onChange={(e) => setValorNotaCredito(parseFloat(e.target.value) || 0)}
                        max={factura.total_a_pagar}
                        min={0}
                        step="0.01"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Máximo: {formatCurrency(factura.total_a_pagar)}
                      </p>
                    </div>
                  )}

                  {/* Resumen de cálculo */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Calculator className="w-4 h-4" />
                      Resumen del Cálculo
                    </h4>
                    {resumenCalculo ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Total Original:</span>
                          <span className="font-medium">{formatCurrency(resumenCalculo.totalOriginal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Notas de crédito previas:</span>
                          <span className="font-medium text-red-600">
                            -{formatCurrency(resumenCalculo.totalPrevioNCs)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="flex items-center gap-1">
                            <Minus className="w-3 h-3" />
                            Esta Nota de Crédito:
                          </span>
                          <span className="font-medium text-red-600">
                            -{formatCurrency(resumenCalculo.valorNotaActual)}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span>Nuevo total bruto:</span>
                          <span className="font-semibold">
                            {formatCurrency(resumenCalculo.nuevoTotalAPagar)}
                          </span>
                        </div>
                        {porcentajeRetencion > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <span>
                                Retención original ({porcentajeRetencionLabel ?? porcentajeRetencion}%)
                              </span>
                              <span className="font-medium text-amber-600">
                                {formatCurrency(resumenCalculo.retencionOriginal)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>
                                Nueva retención ({porcentajeRetencionLabel ?? porcentajeRetencion}%)
                              </span>
                              <span className="font-medium text-amber-600">
                                {formatCurrency(resumenCalculo.nuevaRetencion)}
                              </span>
                            </div>
                            <Separator />
                            <div className="flex justify-between font-semibold text-lg">
                              <span>Valor real tras retención:</span>
                              <span className="text-green-600">
                                {formatCurrency(resumenCalculo.nuevoValorReal)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between font-semibold text-lg">
                            <span>Nuevo Total:</span>
                            <span className="text-green-600">
                              {formatCurrency(resumenCalculo.nuevoTotalAPagar)}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Ingresa un valor para ver el impacto de la nota de crédito.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !selectedFactura || valorNotaCredito <= 0}
          >
            {loading ? "Procesando..." : "Crear Nota de Crédito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
