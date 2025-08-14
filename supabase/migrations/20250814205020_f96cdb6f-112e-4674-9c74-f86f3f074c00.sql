-- Crear bucket para almacenar archivos PDF de facturas
INSERT INTO storage.buckets (id, name, public) VALUES ('facturas-pdf', 'facturas-pdf', false);

-- Crear políticas para el bucket de facturas
CREATE POLICY "System can upload PDF files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'facturas-pdf');

CREATE POLICY "Users can view their own PDF files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'facturas-pdf');

CREATE POLICY "System can update PDF files" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'facturas-pdf');

-- Agregar columna para el path del archivo PDF en la tabla facturas
ALTER TABLE public.facturas ADD COLUMN pdf_file_path TEXT;