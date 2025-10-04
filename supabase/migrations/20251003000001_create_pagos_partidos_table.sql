-- Crear tabla para pagos partidos (split payments)
CREATE TABLE public.pagos_partidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  factura_id UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('Pago Banco', 'Pago Tobías', 'Caja')),
  monto NUMERIC(15,2) NOT NULL CHECK (monto > 0),
  fecha_pago TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE public.pagos_partidos ENABLE ROW LEVEL SECURITY;

-- Crear políticas para acceso de usuarios (a través de la factura)
CREATE POLICY "Los usuarios pueden ver pagos de sus propias facturas"
ON public.pagos_partidos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.facturas
    WHERE facturas.id = pagos_partidos.factura_id
    AND facturas.user_id = auth.uid()
  )
);

CREATE POLICY "Los usuarios pueden insertar pagos en sus propias facturas"
ON public.pagos_partidos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.facturas
    WHERE facturas.id = pagos_partidos.factura_id
    AND facturas.user_id = auth.uid()
  )
);

CREATE POLICY "Los usuarios pueden actualizar pagos de sus propias facturas"
ON public.pagos_partidos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.facturas
    WHERE facturas.id = pagos_partidos.factura_id
    AND facturas.user_id = auth.uid()
  )
);

CREATE POLICY "Los usuarios pueden eliminar pagos de sus propias facturas"
ON public.pagos_partidos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.facturas
    WHERE facturas.id = pagos_partidos.factura_id
    AND facturas.user_id = auth.uid()
  )
);

-- Crear índice para mejorar el rendimiento de búsquedas por factura
CREATE INDEX idx_pagos_partidos_factura_id ON public.pagos_partidos(factura_id);
