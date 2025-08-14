-- Primero eliminar la política problemática
DROP POLICY IF EXISTS "Los usuarios pueden ver facturas del sistema" ON public.facturas;

-- Crear función security definer para obtener el ID del usuario del sistema
CREATE OR REPLACE FUNCTION public.get_system_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM auth.users WHERE email = 'facturas@n8n.system' LIMIT 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Crear nueva política usando la función
CREATE POLICY "Los usuarios pueden ver facturas del sistema"
ON public.facturas
FOR SELECT
TO authenticated
USING (user_id = public.get_system_user_id());