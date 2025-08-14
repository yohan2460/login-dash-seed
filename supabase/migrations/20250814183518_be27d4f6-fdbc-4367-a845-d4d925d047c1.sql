-- Crear una política que permita insertar facturas desde la edge function
-- usando el service role (para llamadas de n8n)
CREATE POLICY "Permitir inserción desde edge function" 
ON public.facturas 
FOR INSERT 
WITH CHECK (
  -- Permitir si se está usando el service role (edge functions)
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  -- O si el usuario autenticado coincide con el user_id
  OR auth.uid() = user_id
);