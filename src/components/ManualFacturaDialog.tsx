import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon, DollarSign, FileText, Building, Calculator, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface ManualFacturaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onFacturaCreated: () => void;
}

interface FacturaFormData {
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  descripcion: string;
  numero_serie: string;
  
  // Fechas
  fecha_emision: Date | undefined;
  fecha_vencimiento: Date | undefined;
  
  // Información fiscal
  factura_iva: number;
  factura_iva_porcentaje: number;
  tiene_retencion: boolean;
  monto_retencion: number;
  
  // Pronto pago
  porcentaje_pronto_pago: number;
  
  // Clasificación
  clasificacion: string;
  
  // Información de pago (opcional)
  estado_mercancia: string;
  metodo_pago: string;
  monto_pagado: number;
  fecha_pago: Date | undefined;
  uso_pronto_pago: boolean;
  
  // Archivo PDF
  pdf_file: File | null;
}

const initialFormData: FacturaFormData = {
  numero_factura: '',
  emisor_nombre: '',
  emisor_nit: '',
  total_a_pagar: 0,
  descripcion: '',
  numero_serie: '',
  fecha_emision: new Date(),
  fecha_vencimiento: undefined,
  factura_iva: 0,
  factura_iva_porcentaje: 19,
  tiene_retencion: false,
  monto_retencion: 0,
  porcentaje_pronto_pago: 0,
  clasificacion: '',
  estado_mercancia: '',
  metodo_pago: '',
  monto_pagado: 0,
  fecha_pago: undefined,
  uso_pronto_pago: false,
  pdf_file: null,
};

