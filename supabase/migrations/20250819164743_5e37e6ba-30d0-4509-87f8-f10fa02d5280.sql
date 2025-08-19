-- Add column to track original classification before sistematizing
ALTER TABLE public.facturas 
ADD COLUMN clasificacion_original text;