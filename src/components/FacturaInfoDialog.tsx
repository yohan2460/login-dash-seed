import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  Building2,
  Calendar,
  DollarSign,
  Percent,
  Calculator,
  Tag,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  Eye,
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calcularValorRealAPagar, calcularMontoRetencionReal, obtenerBaseSinIVAOriginal } from '@/utils/calcularValorReal';

interface Factura {
  id: string;
  numero_factura: string;
  numero_serie?: string | null;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  clasificacion?: string | null;
  clasificacion_original?: string | null;
  estado_mercancia?: string | null;
  created_at: string;
  factura_iva?: number | null;
  factura_iva_porcentaje?: number | null;
  descripcion?: string | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  metodo_pago?: string | null;
  monto_pagado?: number | null;
  valor_real_a_pagar?: number | null;
  total_sin_iva?: number | null;
  descuentos_antes_iva?: string | null;
  notas?: string | null;
  pdf_file_path?: string | null;
}

interface FacturaInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  factura: Factura | null;
  onViewPDF?: () => void;
}

export function FacturaInfoDialog({ isOpen, onClose, factura, onViewPDF }: FacturaInfoDialogProps) {
  const { toast } = useToast();

  if (!factura) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(amount);
  };

  const formatFecha = (fecha: string | null): string => {
    if (!fecha) return 'No especificada';
    try {
      const fechaSoloFecha = fecha.split('T')[0];
      const [year, month, day] = fechaSoloFecha.split('-').map(num => parseInt(num, 10));
      const dayStr = day.toString().padStart(2, '0');
      const monthStr = month.toString().padStart(2, '0');
      const yearStr = year.toString();
      return `${dayStr}/${monthStr}/${yearStr}`;
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const handleDownloadPDF = async () => {
    if (!factura.pdf_file_path) {
      toast({
        title: "PDF no disponible",
        description: "Esta factura no tiene un archivo PDF asociado",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('facturas-pdf')
        .createSignedUrl(factura.pdf_file_path, 3600);

      if (error) throw error;

      if (data?.signedUrl) {
        const link = document.createElement('a');
        link.href = data.signedUrl;
        link.download = `factura_${factura.numero_factura}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
          title: "Descarga iniciada",
          description: "El PDF se está descargando...",
        });
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: "Error",
        description: "No se pudo descargar el archivo PDF",
        variant: "destructive"
      });
    }
  };

  // Parsear descuentos
  const descuentos = factura.descuentos_antes_iva ? (() => {
    try {
      return JSON.parse(factura.descuentos_antes_iva);
    } catch {
      return [];
    }
  })() : [];

  const baseSinIVA = obtenerBaseSinIVAOriginal(factura);
  const montoRetencion = calcularMontoRetencionReal(factura);
  const valorReal = calcularValorRealAPagar(factura);

  // Calcular descuento de pronto pago
  const descuentoProntoPago = factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0
    ? baseSinIVA * (factura.porcentaje_pronto_pago / 100)
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Información de Factura #{factura.numero_factura}
            </DialogTitle>
            <div className="flex gap-2">
              {onViewPDF && factura.pdf_file_path && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onViewPDF}
                  className="flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Ver PDF
                </Button>
              )}
              {factura.pdf_file_path && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPDF}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Descargar PDF
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Información del Emisor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Información del Emisor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nombre</p>
                  <p className="font-medium">{factura.emisor_nombre}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">NIT</p>
                  <p className="font-medium">{factura.emisor_nit}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información de la Factura */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Datos de la Factura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Número de Factura</p>
                  <p className="font-medium">{factura.numero_factura}</p>
                </div>
                {factura.numero_serie && (
                  <div>
                    <p className="text-sm text-muted-foreground">Número de Serie</p>
                    <p className="font-medium">{factura.numero_serie}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Clasificación</p>
                  <Badge variant="outline" className="mt-1">
                    {factura.clasificacion || 'Sin clasificar'}
                  </Badge>
                </div>
                {factura.clasificacion_original && (
                  <div>
                    <p className="text-sm text-muted-foreground">Clasificación Original</p>
                    <Badge variant="outline" className="mt-1">
                      {factura.clasificacion_original}
                    </Badge>
                  </div>
                )}
              </div>

              {factura.estado_mercancia && (
                <div>
                  <p className="text-sm text-muted-foreground">Estado</p>
                  <Badge
                    className="mt-1"
                    variant={factura.estado_mercancia === 'pagada' ? 'default' : 'secondary'}
                  >
                    {factura.estado_mercancia}
                  </Badge>
                </div>
              )}

              {factura.descripcion && (
                <div>
                  <p className="text-sm text-muted-foreground">Descripción</p>
                  <p className="text-sm mt-1">{factura.descripcion}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fechas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Fechas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Fecha de Emisión</p>
                  <p className="font-medium">{formatFecha(factura.fecha_emision)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fecha de Vencimiento</p>
                  <p className="font-medium">{formatFecha(factura.fecha_vencimiento)}</p>
                </div>
              </div>
              {factura.fecha_pago && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha de Pago</p>
                    <p className="font-medium">{formatFecha(factura.fecha_pago)}</p>
                  </div>
                  {factura.metodo_pago && (
                    <div>
                      <p className="text-sm text-muted-foreground">Método de Pago</p>
                      <p className="font-medium">{factura.metodo_pago}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Valores Financieros */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Valores Financieros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total a Pagar</p>
                  <p className="text-lg font-bold">{formatCurrency(factura.total_a_pagar)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">IVA ({factura.factura_iva_porcentaje || 0}%)</p>
                  <p className="text-lg font-semibold">{formatCurrency(factura.factura_iva || 0)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Base sin IVA</p>
                  <p className="font-semibold">{formatCurrency(baseSinIVA)}</p>
                </div>
                {factura.total_sin_iva && (
                  <div>
                    <p className="text-sm text-muted-foreground">Total sin IVA (Original)</p>
                    <p className="font-semibold">{formatCurrency(factura.total_sin_iva)}</p>
                  </div>
                )}
              </div>

              {descuentos.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Descuentos antes de IVA</p>
                    <div className="space-y-1">
                      {descuentos.map((desc: any, index: number) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span>{desc.concepto}</span>
                          <span className="text-green-600">
                            {desc.tipo === 'porcentaje'
                              ? `-${desc.valor}%`
                              : `-${formatCurrency(desc.valor)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {factura.tiene_retencion && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Retención ({factura.monto_retencion || 0}%)</p>
                      <p className="font-semibold text-orange-600">-{formatCurrency(montoRetencion)}</p>
                    </div>
                  </div>
                </>
              )}

              {factura.porcentaje_pronto_pago && factura.porcentaje_pronto_pago > 0 && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Descuento Pronto Pago ({factura.porcentaje_pronto_pago}%)</p>
                      <p className="font-semibold text-green-600">-{formatCurrency(descuentoProntoPago)}</p>
                    </div>
                  </div>
                </>
              )}

              <Separator />
              <div className="bg-primary/10 p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">Valor Real a Pagar</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(valorReal)}</p>
              </div>

              {factura.monto_pagado && (
                <div>
                  <p className="text-sm text-muted-foreground">Monto Pagado</p>
                  <p className="text-lg font-semibold text-green-600">{formatCurrency(factura.monto_pagado)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
