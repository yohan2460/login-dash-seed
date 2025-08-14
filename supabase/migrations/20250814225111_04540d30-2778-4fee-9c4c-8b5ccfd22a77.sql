-- Eliminar tipo_descuento y agregar monto_retencion
ALTER TABLE public.facturas 
DROP COLUMN tipo_descuento,
ADD COLUMN monto_retencion NUMERIC DEFAULT 0;