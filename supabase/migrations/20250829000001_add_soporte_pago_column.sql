-- Agregar columna para almacenar ruta del soporte de pago
ALTER TABLE public.comprobantes_pago
ADD COLUMN soporte_pago_file_path TEXT;

COMMENT ON COLUMN public.comprobantes_pago.soporte_pago_file_path IS 'Ruta del soporte de pago (archivo subido por el usuario)';
