-- Corregir la función para cumplir con las mejores prácticas de seguridad
CREATE OR REPLACE FUNCTION public.get_system_user_id()
RETURNS UUID 
LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN (SELECT id FROM auth.users WHERE email = 'facturas@n8n.system' LIMIT 1);
END;
$$;