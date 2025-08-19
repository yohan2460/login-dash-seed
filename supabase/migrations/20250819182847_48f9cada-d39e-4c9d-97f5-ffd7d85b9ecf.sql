-- Actualizar políticas RLS para permitir que los administradores vean todas las facturas
DROP POLICY IF EXISTS "Los usuarios pueden ver sus propias facturas" ON public.facturas;
DROP POLICY IF EXISTS "Los usuarios pueden ver facturas del sistema" ON public.facturas;

-- Crear nueva política que permite a los administradores ver todas las facturas
CREATE POLICY "Los administradores pueden ver todas las facturas"
ON public.facturas
FOR SELECT
TO authenticated
USING (
  public.has_admin_role(auth.uid()) OR 
  auth.uid() = user_id OR 
  user_id = get_system_user_id()
);

-- Actualizar política de actualización para administradores
DROP POLICY IF EXISTS "Los usuarios pueden actualizar sus propias facturas" ON public.facturas;
CREATE POLICY "Los administradores pueden actualizar todas las facturas"
ON public.facturas
FOR UPDATE
TO authenticated
USING (
  public.has_admin_role(auth.uid()) OR 
  auth.uid() = user_id OR 
  user_id = get_system_user_id()
)
WITH CHECK (
  public.has_admin_role(auth.uid()) OR 
  auth.uid() = user_id OR 
  user_id = get_system_user_id()
);

-- Actualizar política de eliminación para administradores
DROP POLICY IF EXISTS "Los usuarios pueden eliminar sus propias facturas" ON public.facturas;
CREATE POLICY "Los administradores pueden eliminar todas las facturas"
ON public.facturas
FOR DELETE
TO authenticated
USING (
  public.has_admin_role(auth.uid()) OR 
  auth.uid() = user_id
);