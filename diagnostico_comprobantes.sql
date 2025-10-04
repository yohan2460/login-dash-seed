-- ========================================
-- SCRIPT DE DIAGNÓSTICO COMPLETO
-- Ejecutar en Supabase SQL Editor
-- ========================================

-- 1. Verificar si la tabla existe
SELECT
  CASE
    WHEN EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'comprobantes_pago'
    )
    THEN '✅ La tabla SÍ existe'
    ELSE '❌ La tabla NO existe - EJECUTAR MIGRACIÓN'
  END as estado_tabla;

-- 2. Ver estructura de la tabla (solo si existe)
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'comprobantes_pago'
ORDER BY ordinal_position;

-- 3. Verificar RLS (Row Level Security)
SELECT
  relname as tabla,
  CASE
    WHEN relrowsecurity THEN '✅ RLS HABILITADO'
    ELSE '❌ RLS DESHABILITADO'
  END as estado_rls
FROM pg_class
WHERE relname = 'comprobantes_pago';

-- 4. Ver políticas de seguridad
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operacion,
  qual as condicion
FROM pg_policies
WHERE tablename = 'comprobantes_pago';

-- 5. Contar registros
SELECT
  COUNT(*) as total_comprobantes,
  COUNT(DISTINCT user_id) as usuarios_con_comprobantes,
  MIN(created_at) as primer_comprobante,
  MAX(created_at) as ultimo_comprobante
FROM comprobantes_pago;

-- 6. Ver últimos 5 comprobantes
SELECT
  id,
  tipo_comprobante,
  metodo_pago,
  fecha_pago,
  total_pagado,
  cantidad_facturas,
  array_length(facturas_ids, 1) as num_facturas_ids,
  created_at
FROM comprobantes_pago
ORDER BY created_at DESC
LIMIT 5;

-- 7. Verificar índices
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'comprobantes_pago'
ORDER BY indexname;

-- 8. Verificar permisos de la tabla
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'comprobantes_pago'
AND table_schema = 'public';

-- 9. Ver si hay errores en los constraints
SELECT
  conname as constraint_name,
  contype as constraint_type,
  CASE contype
    WHEN 'c' THEN 'CHECK'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 't' THEN 'TRIGGER'
    ELSE contype::text
  END as tipo
FROM pg_constraint
WHERE conrelid = 'comprobantes_pago'::regclass;

-- 10. Probar INSERT manual (CAMBIAR user_id por tu ID real)
-- Descomenta y ejecuta SOLO después de verificar todo lo anterior
/*
INSERT INTO comprobantes_pago (
  user_id,
  tipo_comprobante,
  metodo_pago,
  fecha_pago,
  total_pagado,
  cantidad_facturas,
  pdf_file_path,
  facturas_ids,
  detalles
) VALUES (
  'TU-USER-ID-AQUI',  -- ⚠️ CAMBIAR ESTO
  'pago_individual',
  'Pago Banco',
  NOW(),
  1000000,
  1,
  'test/test.pdf',
  ARRAY['test-factura-id'],
  '{"test": true}'::jsonb
) RETURNING *;
*/

-- 11. Ver tu user_id actual
SELECT
  auth.uid() as mi_user_id,
  CASE
    WHEN auth.uid() IS NOT NULL THEN '✅ Autenticado'
    ELSE '❌ NO autenticado'
  END as estado_auth;
