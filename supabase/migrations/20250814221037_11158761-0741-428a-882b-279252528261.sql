-- Add IVA columns to facturas table
ALTER TABLE public.facturas 
ADD COLUMN factura_iva NUMERIC DEFAULT 0,
ADD COLUMN factura_iva_porcentaje NUMERIC DEFAULT 0;