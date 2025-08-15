-- Agregar columnas fecha_emision y fecha_vencimiento a la tabla facturas
ALTER TABLE public.facturas 
ADD COLUMN fecha_emision DATE,
ADD COLUMN fecha_vencimiento DATE;