-- Agregar columna estado_nota_credito para gestionar el ciclo de vida de las notas de crédito
ALTER TABLE public.facturas
ADD COLUMN estado_nota_credito VARCHAR(50);

-- Comentario explicativo
COMMENT ON COLUMN public.facturas.estado_nota_credito IS 'Estado de la nota de crédito: NULL (no es NC), pendiente (NC sin aplicar), aplicada (NC relacionada), anulada (factura resultante en $0)';

-- Migrar datos existentes: las facturas con clasificacion = 'nota_credito' pasan a 'aplicada'
UPDATE public.facturas
SET estado_nota_credito = 'aplicada'
WHERE clasificacion = 'nota_credito' AND notas IS NOT NULL;

-- Crear índice para mejorar performance en consultas
CREATE INDEX idx_facturas_estado_nota_credito ON public.facturas(estado_nota_credito);

-- Agregar constraint para valores válidos
ALTER TABLE public.facturas
ADD CONSTRAINT chk_estado_nota_credito
CHECK (estado_nota_credito IN ('pendiente', 'aplicada', 'anulada') OR estado_nota_credito IS NULL);
