-- Agregar campo numero_serie para facturas de mercancía
ALTER TABLE public.facturas 
ADD COLUMN numero_serie TEXT;