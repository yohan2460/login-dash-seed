-- Agregar campos adicionales para clasificación de facturas
ALTER TABLE public.facturas 
ADD COLUMN descripcion TEXT,
ADD COLUMN tiene_retencion BOOLEAN DEFAULT FALSE,
ADD COLUMN tipo_descuento TEXT,
ADD COLUMN porcentaje_pronto_pago NUMERIC CHECK (porcentaje_pronto_pago >= 0 AND porcentaje_pronto_pago <= 5);