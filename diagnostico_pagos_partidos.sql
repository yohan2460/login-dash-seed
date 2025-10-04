-- Script de diagnóstico para verificar la tabla pagos_partidos y políticas RLS
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar si la tabla existe
SELECT
    table_name,
    table_type
FROM
    information_schema.tables
WHERE
    table_schema = 'public'
    AND table_name = 'pagos_partidos';

-- 2. Ver la estructura de la tabla
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM
    information_schema.columns
WHERE
    table_schema = 'public'
    AND table_name = 'pagos_partidos'
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
    AND tablename = 'pagos_partidos';

-- 4. Verificar si RLS está habilitado
SELECT
    tablename,
    rowsecurity
FROM
    pg_tables
WHERE
    schemaname = 'public'
    AND tablename = 'pagos_partidos';

-- 5. Verificar facturas con y sin user_id
SELECT
    COUNT(*) as total_facturas,
    COUNT(user_id) as con_user_id,
    COUNT(*) - COUNT(user_id) as sin_user_id
FROM
    facturas;

-- 6. Ver ejemplo de facturas sin user_id
SELECT
    id,
    numero_factura,
    emisor_nombre,
    user_id,
    created_at
FROM
    facturas
WHERE
    user_id IS NULL
LIMIT 5;

-- 7. Verificar el user_id actual
SELECT auth.uid() as mi_user_id;

-- 8. Test de inserción (comentado)
-- IMPORTANTE: Solo descomentar para hacer test
/*
-- Primero, obtén un ID de factura válido:
SELECT id, numero_factura, user_id FROM facturas WHERE user_id = auth.uid() LIMIT 1;

-- Luego, reemplaza el UUID abajo con el id de la factura
INSERT INTO pagos_partidos (
    factura_id,
    metodo_pago,
    monto,
    fecha_pago
) VALUES (
    '00000000-0000-0000-0000-000000000000', -- REEMPLAZAR con el id de la factura
    'Pago Banco',
    1000000.00,
    NOW()
) RETURNING *;
*/

-- 9. Ver registros existentes en pagos_partidos
SELECT
    pp.id,
    pp.factura_id,
    f.numero_factura,
    f.user_id as factura_user_id,
    pp.metodo_pago,
    pp.monto,
    pp.fecha_pago,
    pp.created_at
FROM
    pagos_partidos pp
    LEFT JOIN facturas f ON f.id = pp.factura_id
ORDER BY
    pp.created_at DESC
LIMIT 10;

-- 10. SOLUCIÓN: Si las facturas no tienen user_id, actualízalas
-- IMPORTANTE: Solo ejecutar si el diagnóstico muestra facturas sin user_id
/*
UPDATE facturas
SET user_id = auth.uid()
WHERE user_id IS NULL;
*/
