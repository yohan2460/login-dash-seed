import { useEffect, useMemo, useState } from 'react';
import { Loader2, Undo2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useReversarPago } from '@/hooks/useReversarPago';
import {
  MOTIVO_MIN_LENGTH,
  buildReversalPayload,
  resolverComprobanteRaiz,
  resumirSaldosADevolver,
  validarMotivo,
  type FacturaReversible,
  type ResumenSaldosADevolver,
} from '@/utils/reversarPago';

interface FacturaRef {
  id: string;
  numero_factura: string;
}

interface ReversarPagoDialogProps {
  factura: FacturaRef | null;
  isOpen: boolean;
  onClose: () => void;
  onReversed?: () => void;
}

interface ComprobanteRaiz {
  id: string;
  tipo_comprobante: string | null;
  metodo_pago: string | null;
  total_pagado: number | null;
  facturas_ids: string[];
}

interface FacturaDelPago extends FacturaReversible {
  numero_factura: string;
  emisor_nombre: string | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(amount);

export function ReversarPagoDialog({ factura, isOpen, onClose, onReversed }: ReversarPagoDialogProps) {
  const { toast } = useToast();
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState<ComprobanteRaiz | null>(null);
  const [facturas, setFacturas] = useState<FacturaDelPago[]>([]);
  const [saldos, setSaldos] = useState<ResumenSaldosADevolver | null>(null);
  const [motivo, setMotivo] = useState('');
  const [intentoEnviar, setIntentoEnviar] = useState(false);

  const mutation = useReversarPago({
    onSuccess: result => {
      toast({
        title: 'Pago reversado',
        description: `${result.facturas_restauradas} factura(s) volvieron a pendiente.`,
      });
      if (result.warnings.length > 0) {
        toast({
          title: 'Advertencias de la reversión',
          description: result.warnings.join(' | '),
        });
      }
      onReversed?.();
      onClose();
    },
  });

  useEffect(() => {
    if (!isOpen || !factura) return;
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      setErrorCarga(null);
      setComprobante(null);
      setFacturas([]);
      setSaldos(null);
      setMotivo('');
      setIntentoEnviar(false);

      try {
        const { data: encontrados, error } = await supabase
          .from('comprobantes_pago')
          .select('id, tipo_comprobante, metodo_pago, total_pagado, facturas_ids, detalles')
          .contains('facturas_ids', [factura.id])
          .eq('estado', 'activo')
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        if (!encontrados || encontrados.length === 0) {
          throw new Error('Esta factura no tiene un comprobante de pago activo para reversar.');
        }

        let raiz = encontrados[0];
        const raizId = resolverComprobanteRaiz({
          id: raiz.id,
          detalles: raiz.detalles as Record<string, unknown> | null,
        });
        if (raizId !== raiz.id) {
          const { data: grupal, error: errorGrupal } = await supabase
            .from('comprobantes_pago')
            .select('id, tipo_comprobante, metodo_pago, total_pagado, facturas_ids, detalles')
            .eq('id', raizId)
            .eq('estado', 'activo')
            .maybeSingle();
          if (errorGrupal) throw errorGrupal;
          if (!grupal) {
            throw new Error('El comprobante grupal de origen ya no está activo.');
          }
          raiz = grupal;
        }

        const ids = (raiz.facturas_ids ?? []) as string[];
        const { data: facturasData, error: errorFacturas } = await supabase
          .from('facturas')
          .select(
            'id, numero_factura, emisor_nombre, total_a_pagar, total_sin_iva, tiene_retencion, monto_retencion, porcentaje_pronto_pago, factura_iva, factura_iva_5, factura_iva_5_porcentaje, notas, clasificacion, descuentos_antes_iva, uso_pronto_pago, estado_nota_credito'
          )
          .in('id', ids);
        if (errorFacturas) throw errorFacturas;

        const { data: aplicaciones, error: errorAplicaciones } = await supabase
          .from('aplicaciones_saldo')
          .select('saldo_favor_id, monto_aplicado, saldos_favor ( estado )')
          .in('factura_destino_id', ids);
        if (errorAplicaciones) throw errorAplicaciones;

        if (cancelado) return;
        setComprobante({
          id: raiz.id,
          tipo_comprobante: raiz.tipo_comprobante,
          metodo_pago: raiz.metodo_pago,
          total_pagado: raiz.total_pagado,
          facturas_ids: ids,
        });
        setFacturas((facturasData ?? []) as unknown as FacturaDelPago[]);
        setSaldos(resumirSaldosADevolver((aplicaciones ?? []) as never[]));
      } catch (e) {
        if (!cancelado) {
          setErrorCarga(e instanceof Error ? e.message : 'No se pudo cargar el comprobante.');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [isOpen, factura]);

  const validacion = useMemo(() => validarMotivo(motivo), [motivo]);
  const esGrupal = (comprobante?.facturas_ids.length ?? 0) > 1;
  const cargaCompleta =
    comprobante !== null && facturas.length === comprobante.facturas_ids.length;

  const handleConfirmar = () => {
    setIntentoEnviar(true);
    if (!validacion.valido || !comprobante || !cargaCompleta) return;
    mutation.mutate(
      {
        comprobanteId: comprobante.id,
        motivo: validacion.motivo,
        facturas: buildReversalPayload(facturas),
      },
      {
        onError: error => {
          toast({
            title: 'No se pudo reversar el pago',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="w-5 h-5" />
            Reversar pago
          </DialogTitle>
          <DialogDescription>
            Las facturas vuelven a pendiente y el comprobante queda marcado como reversado.
          </DialogDescription>
        </DialogHeader>

        {cargando && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {errorCarga && (
          <p className="text-sm text-destructive">{errorCarga}</p>
        )}

        {comprobante && !cargando && !errorCarga && (
          <div className="space-y-4">
            {esGrupal && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Este pago fue múltiple: se reversarán las {comprobante.facturas_ids.length} facturas del grupo, no solo esta.
                </span>
              </div>
            )}

            <div className="text-sm space-y-1">
              <div>
                <span className="font-medium">Método de pago:</span> {comprobante.metodo_pago ?? 'N/A'}
              </div>
              <div>
                <span className="font-medium">Total pagado:</span>{' '}
                {formatCurrency(Number(comprobante.total_pagado) || 0)}
              </div>
            </div>

            <ul className="max-h-40 overflow-y-auto rounded-md border divide-y text-sm">
              {facturas.map(f => (
                <li key={f.id} className="px-3 py-2 flex justify-between gap-2">
                  <span>
                    {f.numero_factura}
                    {f.emisor_nombre ? ` - ${f.emisor_nombre}` : ''}
                  </span>
                  <span>{formatCurrency(Number(f.total_a_pagar) || 0)}</span>
                </li>
              ))}
            </ul>

            {saldos && saldos.saldos.length > 0 && (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="font-medium">
                  Saldos a favor que se devolverán: {formatCurrency(saldos.total)}
                </div>
                {saldos.hayCancelados && (
                  <div className="text-amber-700">
                    Algunos saldos están cancelados: se les devolverá el monto, pero seguirán cancelados.
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="motivo-reversion">Motivo (obligatorio)</Label>
              <Textarea
                id="motivo-reversion"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder={`Mínimo ${MOTIVO_MIN_LENGTH} caracteres`}
                disabled={mutation.isPending}
              />
              {intentoEnviar && 'error' in validacion && (
                <p className="text-sm text-destructive">{validacion.error}</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmar}
            disabled={mutation.isPending || cargando || !cargaCompleta}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Reversar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
