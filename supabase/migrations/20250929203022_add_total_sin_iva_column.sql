-- Add total_sin_iva column to facturas table
ALTER TABLE facturas ADD COLUMN total_sin_iva DECIMAL(15,2);

-- Create function to calculate total_sin_iva
CREATE OR REPLACE FUNCTION calculate_total_sin_iva()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate total_sin_iva as total_a_pagar minus factura_iva
  NEW.total_sin_iva = NEW.total_a_pagar - COALESCE(NEW.factura_iva, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically calculate total_sin_iva on insert and update
CREATE TRIGGER trigger_calculate_total_sin_iva
  BEFORE INSERT OR UPDATE ON facturas
  FOR EACH ROW
  EXECUTE FUNCTION calculate_total_sin_iva();

-- Update existing records to populate total_sin_iva
UPDATE facturas
SET total_sin_iva = total_a_pagar - COALESCE(factura_iva, 0);