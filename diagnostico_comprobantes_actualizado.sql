-- Script de diagnóstico para verificar la tabla comprobantes_pago
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar si la tabla existe
SELECT
    table_name,
    table_type
FROM
    information_schema.tables
WHERE
    table_schema = 'public'
    AND table_name = 'comprobantes_pago';

-- 2. Ver la estructura de la tabla
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM
    information_schema.columns
WHERE
    table_schema = 'public'
    AND table_name = 'comprobantes_pago'
ORDER BY
    ordinal_position;

-- 3. Verificar políticas RLS
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM
    pg_policies
WHERE
    schemaname = 'public'
    AND tablename = 'comprobantes_pago';

-- 4. Verificar índices
SELECT
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    schemaname = 'public'
    AND tablename = 'comprobantes_pago';

-- 5. Contar registros existentes
SELECT
    COUNT(*) as total_comprobantes,
    tipo_comprobante,
    COUNT(*) as por_tipo
FROM
    comprobantes_pago
GROUP BY
    tipo_comprobante;

-- 6. Ver últimos 5 comprobantes creados
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
FROM
    comprobantes_pago
ORDER BY
    created_at DESC
LIMIT 5;

-- 7. Verificar RLS está habilitado
SELECT
    tablename,
    rowsecurity
FROM
    pg_tables
WHERE
    schemaname = 'public'
    AND tablename = 'comprobantes_pago';

-- 8. Test de inserción (opcional - comentado)
-- IMPORTANTE: Solo descomentar si quieres hacer un test de inserción
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
    auth.uid(), -- Debe ser el user_id actual
    'pago_individual',
    'Pago Banco',
    NOW(),
    1000000.00,
    1,
    'comprobantes-pago/test.pdf',
    ARRAY['00000000-0000-0000-0000-000000000000']::TEXT[], -- Reemplazar con un UUID válido
    '{"test": true}'::JSONB
) RETURNING *;
*/

-- 9. Verificar constraint de facturas_ids
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    cc.check_clause
FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.check_constraints AS cc
        ON tc.constraint_name = cc.constraint_name
WHERE
    tc.table_schema = 'public'
    AND tc.table_name = 'comprobantes_pago';
