-- Agregar campos para manejar notas de crédito
ALTER TABLE public.facturas 
ADD COLUMN es_nota_credito BOOLEAN DEFAULT FALSE,
ADD COLUMN factura_original_id UUID REFERENCES public.facturas(id) ON DELETE SET NULL,
ADD COLUMN valor_nota_credito DECIMAL(12,2),
ADD COLUMN total_original DECIMAL(12,2),
ADD COLUMN total_con_descuento DECIMAL(12,2);

-- Crear índices para mejorar performance
CREATE INDEX idx_facturas_es_nota_credito ON public.facturas(es_nota_credito);
CREATE INDEX idx_facturas_original_id ON public.facturas(factura_original_id);

-- Función para calcular totales automáticamente cuando se vincula una nota de crédito
CREATE OR REPLACE FUNCTION public.calcular_totales_nota_credito()
RETURNS TRIGGER AS $$
DECLARE
    factura_original RECORD;
    total_notas_credito DECIMAL(12,2);
BEGIN
    -- Solo procesar si es una nota de crédito y tiene factura original
    IF NEW.es_nota_credito = TRUE AND NEW.factura_original_id IS NOT NULL THEN
        -- Obtener la factura original
        SELECT * INTO factura_original 
        FROM public.facturas 
        WHERE id = NEW.factura_original_id;
        
        IF FOUND THEN
            -- Guardar el total original si no se ha guardado antes
            IF NEW.total_original IS NULL THEN
                NEW.total_original := factura_original.total_a_pagar;
            END IF;
            
            -- Usar el valor de la nota de crédito o el total a pagar si no se especifica
            IF NEW.valor_nota_credito IS NULL THEN
                NEW.valor_nota_credito := NEW.total_a_pagar;
            END IF;
            
            -- Calcular el total de todas las notas de crédito para esta factura
            SELECT COALESCE(SUM(valor_nota_credito), 0) INTO total_notas_credito
            FROM public.facturas 
            WHERE factura_original_id = NEW.factura_original_id 
            AND es_nota_credito = TRUE 
            AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
            
            -- Agregar esta nota de crédito al total
            total_notas_credito := total_notas_credito + NEW.valor_nota_credito;
            
            -- Calcular el nuevo total con descuento
            NEW.total_con_descuento := NEW.total_original - total_notas_credito;
            
            -- Actualizar la factura original con el nuevo total
            UPDATE public.facturas 
            SET total_con_descuento = factura_original.total_a_pagar - total_notas_credito
            WHERE id = NEW.factura_original_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para calcular totales automáticamente
CREATE TRIGGER trigger_calcular_totales_nota_credito
    BEFORE INSERT OR UPDATE ON public.facturas
    FOR EACH ROW
    EXECUTE FUNCTION public.calcular_totales_nota_credito();

-- Función para recalcular totales cuando se elimina una nota de crédito
CREATE OR REPLACE FUNCTION public.recalcular_totales_al_eliminar_nota_credito()
RETURNS TRIGGER AS $$
DECLARE
    total_notas_credito DECIMAL(12,2);
    factura_original RECORD;
BEGIN
    -- Solo procesar si era una nota de crédito con factura original
    IF OLD.es_nota_credito = TRUE AND OLD.factura_original_id IS NOT NULL THEN
        -- Obtener la factura original
        SELECT * INTO factura_original 
        FROM public.facturas 
        WHERE id = OLD.factura_original_id;
        
        IF FOUND THEN
            -- Calcular el total de las notas de crédito restantes
            SELECT COALESCE(SUM(valor_nota_credito), 0) INTO total_notas_credito
            FROM public.facturas 
            WHERE factura_original_id = OLD.factura_original_id 
            AND es_nota_credito = TRUE;
            
            -- Actualizar la factura original
            UPDATE public.facturas 
            SET total_con_descuento = factura_original.total_a_pagar - total_notas_credito
            WHERE id = OLD.factura_original_id;
        END IF;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para recalcular al eliminar
CREATE TRIGGER trigger_recalcular_totales_al_eliminar_nota_credito
    AFTER DELETE ON public.facturas
    FOR EACH ROW
    EXECUTE FUNCTION public.recalcular_totales_al_eliminar_nota_credito();

-- Comentarios para documentar los nuevos campos
COMMENT ON COLUMN public.facturas.es_nota_credito IS 'Indica si esta factura es una nota de crédito';
COMMENT ON COLUMN public.facturas.factura_original_id IS 'ID de la factura original a la que se aplica esta nota de crédito';
COMMENT ON COLUMN public.facturas.valor_nota_credito IS 'Valor específico de la nota de crédito (puede ser diferente al total_a_pagar)';
COMMENT ON COLUMN public.facturas.total_original IS 'Total original de la factura antes de aplicar notas de crédito';
COMMENT ON COLUMN public.facturas.total_con_descuento IS 'Total después de aplicar las notas de crédito';