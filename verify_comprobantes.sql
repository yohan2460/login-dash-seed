-- Script para verificar la tabla comprobantes_pago

-- 1. Verificar si la tabla existe
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'comprobantes_pago'
) as tabla_existe;

-- 2. Ver la estructura de la tabla
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'comprobantes_pago'
ORDER BY ordinal_position;

-- 3. Contar registros en la tabla
SELECT COUNT(*) as total_comprobantes FROM public.comprobantes_pago;

-- 4. Ver todos los comprobantes (si existen)
SELECT
  id,
  tipo_comprobante,
  metodo_pago,
  fecha_pago,
  total_pagado,
  cantidad_facturas,
  pdf_file_path,
  facturas_ids,
  created_at
FROM public.comprobantes_pago
ORDER BY created_at DESC
LIMIT 10;

-- 5. Verificar índices
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'comprobantes_pago';

-- 6. Verificar políticas RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'comprobantes_pago';

-- 7. Verificar si RLS está habilitado
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'comprobantes_pago';