export function ManualFacturaDialog({ isOpen, onClose, onFacturaCreated }: ManualFacturaDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState<FacturaFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const handleInputChange = (field: keyof FacturaFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Auto-calcular IVA si se cambia el porcentaje o total
    if (field === 'total_a_pagar' || field === 'factura_iva_porcentaje') {
      const total = field === 'total_a_pagar' ? value : formData.total_a_pagar;
      const porcentaje = field === 'factura_iva_porcentaje' ? value : formData.factura_iva_porcentaje;

      if (total > 0 && porcentaje > 0) {
        // Calcular IVA sobre el valor ingresado (el total NO incluye IVA)
        const iva = total * (porcentaje / 100);
        setFormData(prev => ({
          ...prev,
          factura_iva: Math.round(iva)
        }));
      } else if (total === 0 || porcentaje === 0) {
        setFormData(prev => ({
          ...prev,
          factura_iva: 0
        }));
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar que sea PDF
      if (file.type !== 'application/pdf') {
        toast({
          title: "Formato no válido",
          description: "Solo se permiten archivos PDF",
          variant: "destructive"
        });
        return;
      }
      
      // Validar tamaño (máximo 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Archivo muy grande",
          description: "El archivo debe ser menor a 10MB",
          variant: "destructive"
        });
        return;
      }
      
      setFormData(prev => ({
        ...prev,
        pdf_file: file
      }));
    }
  };

  const removeFile = () => {
    setFormData(prev => ({
      ...prev,
      pdf_file: null
    }));
  };

  const uploadPDFToStorage = async (file: File, facturaId: string): Promise<string | null> => {
    try {
      setUploadingFile(true);
      
      const fileName = `${facturaId}_${Date.now()}.pdf`;
      const filePath = `facturas/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('facturas-pdf')
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) throw uploadError;
      
      return filePath;
    } catch (error) {
      console.error('Error uploading PDF:', error);
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const validateForm = (): string | null => {
    if (!formData.numero_factura.trim()) return 'El número de factura es obligatorio';
    if (!formData.emisor_nombre.trim()) return 'El nombre del emisor es obligatorio';
    if (!formData.emisor_nit.trim()) return 'El NIT del emisor es obligatorio';
    if (formData.total_a_pagar <= 0) return 'El total a pagar debe ser mayor a 0';
    if (!formData.fecha_emision) return 'La fecha de emisión es obligatoria';
    
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      toast({
        title: "Error de validación",
        description: validationError,
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({
        title: "Error",
        description: "No hay usuario autenticado",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      // Primero insertar la factura para obtener el ID
      const facturaData = {
        numero_factura: formData.numero_factura.trim(),
        emisor_nombre: formData.emisor_nombre.trim(),
        emisor_nit: formData.emisor_nit.trim(),
        total_a_pagar: formData.total_a_pagar,
        descripcion: formData.descripcion.trim() || null,
        numero_serie: formData.numero_serie.trim() || null,
        fecha_emision: formData.fecha_emision?.toISOString(),
        fecha_vencimiento: formData.fecha_vencimiento?.toISOString() || null,
        factura_iva: formData.factura_iva || null,
        factura_iva_porcentaje: formData.factura_iva_porcentaje || null,
        tiene_retencion: formData.tiene_retencion,
        monto_retencion: formData.tiene_retencion ? formData.monto_retencion : null,
        porcentaje_pronto_pago: formData.porcentaje_pronto_pago || null,
        clasificacion: formData.clasificacion === 'sin_clasificar' ? null : formData.clasificacion || null,
        estado_mercancia: formData.estado_mercancia === 'pendiente' ? null : formData.estado_mercancia || null,
        metodo_pago: formData.metodo_pago === 'no_seleccionado' ? null : formData.metodo_pago || null,
        monto_pagado: formData.monto_pagado || null,
        fecha_pago: formData.fecha_pago?.toISOString() || null,
        uso_pronto_pago: formData.uso_pronto_pago,
        user_id: user.id,
        nombre_carpeta_factura: `manual_${formData.numero_factura}_${Date.now()}`,
        factura_cufe: `MANUAL-${formData.numero_factura}-${Date.now()}`,
        pdf_file_path: null // Se actualiza después si hay archivo
      };

      const { data: insertedData, error: insertError } = await supabase
        .from('facturas')
        .insert([facturaData])
        .select()
        .single();

      if (insertError) throw insertError;

      let pdfPath = null;
      
      // Si hay archivo PDF, subirlo y actualizar la factura
      if (formData.pdf_file && insertedData) {
        pdfPath = await uploadPDFToStorage(formData.pdf_file, insertedData.id);
        
        if (pdfPath) {
          const { error: updateError } = await supabase
            .from('facturas')
            .update({ pdf_file_path: pdfPath })
            .eq('id', insertedData.id);
            
          if (updateError) {
            console.error('Error updating PDF path:', updateError);
            // No fallar la creación de factura por esto
          }
        }
      }

      toast({
        title: "Factura creada",
        description: `La factura ${formData.numero_factura} ha sido creada exitosamente`,
      });

      // Reset form
      setFormData(initialFormData);
      onFacturaCreated();
      onClose();

    } catch (error: any) {
      console.error('Error creating factura:', error);
      toast({
        title: "Error al crear factura",
        description: error.message || "Error desconocido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData(initialFormData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Agregar Factura Manual
          </DialogTitle>
          <DialogDescription>
            Complete la información de la factura para agregarla al sistema
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Información Básica */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-4 h-4" />
                Información Básica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="numero_factura">Número de Factura *</Label>
                  <Input
                    id="numero_factura"
                    value={formData.numero_factura}
                    onChange={(e) => handleInputChange('numero_factura', e.target.value)}
                    placeholder="Ej: FACT-001"
                  />
                </div>
                <div>
                  <Label htmlFor="numero_serie">Número de Serie</Label>
                  <Input
                    id="numero_serie"
                    value={formData.numero_serie}
                    onChange={(e) => handleInputChange('numero_serie', e.target.value)}
                    placeholder="Ej: SERIE-001"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea
                  id="descripcion"
                  value={formData.descripcion}
                  onChange={(e) => handleInputChange('descripcion', e.target.value)}
                  placeholder="Descripción de los productos o servicios"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="clasificacion">Clasificación</Label>
                <Select value={formData.clasificacion} onValueChange={(value) => handleInputChange('clasificacion', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar clasificación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sin_clasificar">Sin clasificar</SelectItem>
                    <SelectItem value="mercancia">Mercancía</SelectItem>
                    <SelectItem value="gasto">Gasto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Información del Emisor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building className="w-4 h-4" />
                Información del Emisor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="emisor_nombre">Nombre del Emisor *</Label>
                <Input
                  id="emisor_nombre"
                  value={formData.emisor_nombre}
                  onChange={(e) => handleInputChange('emisor_nombre', e.target.value)}
                  placeholder="Nombre de la empresa o persona"
                />
              </div>

              <div>
                <Label htmlFor="emisor_nit">NIT del Emisor *</Label>
                <Input
                  id="emisor_nit"
                  value={formData.emisor_nit}
                  onChange={(e) => handleInputChange('emisor_nit', e.target.value)}
                  placeholder="123456789-0"
                />
              </div>
            </CardContent>
          </Card>

          {/* Fechas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarIcon className="w-4 h-4" />
                Fechas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Fecha de Emisión *</Label>
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
                      {formData.fecha_emision ? format(formData.fecha_emision, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.fecha_emision}
                      onSelect={(date) => handleInputChange('fecha_emision', date)}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
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
                      {formData.fecha_vencimiento ? format(formData.fecha_vencimiento, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.fecha_vencimiento}
                      onSelect={(date) => handleInputChange('fecha_vencimiento', date)}
                      disabled={(date) => formData.fecha_emision && date < formData.fecha_emision}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* Información Financiera */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="w-4 h-4" />
                Información Financiera
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="total_a_pagar">Total a Pagar *</Label>
                <Input
                  id="total_a_pagar"
                  type="number"
                  value={formData.total_a_pagar}
                  onChange={(e) => handleInputChange('total_a_pagar', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                {formData.total_a_pagar > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(formData.total_a_pagar)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="factura_iva_porcentaje">% IVA</Label>
                  <Input
                    id="factura_iva_porcentaje"
                    type="number"
                    value={formData.factura_iva_porcentaje}
                    onChange={(e) => handleInputChange('factura_iva_porcentaje', parseFloat(e.target.value) || 0)}
                    placeholder="19"
                  />
                </div>
                <div>
                  <Label htmlFor="factura_iva">Valor IVA</Label>
                  <Input
                    id="factura_iva"
                    type="number"
                    value={formData.factura_iva}
                    onChange={(e) => handleInputChange('factura_iva', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="tiene_retencion"
                    checked={formData.tiene_retencion}
                    onCheckedChange={(checked) => handleInputChange('tiene_retencion', checked)}
                  />
                  <Label htmlFor="tiene_retencion">Tiene retención</Label>
                </div>
                
                {formData.tiene_retencion && (
                  <div>
                    <Label htmlFor="monto_retencion">Monto de Retención</Label>
                    <Input
                      id="monto_retencion"
                      type="number"
                      value={formData.monto_retencion}
                      onChange={(e) => handleInputChange('monto_retencion', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="porcentaje_pronto_pago">% Pronto Pago</Label>
                <Input
                  id="porcentaje_pronto_pago"
                  type="number"
                  value={formData.porcentaje_pronto_pago}
                  onChange={(e) => handleInputChange('porcentaje_pronto_pago', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </CardContent>
          </Card>

          {/* Subida de Archivo PDF */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Upload className="w-4 h-4" />
                Documento PDF (Opcional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {!formData.pdf_file ? (
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
                    <div className="text-center">
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Subir archivo PDF</p>
                        <p className="text-xs text-muted-foreground">
                          Selecciona el archivo PDF de la factura (máximo 10MB)
                        </p>
                      </div>
                      <div className="mt-4">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handleFileChange}
                          className="hidden"
                          id="pdf-upload"
                          disabled={uploadingFile}
                        />
                        <Button 
                          type="button"
                          variant="outline" 
                          onClick={() => document.getElementById('pdf-upload')?.click()}
                          disabled={uploadingFile}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Seleccionar PDF
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <FileText className="w-8 h-8 text-red-500" />
                        <div>
                          <p className="font-medium text-sm">{formData.pdf_file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(formData.pdf_file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeFile}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Información de Pago (Opcional) */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calculator className="w-4 h-4" />
                Información de Pago (Opcional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="estado_mercancia">Estado</Label>
                  <Select value={formData.estado_mercancia} onValueChange={(value) => handleInputChange('estado_mercancia', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Estado de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="pagada">Pagada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="metodo_pago">Método de Pago</Label>
                  <Select value={formData.metodo_pago} onValueChange={(value) => handleInputChange('metodo_pago', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Método de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_seleccionado">Seleccionar</SelectItem>
                      <SelectItem value="Pago Banco">Pago Banco</SelectItem>
                      <SelectItem value="Pago Tobías">Pago Tobías</SelectItem>
                      <SelectItem value="Caja">Caja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="monto_pagado">Monto Pagado</Label>
                  <Input
                    id="monto_pagado"
                    type="number"
                    value={formData.monto_pagado}
                    onChange={(e) => handleInputChange('monto_pagado', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>

              {formData.estado_mercancia === 'pagada' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Fecha de Pago</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.fecha_pago && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.fecha_pago ? format(formData.fecha_pago, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.fecha_pago}
                          onSelect={(date) => handleInputChange('fecha_pago', date)}
                          disabled={(date) => date > new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="flex items-center space-x-2 mt-6">
                    <Checkbox
                      id="uso_pronto_pago"
                      checked={formData.uso_pronto_pago}
                      onCheckedChange={(checked) => handleInputChange('uso_pronto_pago', checked)}
                    />
                    <Label htmlFor="uso_pronto_pago">Se usó pronto pago</Label>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading || uploadingFile}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || uploadingFile}>
            {uploadingFile ? "Subiendo archivo..." : loading ? "Creando..." : "Crear Factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}