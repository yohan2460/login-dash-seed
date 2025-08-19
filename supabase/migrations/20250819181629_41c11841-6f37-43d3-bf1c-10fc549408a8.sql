-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable Row Level Security
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create function to check if user has admin role
CREATE OR REPLACE FUNCTION public.has_admin_role(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = user_uuid
      AND role = 'admin'
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_admin_role(auth.uid()));

CREATE POLICY "Admins can insert user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_admin_role(auth.uid()));

CREATE POLICY "Admins can update user roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_admin_role(auth.uid()));

CREATE POLICY "Admins can delete user roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_admin_role(auth.uid()));

-- Update handle_new_user function to assign admin role automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (new.id, new.email);
  
  -- Assign admin role automatically to all new users
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'admin');
  
  RETURN new;
END;
$$;

-- Create function for admins to create users
CREATE OR REPLACE FUNCTION public.admin_create_user(user_email TEXT, user_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  new_user_id UUID;
  result JSON;
BEGIN
  -- Check if current user is admin
  IF NOT public.has_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  -- This function can be used by admins to create users
  -- Note: This is a placeholder - actual user creation needs to be done via Supabase Auth API
  RETURN json_build_object(
    'success', true,
    'message', 'Use Supabase Auth API to create users'
  );
END;
$$;