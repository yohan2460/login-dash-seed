-- Crear tabla facturas
CREATE TABLE public.facturas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  numero_factura TEXT NOT NULL,
  emisor_nombre TEXT NOT NULL,
  emisor_nit TEXT NOT NULL,
  notas TEXT,
  total_a_pagar DECIMAL(15,2) NOT NULL,
  nombre_carpeta_factura TEXT,
  factura_cufe TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

-- Crear políticas para acceso de usuarios
CREATE POLICY "Los usuarios pueden ver sus propias facturas" 
ON public.facturas 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden insertar sus propias facturas" 
ON public.facturas 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden actualizar sus propias facturas" 
ON public.facturas 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden eliminar sus propias facturas" 
ON public.facturas 
FOR DELETE 
USING (auth.uid() = user_id);

-- Crear trigger para actualizar updated_at
CREATE TRIGGER update_facturas_updated_at
BEFORE UPDATE ON public.facturas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();