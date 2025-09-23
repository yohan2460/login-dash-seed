-- Agregar columna valor_real_a_pagar a la tabla facturas
-- Esta columna almacenará el valor real a pagar después de aplicar retenciones y descuentos por pronto pago

ALTER TABLE facturas
ADD COLUMN valor_real_a_pagar DECIMAL(15,2) DEFAULT NULL;

-- Comentario para explicar la columna
COMMENT ON COLUMN facturas.valor_real_a_pagar IS 'Valor real a pagar después de aplicar retenciones y descuentos por pronto pago. Calculado como: total_a_pagar - retencion - descuento_pronto_pago';

-- Crear índice para optimizar consultas
CREATE INDEX idx_facturas_valor_real_a_pagar ON facturas(valor_real_a_pagar);