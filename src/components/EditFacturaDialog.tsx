import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Save, X, Plus, Trash2 } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  clasificacion?: string | null;
  estado_mercancia?: string | null;
  descripcion?: string | null;
  factura_iva?: number | null;
  factura_iva_porcentaje?: number | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  numero_serie?: string | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  metodo_pago?: string | null;
  uso_pronto_pago?: boolean | null;
  descuentos_antes_iva?: string | null;
  total_sin_iva?: number | null;
  notas?: string | null;
}

interface EditFacturaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  factura: Factura | null;
  onSave?: () => void;
}

interface FormData {
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  descripcion: string;
  factura_iva: number;
  factura_iva_porcentaje: number;
  tiene_retencion: boolean;
  monto_retencion: number;
  porcentaje_pronto_pago: number;
  numero_serie: string;
  fecha_emision: Date | undefined;
  fecha_vencimiento: Date | undefined;
}

interface Descuento {
  id: string;
  concepto: string;
  valor: number;
  tipo: 'porcentaje' | 'valor_fijo';
}

export function EditFacturaDialog({ isOpen, onClose, factura, onSave }: EditFacturaDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    numero_factura: '',
    emisor_nombre: '',
    emisor_nit: '',
    total_a_pagar: 0,
    descripcion: '',
    factura_iva: 0,
    factura_iva_porcentaje: 0,
    tiene_retencion: false,
    monto_retencion: 0,
    porcentaje_pronto_pago: 0,
    numero_serie: '',
    fecha_emision: undefined,
    fecha_vencimiento: undefined
  });
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [nuevoDescuento, setNuevoDescuento] = useState<{ concepto: string; valor: string; tipo: 'porcentaje' | 'valor_fijo' }>({
    concepto: '',
    valor: '',
    tipo: 'valor_fijo'
  });

  useEffect(() => {
    if (factura && isOpen) {
      setFormData({
        numero_factura: factura.numero_factura || '',
        emisor_nombre: factura.emisor_nombre || '',
        emisor_nit: factura.emisor_nit || '',
        total_a_pagar: factura.total_a_pagar || 0,
        descripcion: factura.descripcion || '',
        factura_iva: factura.factura_iva || 0,
        factura_iva_porcentaje: factura.factura_iva_porcentaje || 0,
        tiene_retencion: factura.tiene_retencion || false,
        monto_retencion: factura.monto_retencion || 0,
        porcentaje_pronto_pago: factura.porcentaje_pronto_pago || 0,
        numero_serie: factura.numero_serie || '',
        fecha_emision: factura.fecha_emision ? new Date(factura.fecha_emision) : undefined,
        fecha_vencimiento: factura.fecha_vencimiento ? new Date(factura.fecha_vencimiento) : undefined
      });

      if (factura.descuentos_antes_iva) {
        try {
          const parsed = JSON.parse(factura.descuentos_antes_iva) as Array<Partial<Descuento>>;
          const normalizados = parsed
            .filter(Boolean)
            .map((descuento, index) => ({
              id: descuento?.id || `descuento-${index}-${Date.now()}`,
              concepto: descuento?.concepto || `Descuento ${index + 1}`,
              valor: typeof descuento?.valor === 'number' ? descuento.valor : parseFloat(String(descuento?.valor ?? 0)) || 0,
              tipo: descuento?.tipo === 'porcentaje' ? 'porcentaje' : 'valor_fijo'
            }));
          setDescuentos(normalizados);
        } catch (error) {
          console.error('Error parsing descuentos_antes_iva:', error);
          setDescuentos([]);
        }
      } else {
        setDescuentos([]);
      }
      setNuevoDescuento({ concepto: '', valor: '', tipo: 'valor_fijo' });
    }
  }, [factura, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setDescuentos([]);
      setNuevoDescuento({ concepto: '', valor: '', tipo: 'valor_fijo' });
    }
  }, [isOpen]);

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Función para obtener el valor ORIGINAL sin IVA (sin descuentos)
  // Esto se usa para calcular retención y pronto pago correctamente
  const getValorOriginalSinIVA = () => {
    // Prioridad 1: Buscar en notas el valor original
    if (factura?.notas) {
      try {
        const notasData = JSON.parse(factura.notas);
        if (notasData.total_sin_iva_original !== undefined && notasData.total_sin_iva_original !== null) {
          return notasData.total_sin_iva_original;
        }
      } catch (error) {
        // Continuar con otras opciones
      }
    }

    // Prioridad 2: Usar campo total_sin_iva si existe
    if (factura?.total_sin_iva !== null && factura?.total_sin_iva !== undefined) {
      return factura.total_sin_iva;
    }

    // Fallback: Calcular restando IVA del total_a_pagar
    const base = formData.total_a_pagar - (formData.factura_iva || 0);
    return base > 0 ? base : formData.total_a_pagar;
  };

  const getBaseAntesDeIVA = () => {
    return getValorOriginalSinIVA();
  };

  const calcularTotalDescuentos = () => {
    const base = getBaseAntesDeIVA();
    return descuentos.reduce((suma, descuento) => {
      if (descuento.tipo === 'porcentaje') {
        return suma + (base * descuento.valor / 100);
      }
      return suma + descuento.valor;
    }, 0);
  };

  const calcularTotalDespuesDescuentos = () => {
    const base = getBaseAntesDeIVA();
    const descuentosTotal = calcularTotalDescuentos();
    return Math.max(0, base - descuentosTotal);
  };

  const agregarDescuento = () => {
    if (!nuevoDescuento.concepto.trim() || !nuevoDescuento.valor.trim()) return;

    const valorNumerico = parseFloat(nuevoDescuento.valor);
    if (isNaN(valorNumerico) || valorNumerico <= 0) return;

    const descuento: Descuento = {
      id: `desc-${Date.now()}`,
      concepto: nuevoDescuento.concepto.trim(),
      valor: valorNumerico,
      tipo: nuevoDescuento.tipo
    };

    setDescuentos(prev => [...prev, descuento]);
    setNuevoDescuento({ concepto: '', valor: '', tipo: 'valor_fijo' });
  };

  const eliminarDescuento = (id: string) => {
    setDescuentos(prev => prev.filter(descuento => descuento.id !== id));
  };

  const handleSave = async () => {
    if (!factura) return;

    setIsLoading(true);

    try {
      const descuentosData = descuentos.length > 0
        ? JSON.stringify(descuentos.map(({ id, concepto, valor, tipo }) => ({
            id,
            concepto,
            valor,
            tipo
          })))
        : null;

      const updateData = {
        numero_factura: formData.numero_factura,
        emisor_nombre: formData.emisor_nombre,
        emisor_nit: formData.emisor_nit,
        total_a_pagar: formData.total_a_pagar,
        descripcion: formData.descripcion || null,
        factura_iva: formData.factura_iva || null,
        factura_iva_porcentaje: formData.factura_iva_porcentaje || null,
        tiene_retencion: formData.tiene_retencion,
        monto_retencion: formData.monto_retencion || null,
        porcentaje_pronto_pago: formData.porcentaje_pronto_pago || null,
        numero_serie: formData.numero_serie || null,
        fecha_emision: formData.fecha_emision ? formData.fecha_emision.toISOString() : null,
        fecha_vencimiento: formData.fecha_vencimiento ? formData.fecha_vencimiento.toISOString() : null,
        descuentos_antes_iva: descuentosData,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('facturas')
        .update(updateData)
        .eq('id', factura.id);

      if (error) throw error;

      toast({
        title: "Factura actualizada",
        description: `La factura ${formData.numero_factura} ha sido actualizada exitosamente.`,
      });

      onClose();
      if (onSave) onSave();
    } catch (error) {
      console.error('Error updating factura:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la factura. Por favor, inténtalo de nuevo.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  if (!factura) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar Factura #{factura.numero_factura}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información Básica */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información Básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="numero_factura">Número de Factura *</Label>
                  <Input
                    id="numero_factura"
                    value={formData.numero_factura}
                    onChange={(e) => handleInputChange('numero_factura', e.target.value)}
                    placeholder="Ej: FACT-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero_serie">Número de Serie</Label>
                  <Input
                    id="numero_serie"
                    value={formData.numero_serie}
                    onChange={(e) => handleInputChange('numero_serie', e.target.value)}
                    placeholder="Ej: A001"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emisor_nombre">Nombre del Emisor *</Label>
                  <Input
                    id="emisor_nombre"
                    value={formData.emisor_nombre}
                    onChange={(e) => handleInputChange('emisor_nombre', e.target.value)}
                    placeholder="Nombre de la empresa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emisor_nit">NIT del Emisor *</Label>
                  <Input
                    id="emisor_nit"
                    value={formData.emisor_nit}
                    onChange={(e) => handleInputChange('emisor_nit', e.target.value)}
                    placeholder="123456789-0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea
                  id="descripcion"
                  value={formData.descripcion}
                  onChange={(e) => handleInputChange('descripcion', e.target.value)}
                  placeholder="Descripción de los productos o servicios"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Fechas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fechas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha de Emisión</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.fecha_emision && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.fecha_emision ? format(formData.fecha_emision, "PPP") : "Seleccionar fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.fecha_emision}
                        onSelect={(date) => handleInputChange('fecha_emision', date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Fecha de Vencimiento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.fecha_vencimiento && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.fecha_vencimiento ? format(formData.fecha_vencimiento, "PPP") : "Seleccionar fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.fecha_vencimiento}
                        onSelect={(date) => handleInputChange('fecha_vencimiento', date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Valores Financieros */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Valores Financieros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total_a_pagar">Total a Pagar *</Label>
                  <Input
                    id="total_a_pagar"
                    type="number"
                    step="0.01"
                    value={formData.total_a_pagar}
                    onChange={(e) => handleInputChange('total_a_pagar', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(formData.total_a_pagar)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="porcentaje_pronto_pago">Porcentaje Pronto Pago (%)</Label>
                  <Input
                    id="porcentaje_pronto_pago"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.porcentaje_pronto_pago}
                    onChange={(e) => handleInputChange('porcentaje_pronto_pago', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="factura_iva">Valor IVA</Label>
                  <Input
                    id="factura_iva"
                    type="number"
                    step="0.01"
                    value={formData.factura_iva}
                    onChange={(e) => handleInputChange('factura_iva', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(formData.factura_iva)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="factura_iva_porcentaje">Porcentaje IVA (%)</Label>
                  <Input
                    id="factura_iva_porcentaje"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.factura_iva_porcentaje}
                    onChange={(e) => handleInputChange('factura_iva_porcentaje', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Descuentos antes de IVA */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Descuentos antes de IVA</CardTitle>
              <p className="text-sm text-muted-foreground">
                Registra descuentos aplicados antes del cálculo de IVA para mantener el valor real de la factura.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {descuentos.length > 0 ? (
                <div className="space-y-3">
                  {descuentos.map((descuento) => (
                    <div
                      key={descuento.id}
                      className="flex items-center justify-between rounded-md border border-muted p-3"
                    >
                      <div>
                        <p className="font-medium">{descuento.concepto}</p>
                        <p className="text-sm text-muted-foreground">
                          {descuento.tipo === 'porcentaje'
                            ? `${descuento.valor}% del valor base`
                            : formatCurrency(descuento.valor)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => eliminarDescuento(descuento.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Eliminar descuento</span>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-muted p-4 text-sm text-muted-foreground">
                  No se han registrado descuentos. Agrega descuentos para reflejar retenciones comerciales, bonificaciones
                  o acuerdos especiales antes de IVA.
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="nuevo_descuento_concepto">Concepto</Label>
                  <Input
                    id="nuevo_descuento_concepto"
                    value={nuevoDescuento.concepto}
                    onChange={(e) => setNuevoDescuento(prev => ({ ...prev, concepto: e.target.value }))}
                    placeholder="Ej: Descuento comercial"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nuevo_descuento_tipo">Tipo</Label>
                  <Select
                    value={nuevoDescuento.tipo}
                    onValueChange={(value: 'porcentaje' | 'valor_fijo') => setNuevoDescuento(prev => ({ ...prev, tipo: value }))}
                  >
                    <SelectTrigger id="nuevo_descuento_tipo">
                      <SelectValue placeholder="Selecciona el tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="valor_fijo">Valor Fijo</SelectItem>
                      <SelectItem value="porcentaje">Porcentaje</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nuevo_descuento_valor">Valor</Label>
                  <Input
                    id="nuevo_descuento_valor"
                    type="number"
                    min="0"
                    step="0.01"
                    value={nuevoDescuento.valor}
                    onChange={(e) => setNuevoDescuento(prev => ({ ...prev, valor: e.target.value }))}
                    placeholder={nuevoDescuento.tipo === 'porcentaje' ? '0%' : '$0'}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={agregarDescuento}>
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar descuento
                </Button>
              </div>

              <div className="rounded-md bg-muted p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Total descuentos aplicados</span>
                  <span className="font-semibold text-green-600">
                    -{formatCurrency(calcularTotalDescuentos())}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Valor base después de descuentos</span>
                  <span className="font-semibold">
                    {formatCurrency(calcularTotalDespuesDescuentos())}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Retenciones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Retenciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="tiene_retencion"
                  checked={formData.tiene_retencion}
                  onCheckedChange={(checked) => handleInputChange('tiene_retencion', !!checked)}
                />
                <Label htmlFor="tiene_retencion">Tiene retención</Label>
              </div>

              {formData.tiene_retencion && (
                <div className="space-y-2">
                  <Label htmlFor="monto_retencion">Porcentaje de Retención (%)</Label>
                  <Input
                    id="monto_retencion"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.monto_retencion}
                    onChange={(e) => handleInputChange('monto_retencion', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Base para retención (sin IVA original): {formatCurrency(getValorOriginalSinIVA())}</div>
                    <div className="font-semibold text-foreground">
                      Valor retención: {formatCurrency((getValorOriginalSinIVA() * formData.monto_retencion) / 100)}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Botones */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
