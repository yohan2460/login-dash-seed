-- PASO 1: Verificar si la tabla existe y tiene RLS habilitado
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_habilitado
FROM pg_tables
WHERE tablename = 'pagos_partidos';

-- PASO 2: Ver TODAS las políticas actuales
SELECT
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'pagos_partidos';

-- PASO 3: Ver tu user_id actual
SELECT auth.uid() as mi_user_id;

-- PASO 4: Ver una factura de ejemplo con su user_id
SELECT
    id,
    numero_factura,
    user_id,
    estado_mercancia
FROM facturas
WHERE estado_mercancia = 'pending'
LIMIT 1;

-- PASO 5: SOLUCIÓN TEMPORAL - DESHABILITAR RLS TEMPORALMENTE
-- ⚠️ CUIDADO: Esto es solo para debugging, NO para producción
ALTER TABLE public.pagos_partidos DISABLE ROW LEVEL SECURITY;

-- PASO 6: Después de hacer la prueba, HABILITAR RLS nuevamente
-- ALTER TABLE public.pagos_partidos ENABLE ROW LEVEL SECURITY;
