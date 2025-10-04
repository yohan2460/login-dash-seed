-- Crear tabla para almacenar comprobantes de pago
CREATE TABLE public.comprobantes_pago (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_comprobante TEXT NOT NULL CHECK (tipo_comprobante IN ('pago_individual', 'pago_multiple')),
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('Pago Banco', 'Pago Tobías', 'Caja', 'Pago Partido')),
  fecha_pago TIMESTAMP WITH TIME ZONE NOT NULL,
  total_pagado NUMERIC(15,2) NOT NULL,
  cantidad_facturas INTEGER NOT NULL DEFAULT 1,
  pdf_file_path TEXT NOT NULL,
  facturas_ids TEXT[] NOT NULL,
  detalles JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE public.comprobantes_pago ENABLE ROW LEVEL SECURITY;

-- Crear políticas de seguridad
CREATE POLICY "Los usuarios pueden ver sus propios comprobantes"
ON public.comprobantes_pago
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden insertar sus propios comprobantes"
ON public.comprobantes_pago
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden actualizar sus propios comprobantes"
ON public.comprobantes_pago
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden eliminar sus propios comprobantes"
ON public.comprobantes_pago
FOR DELETE
USING (auth.uid() = user_id);

-- Crear índices para optimizar consultas
CREATE INDEX idx_comprobantes_pago_user_id ON public.comprobantes_pago(user_id);
CREATE INDEX idx_comprobantes_pago_fecha ON public.comprobantes_pago(fecha_pago DESC);
CREATE INDEX idx_comprobantes_pago_facturas_ids ON public.comprobantes_pago USING GIN(facturas_ids);

-- Comentarios
COMMENT ON TABLE public.comprobantes_pago IS 'Almacena los comprobantes de pago generados en PDF';
COMMENT ON COLUMN public.comprobantes_pago.tipo_comprobante IS 'Tipo de comprobante: pago_individual o pago_multiple';
COMMENT ON COLUMN public.comprobantes_pago.metodo_pago IS 'Método de pago utilizado';
COMMENT ON COLUMN public.comprobantes_pago.pdf_file_path IS 'Ruta del PDF en Supabase Storage';
COMMENT ON COLUMN public.comprobantes_pago.facturas_ids IS 'Array de IDs de facturas asociadas al comprobante';
COMMENT ON COLUMN public.comprobantes_pago.detalles IS 'Detalles adicionales del pago en formato JSON';
