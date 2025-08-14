-- Agregar campo estado_mercancia para sub-estados de mercancía
ALTER TABLE public.facturas 
ADD COLUMN estado_mercancia TEXT;