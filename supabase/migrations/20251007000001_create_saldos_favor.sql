-- Crear tabla para saldos a favor
CREATE TABLE public.saldos_favor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emisor_nombre TEXT NOT NULL,
  emisor_nit TEXT NOT NULL,
  monto_inicial NUMERIC(15,2) NOT NULL CHECK (monto_inicial > 0),
  saldo_disponible NUMERIC(15,2) NOT NULL CHECK (saldo_disponible >= 0),
  factura_origen_id UUID REFERENCES public.facturas(id) ON DELETE SET NULL,
  numero_factura_origen TEXT,
  motivo TEXT NOT NULL, -- 'pago_exceso', 'nota_credito', 'ajuste_manual'
  descripcion TEXT,
  fecha_generacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'agotado', 'cancelado')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla para registrar aplicaciones de saldos a favor
CREATE TABLE public.aplicaciones_saldo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  saldo_favor_id UUID NOT NULL REFERENCES public.saldos_favor(id) ON DELETE CASCADE,
  factura_destino_id UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  monto_aplicado NUMERIC(15,2) NOT NULL CHECK (monto_aplicado > 0),
  fecha_aplicacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE public.saldos_favor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aplicaciones_saldo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para saldos_favor
CREATE POLICY "Los usuarios pueden ver sus propios saldos a favor"
ON public.saldos_favor
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden insertar sus propios saldos a favor"
ON public.saldos_favor
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden actualizar sus propios saldos a favor"
ON public.saldos_favor
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden eliminar sus propios saldos a favor"
ON public.saldos_favor
FOR DELETE
USING (auth.uid() = user_id);

-- Políticas RLS para aplicaciones_saldo (a través de saldos_favor)
CREATE POLICY "Los usuarios pueden ver aplicaciones de sus saldos"
ON public.aplicaciones_saldo
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.saldos_favor
    WHERE saldos_favor.id = aplicaciones_saldo.saldo_favor_id
    AND saldos_favor.user_id = auth.uid()
  )
);

CREATE POLICY "Los usuarios pueden crear aplicaciones de sus saldos"
ON public.aplicaciones_saldo
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.saldos_favor
    WHERE saldos_favor.id = aplicaciones_saldo.saldo_favor_id
    AND saldos_favor.user_id = auth.uid()
  )
);

CREATE POLICY "Los usuarios pueden actualizar aplicaciones de sus saldos"
ON public.aplicaciones_saldo
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.saldos_favor
    WHERE saldos_favor.id = aplicaciones_saldo.saldo_favor_id
    AND saldos_favor.user_id = auth.uid()
  )
);

CREATE POLICY "Los usuarios pueden eliminar aplicaciones de sus saldos"
ON public.aplicaciones_saldo
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.saldos_favor
    WHERE saldos_favor.id = aplicaciones_saldo.saldo_favor_id
    AND saldos_favor.user_id = auth.uid()
  )
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_saldos_favor_user_id ON public.saldos_favor(user_id);
CREATE INDEX idx_saldos_favor_emisor_nit ON public.saldos_favor(emisor_nit);
CREATE INDEX idx_saldos_favor_estado ON public.saldos_favor(estado);
CREATE INDEX idx_aplicaciones_saldo_saldo_favor_id ON public.aplicaciones_saldo(saldo_favor_id);
CREATE INDEX idx_aplicaciones_saldo_factura_destino_id ON public.aplicaciones_saldo(factura_destino_id);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_saldos_favor_updated_at
BEFORE UPDATE ON public.saldos_favor
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Función para actualizar automáticamente el estado del saldo
CREATE OR REPLACE FUNCTION public.actualizar_estado_saldo_favor()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el saldo disponible llega a 0, marcar como agotado
  IF NEW.saldo_disponible <= 0 THEN
    NEW.estado = 'agotado';
  ELSIF NEW.estado = 'agotado' AND NEW.saldo_disponible > 0 THEN
    -- Si se libera saldo (por ejemplo, al eliminar una aplicación), reactivar
    NEW.estado = 'activo';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_actualizar_estado_saldo
BEFORE UPDATE OF saldo_disponible ON public.saldos_favor
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_estado_saldo_favor();

-- Función para aplicar saldo a favor y actualizar el saldo disponible
CREATE OR REPLACE FUNCTION public.aplicar_saldo_favor(
  p_saldo_favor_id UUID,
  p_factura_destino_id UUID,
  p_monto_aplicado NUMERIC
)
RETURNS UUID AS $$
DECLARE
  v_saldo_disponible NUMERIC;
  v_aplicacion_id UUID;
BEGIN
  -- Verificar que el saldo existe y tiene disponibilidad
  SELECT saldo_disponible INTO v_saldo_disponible
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
    monto_aplicado
  ) VALUES (
    p_saldo_favor_id,
    p_factura_destino_id,
    p_monto_aplicado
  ) RETURNING id INTO v_aplicacion_id;

  -- Actualizar el saldo disponible
  UPDATE public.saldos_favor
  SET saldo_disponible = saldo_disponible - p_monto_aplicado
  WHERE id = p_saldo_favor_id;

  RETURN v_aplicacion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para revertir aplicación de saldo (en caso de error o cancelación)
CREATE OR REPLACE FUNCTION public.revertir_aplicacion_saldo(p_aplicacion_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_saldo_favor_id UUID;
  v_monto_aplicado NUMERIC;
BEGIN
  -- Obtener datos de la aplicación
  SELECT saldo_favor_id, monto_aplicado
  INTO v_saldo_favor_id, v_monto_aplicado
  FROM public.aplicaciones_saldo
  WHERE id = p_aplicacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aplicación de saldo no encontrada';
  END IF;

  -- Restaurar el saldo
  UPDATE public.saldos_favor
  SET saldo_disponible = saldo_disponible + v_monto_aplicado
  WHERE id = v_saldo_favor_id;

  -- Eliminar la aplicación
  DELETE FROM public.aplicaciones_saldo
  WHERE id = p_aplicacion_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
