-- Añadir columna medio_pago a saldos_favor y aplicaciones_saldo
ALTER TABLE public.saldos_favor
ADD COLUMN IF NOT EXISTS medio_pago TEXT NOT NULL DEFAULT 'Pago Banco'
  CHECK (medio_pago IN ('Pago Banco', 'Pago Tobías', 'Caja'));

ALTER TABLE public.aplicaciones_saldo
ADD COLUMN IF NOT EXISTS medio_pago TEXT;

-- Sincronizar medio_pago en aplicaciones existentes
UPDATE public.aplicaciones_saldo app
SET medio_pago = sf.medio_pago
FROM public.saldos_favor sf
WHERE app.saldo_favor_id = sf.id
  AND (app.medio_pago IS NULL OR app.medio_pago = '');

-- Actualizar función para registrar medio_pago durante la aplicación
CREATE OR REPLACE FUNCTION public.aplicar_saldo_favor(
  p_saldo_favor_id UUID,
  p_factura_destino_id UUID,
  p_monto_aplicado NUMERIC
)
RETURNS UUID AS $$
DECLARE
  v_saldo_disponible NUMERIC;
  v_medio_pago TEXT;
  v_aplicacion_id UUID;
BEGIN
  -- Verificar que el saldo existe y tiene disponibilidad
  SELECT saldo_disponible, medio_pago
  INTO v_saldo_disponible, v_medio_pago
  FROM public.saldos_favor
  WHERE id = p_saldo_favor_id
    AND estado = 'activo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saldo a favor no encontrado o no está activo';
  END IF;

  -- Verificar que hay suficiente saldo
  IF v_saldo_disponible < p_monto_aplicado THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponible: %, Solicitado: %', v_saldo_disponible, p_monto_aplicado;
  END IF;

  -- Crear la aplicación
  INSERT INTO public.aplicaciones_saldo (
    saldo_favor_id,
    factura_destino_id,
    monto_aplicado,
    medio_pago
  ) VALUES (
    p_saldo_favor_id,
    p_factura_destino_id,
    p_monto_aplicado,
    v_medio_pago
  ) RETURNING id INTO v_aplicacion_id;

  -- Actualizar el saldo disponible
  UPDATE public.saldos_favor
  SET saldo_disponible = saldo_disponible - p_monto_aplicado
  WHERE id = p_saldo_favor_id;

  RETURN v_aplicacion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
