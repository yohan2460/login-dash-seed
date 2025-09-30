-- Add descuentos_antes_iva column to facturas table
ALTER TABLE facturas ADD COLUMN descuentos_antes_iva TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN facturas.descuentos_antes_iva IS 'JSON string containing array of discounts applied before IVA calculation. Each discount has: id, concepto, valor, tipo (porcentaje|valor_fijo)';

-- Create index for JSON queries (optional, for future use)
CREATE INDEX idx_facturas_descuentos_antes_iva ON facturas USING GIN ((descuentos_antes_iva::jsonb)) WHERE descuentos_antes_iva IS NOT NULL;
