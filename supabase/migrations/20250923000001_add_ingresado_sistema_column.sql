-- Add ingresado_sistema column to facturas table
ALTER TABLE facturas ADD COLUMN ingresado_sistema boolean DEFAULT false;

-- Update existing records: if estado_mercancia is 'ingresado_sistema', set ingresado_sistema to true
UPDATE facturas
SET ingresado_sistema = true
WHERE estado_mercancia = 'ingresado_sistema';

-- Update estado_mercancia from 'ingresado_sistema' to 'pagada' for records that are already paid
UPDATE facturas
SET estado_mercancia = 'pagada'
WHERE estado_mercancia = 'ingresado_sistema';