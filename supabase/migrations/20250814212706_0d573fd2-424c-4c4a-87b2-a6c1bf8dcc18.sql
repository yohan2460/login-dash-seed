-- Add classification column to facturas table
ALTER TABLE public.facturas 
ADD COLUMN clasificacion text CHECK (clasificacion IN ('mercancia', 'gasto', null));