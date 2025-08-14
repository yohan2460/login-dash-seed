-- Crear política más específica para actualizaciones de facturas
DROP POLICY IF EXISTS "Los usuarios pueden actualizar sus propias facturas" ON public.facturas;

CREATE POLICY "Los usuarios pueden actualizar sus propias facturas" 
ON public.facturas 
FOR UPDATE 
USING (auth.uid() = user_id OR user_id = get_system_user_id())
WITH CHECK (auth.uid() = user_id OR user_id = get_system_user_id());