-- Add payment date field to facturas table
ALTER TABLE public.facturas 
ADD COLUMN fecha_pago timestamp with time zone;