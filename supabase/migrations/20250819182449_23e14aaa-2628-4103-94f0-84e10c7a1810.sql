-- Asignar rol de administrador a todos los usuarios existentes que no lo tengan
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'admin'::app_role
FROM public.profiles p
LEFT JOIN public.user_roles ur ON p.user_id = ur.user_id AND ur.role = 'admin'
WHERE ur.user_id IS NULL;

-- Verificar que todos los usuarios tengan el rol de admin
-- Esta consulta mostrará todos los usuarios con sus roles después de la inserción