import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useInvalidateFacturas } from '@/hooks/useInvalidateFacturas';
import {
  parseReversarPagoResult,
  type ReversalFacturaPayload,
  type ReversarPagoResult,
} from '@/utils/reversarPago';

export interface ReversarPagoVariables {
  comprobanteId: string;
  motivo: string;
  facturas: ReversalFacturaPayload[];
}

/**
 * Llama a la RPC atómica `reversar_pago`. El cliente de Supabase no tiene tipos
 * (types.ts está vacío), por eso la respuesta se valida con zod.
 */
export function useReversarPago(options?: { onSuccess?: (result: ReversarPagoResult) => void }) {
  const invalidarFacturas = useInvalidateFacturas();

  return useMutation<ReversarPagoResult, Error, ReversarPagoVariables>({
    mutationFn: async ({ comprobanteId, motivo, facturas }) => {
      const { data, error } = await supabase.rpc('reversar_pago', {
        p_comprobante_id: comprobanteId,
        p_motivo: motivo,
        p_facturas: facturas,
      });
      if (error) throw new Error(error.message);
      return parseReversarPagoResult(data);
    },
    onSuccess: async result => {
      await invalidarFacturas();
      options?.onSuccess?.(result);
    },
  });
}
