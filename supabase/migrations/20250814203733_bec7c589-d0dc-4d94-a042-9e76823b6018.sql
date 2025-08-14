-- Crear política para permitir que todos los usuarios vean las facturas del sistema
CREATE POLICY "Los usuarios pueden ver facturas del sistema"
ON public.facturas
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT u.id 
    FROM auth.users u 
    WHERE u.email = 'facturas@n8n.system'
  )
);