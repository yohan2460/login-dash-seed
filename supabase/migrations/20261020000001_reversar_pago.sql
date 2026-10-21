-- Reversar pago: soft-delete de comprobantes_pago + RPC atómica reversar_pago.
-- Parte 1: columnas aditivas (los comprobantes existentes quedan 'activo').
ALTER TABLE public.comprobantes_pago
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS reversado_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_reversion text,
  ADD COLUMN IF NOT EXISTS snapshot_reversion jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comprobantes_pago_estado_check'
      AND conrelid = 'public.comprobantes_pago'::regclass
  ) THEN
    ALTER TABLE public.comprobantes_pago
      ADD CONSTRAINT comprobantes_pago_estado_check
      CHECK (estado IN ('activo', 'reversado'));
  END IF;
END $$;

COMMENT ON COLUMN public.comprobantes_pago.estado IS
  'activo | reversado. Los reversados se conservan (soft delete) y no deben listarse.';

-- Parte 2: función reversar_pago.
-- SECURITY DEFINER porque comprobantes_pago / saldos_favor / pagos_partidos tienen RLS por
-- dueño (auth.uid() = user_id) y el admin que reversa puede no ser quien registró el pago.
-- La autorización se hace con has_admin_role(auth.uid()).
CREATE OR REPLACE FUNCTION public.reversar_pago(
  p_comprobante_id uuid,
  p_motivo text,
  p_facturas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comp public.comprobantes_pago%ROWTYPE;
  v_ids uuid[];
  v_payload_ids uuid[];
  v_payload_count int;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_count int;
  v_pagadas int;
  v_ap record;
  v_saldo record;
  v_warnings text[] := ARRAY[]::text[];
  v_derivados uuid[];
  v_snapshot jsonb;
  v_n_pp int := 0;
  v_n_fact int := 0;
  v_n_ap int := 0;
  v_monto numeric := 0;
  v_saldo_ids uuid[];
BEGIN
  -- 1. Guardas de entrada
  IF v_uid IS NULL OR NOT public.has_admin_role(v_uid) THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol administrador';
  END IF;

  IF char_length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'motivo requerido (mínimo 5 caracteres)';
  END IF;

  IF p_facturas IS NULL OR jsonb_typeof(p_facturas) <> 'array' OR jsonb_array_length(p_facturas) = 0 THEN
    RAISE EXCEPTION 'p_facturas debe ser un arreglo no vacío';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_facturas) e
    WHERE jsonb_typeof(e) <> 'object'
       OR jsonb_typeof(e->'id') <> 'string'
       OR jsonb_typeof(e->'valor_real_a_pagar') <> 'number'
       OR (e->>'valor_real_a_pagar')::numeric < 0
  ) THEN
    RAISE EXCEPTION 'p_facturas inválido: cada elemento requiere id y valor_real_a_pagar >= 0';
  END IF;

  SELECT array_agg((e->>'id')::uuid), count(*)
    INTO v_payload_ids, v_payload_count
  FROM jsonb_array_elements(p_facturas) e;

  IF cardinality(ARRAY(SELECT DISTINCT unnest(v_payload_ids))) <> v_payload_count THEN
    RAISE EXCEPTION 'p_facturas contiene ids duplicados';
  END IF;

  -- 2. Bloquear y validar el comprobante
  SELECT * INTO v_comp
  FROM public.comprobantes_pago
  WHERE id = p_comprobante_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comprobante no encontrado';
  END IF;
  IF v_comp.estado <> 'activo' THEN
    RAISE EXCEPTION 'El comprobante ya está reversado';
  END IF;
  IF v_comp.detalles ? 'regenerado_desde_grupal'
     AND nullif(v_comp.detalles->>'regenerado_desde_grupal', '') IS NOT NULL THEN
    RAISE EXCEPTION 'Comprobante derivado: reversá el comprobante grupal';
  END IF;

  -- 3. facturas_ids es TEXT[]; el conjunto debe coincidir con el payload
  v_ids := v_comp.facturas_ids::uuid[];
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'El comprobante no tiene facturas asociadas';
  END IF;
  IF NOT (v_ids <@ v_payload_ids AND v_payload_ids <@ v_ids) THEN
    RAISE EXCEPTION 'p_facturas no coincide con las facturas del comprobante';
  END IF;

  -- 4. Bloquear facturas en orden determinístico y validar estado pagada
  SELECT count(*), count(*) FILTER (WHERE estado_mercancia = 'pagada')
    INTO v_count, v_pagadas
  FROM (
    SELECT f.estado_mercancia
    FROM public.facturas f
    WHERE f.id = ANY(v_ids)
    ORDER BY f.id
    FOR UPDATE
  ) s;

  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Alguna factura del comprobante no existe';
  END IF;
  IF v_pagadas <> v_count THEN
    RAISE EXCEPTION 'Todas las facturas deben estar en estado pagada';
  END IF;

  -- 5a. Comprobantes derivados (estricto) y solapamiento ambiguo
  SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[]::uuid[]) INTO v_derivados
  FROM public.comprobantes_pago c
  WHERE c.id <> v_comp.id
    AND c.estado = 'activo'
    AND c.detalles->>'regenerado_desde_grupal' = v_comp.id::text
    AND c.facturas_ids <@ v_comp.facturas_ids;

  IF EXISTS (
    SELECT 1 FROM public.comprobantes_pago c
    WHERE c.id <> v_comp.id
      AND c.estado = 'activo'
      AND c.facturas_ids && v_comp.facturas_ids
      AND NOT (c.id = ANY(v_derivados))
  ) THEN
    RAISE EXCEPTION 'Alguna factura figura en otro comprobante activo no derivado (ambiguo)';
  END IF;

  -- 5b. Saldos con factura_origen en el grupo ya aplicados fuera del grupo
  IF EXISTS (
    SELECT 1
    FROM public.saldos_favor s
    JOIN public.aplicaciones_saldo a ON a.saldo_favor_id = s.id
    WHERE s.factura_origen_id = ANY(v_ids)
      AND NOT (a.factura_destino_id = ANY(v_ids))
  ) THEN
    RAISE EXCEPTION 'Un saldo generado por estas facturas ya fue aplicado a otra factura fuera del grupo';
  END IF;

  FOR v_saldo IN
    SELECT s.id FROM public.saldos_favor s
    WHERE s.factura_origen_id = ANY(v_ids)
      AND NOT EXISTS (SELECT 1 FROM public.aplicaciones_saldo a WHERE a.saldo_favor_id = s.id)
  LOOP
    v_warnings := v_warnings || format('saldo %s generado por estas facturas no se modificó', v_saldo.id);
  END LOOP;

  -- 5c. Bloquear saldos afectados en orden determinístico
  SELECT coalesce(array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_saldo_ids
  FROM (
    SELECT DISTINCT a.saldo_favor_id AS id
    FROM public.aplicaciones_saldo a
    WHERE a.factura_destino_id = ANY(v_ids)
  ) x;

  PERFORM 1 FROM public.saldos_favor s
  WHERE s.id = ANY(v_saldo_ids)
  ORDER BY s.id
  FOR UPDATE;

  -- 6. Snapshot (versión 1) previo a cualquier cambio
  SELECT jsonb_build_object(
    'version', 1,
    'facturas', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id)
                          FROM public.facturas f WHERE f.id = ANY(v_ids)), '[]'::jsonb),
    'pagos_partidos', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
                          FROM public.pagos_partidos p WHERE p.factura_id = ANY(v_ids)), '[]'::jsonb),
    'aplicaciones_saldo', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                          FROM public.aplicaciones_saldo a WHERE a.factura_destino_id = ANY(v_ids)), '[]'::jsonb),
    'saldos', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
                          FROM public.saldos_favor s WHERE s.id = ANY(v_saldo_ids)), '[]'::jsonb),
    'derivados', to_jsonb(v_derivados)
  ) INTO v_snapshot;

  -- 7. Devolver saldos aplicados (revertir_aplicacion_saldo restaura y borra la aplicación)
  FOR v_ap IN
    SELECT a.id, a.saldo_favor_id, a.monto_aplicado, s.estado AS saldo_estado
    FROM public.aplicaciones_saldo a
    JOIN public.saldos_favor s ON s.id = a.saldo_favor_id
    WHERE a.factura_destino_id = ANY(v_ids)
    ORDER BY a.id
  LOOP
    IF v_ap.saldo_estado = 'cancelado' THEN
      v_warnings := v_warnings || format(
        'saldo %s está cancelado: se devolvió %s pero sigue cancelado',
        v_ap.saldo_favor_id, v_ap.monto_aplicado);
    END IF;
    PERFORM public.revertir_aplicacion_saldo(v_ap.id);
    v_n_ap := v_n_ap + 1;
    v_monto := v_monto + v_ap.monto_aplicado;
  END LOOP;

  -- Guarda de sobre-restauración: el saldo nunca debe superar el monto inicial
  FOR v_saldo IN
    SELECT s.id, s.saldo_disponible, s.monto_inicial
    FROM public.saldos_favor s
    WHERE s.id = ANY(v_saldo_ids)
  LOOP
    IF v_saldo.saldo_disponible > v_saldo.monto_inicial THEN
      RAISE EXCEPTION 'Inconsistencia: el saldo % superaría su monto inicial al restaurarse', v_saldo.id;
    END IF;
  END LOOP;

  -- 8. Eliminar todos los pagos partidos del grupo
  DELETE FROM public.pagos_partidos WHERE factura_id = ANY(v_ids);
  GET DIAGNOSTICS v_n_pp = ROW_COUNT;

  -- 9. Restaurar facturas (porcentaje_pronto_pago y monto_pagado no se tocan)
  UPDATE public.facturas f
  SET estado_mercancia = 'pendiente',
      metodo_pago = NULL,
      fecha_pago = NULL,
      uso_pronto_pago = false,
      valor_real_a_pagar = p.valor_real_a_pagar
  FROM jsonb_to_recordset(p_facturas) AS p(id uuid, valor_real_a_pagar numeric)
  WHERE f.id = p.id;
  GET DIAGNOSTICS v_n_fact = ROW_COUNT;

  IF v_n_fact <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Se esperaba restaurar % facturas pero se restauraron %', cardinality(v_ids), v_n_fact;
  END IF;

  -- 10. Marcar comprobante objetivo (con snapshot) y derivados
  UPDATE public.comprobantes_pago
  SET estado = 'reversado',
      reversado_at = now(),
      reversado_por = v_uid,
      motivo_reversion = v_motivo,
      snapshot_reversion = v_snapshot
  WHERE id = v_comp.id;

  IF cardinality(v_derivados) > 0 THEN
    UPDATE public.comprobantes_pago
    SET estado = 'reversado',
        reversado_at = now(),
        reversado_por = v_uid,
        motivo_reversion = v_motivo
    WHERE id = ANY(v_derivados);
  END IF;

  -- 11. Resultado
  RETURN jsonb_build_object(
    'comprobante_id', v_comp.id,
    'facturas_restauradas', v_n_fact,
    'pagos_partidos_eliminados', v_n_pp,
    'aplicaciones_revertidas', v_n_ap,
    'monto_saldo_devuelto', v_monto,
    'derivados_reversados', cardinality(v_derivados),
    'warnings', to_jsonb(v_warnings)
  );
END;
$$;

-- Parte 3: permisos (solo usuarios autenticados; la función valida el rol admin).
REVOKE ALL ON FUNCTION public.reversar_pago(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reversar_pago(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.reversar_pago(uuid, text, jsonb) TO authenticated;
