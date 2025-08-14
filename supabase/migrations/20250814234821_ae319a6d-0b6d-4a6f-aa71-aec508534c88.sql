-- Add columns to store payment information
ALTER TABLE public.facturas 
ADD COLUMN metodo_pago TEXT,
ADD COLUMN uso_pronto_pago BOOLEAN DEFAULT false,
ADD COLUMN monto_pagado NUMERIC;