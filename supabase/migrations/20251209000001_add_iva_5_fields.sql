-- Add IVA 5% fields to facturas table
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS factura_iva_5 DECIMAL(15,2) DEFAULT 0;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS factura_iva_5_porcentaje DECIMAL(5,2) DEFAULT 5;

-- Update function to calculate total_sin_iva considering both IVAs
CREATE OR REPLACE FUNCTION calculate_total_sin_iva()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate total_sin_iva as total_a_pagar minus both IVAs (19% and 5%)
  NEW.total_sin_iva = NEW.total_a_pagar - COALESCE(NEW.factura_iva, 0) - COALESCE(NEW.factura_iva_5, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update existing records to recalculate total_sin_iva (only if they don't have IVA 5%)
-- This ensures backward compatibility
UPDATE facturas
SET total_sin_iva = total_a_pagar - COALESCE(factura_iva, 0) - COALESCE(factura_iva_5, 0)
WHERE factura_iva_5 IS NULL OR factura_iva_5 = 0;
