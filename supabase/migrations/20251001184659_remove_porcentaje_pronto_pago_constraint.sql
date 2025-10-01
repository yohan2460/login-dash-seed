-- Remove the check constraint on porcentaje_pronto_pago to allow values greater than 5%
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_porcentaje_pronto_pago_check;

-- Add a new constraint that only checks the value is non-negative (>= 0)
ALTER TABLE facturas ADD CONSTRAINT facturas_porcentaje_pronto_pago_check CHECK (porcentaje_pronto_pago >= 0);
