-- Primero eliminamos la política existente para crearla de nuevo
DROP POLICY IF EXISTS "Los usuarios pueden eliminar sus propias facturas" ON public.facturas;

-- Creamos una nueva política de eliminación más robusta
CREATE POLICY "Los usuarios pueden eliminar sus propias facturas" 
ON public.facturas 
FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- También asegurémonos de que la política de selección funcione correctamente
DROP POLICY IF EXISTS "Los usuarios pueden ver sus propias facturas" ON public.facturas;

CREATE POLICY "Los usuarios pueden ver sus propias facturas" 
ON public.facturas 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Verificar que RLS esté habilitado
ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;