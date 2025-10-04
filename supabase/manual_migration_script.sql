-- ============================================================================
-- SCRIPT DE MIGRACIÓN MANUAL DE PAGOS A pagos_partidos
-- ============================================================================
-- Este script migra todos los pagos existentes desde la tabla facturas
-- hacia la tabla pagos_partidos para unificar el modelo de datos
--
-- IMPORTANTE: Este script es idempotente - puede ejecutarse múltiples veces
-- sin crear duplicados gracias a la validación NOT EXISTS
-- ============================================================================

-- PASO 1: Verificar el estado actual ANTES de la migración
SELECT
  '=== ESTADO ANTES DE LA MIGRACIÓN ===' AS info;

SELECT
  'Facturas pagadas (estado_mercancia = pagada)' AS descripcion,
  COUNT(*) AS cantidad
FROM facturas
WHERE estado_mercancia = 'pagada';

SELECT
  'Facturas con pago normal (NO Pago Partido)' AS descripcion,
  COUNT(*) AS cantidad
FROM facturas
WHERE estado_mercancia = 'pagada'
  AND metodo_pago IS NOT NULL
  AND metodo_pago != 'Pago Partido';

SELECT
  'Facturas con Pago Partido' AS descripcion,
  COUNT(*) AS cantidad
FROM facturas
WHERE estado_mercancia = 'pagada'
  AND metodo_pago = 'Pago Partido';

SELECT
  'Registros actuales en pagos_partidos' AS descripcion,
  COUNT(*) AS cantidad
FROM pagos_partidos;

SELECT
  'Facturas que YA tienen registro en pagos_partidos' AS descripcion,
  COUNT(DISTINCT factura_id) AS cantidad
FROM pagos_partidos;

-- PASO 2: Ver qué facturas se van a migrar (PREVIEW)
SELECT
  '=== FACTURAS QUE SERÁN MIGRADAS ===' AS info;

SELECT
  f.numero_factura,
  f.emisor_nombre,
  f.metodo_pago,
  COALESCE(f.valor_real_a_pagar, f.monto_pagado, f.total_a_pagar) AS monto_a_migrar,
  COALESCE(f.fecha_pago, f.created_at) AS fecha_pago_migrada
FROM facturas f
WHERE
  f.estado_mercancia = 'pagada'
  AND f.metodo_pago IS NOT NULL
  AND f.metodo_pago != 'Pago Partido'
  AND NOT EXISTS (
    SELECT 1 FROM pagos_partidos pp WHERE pp.factura_id = f.id
  )
ORDER BY f.numero_factura;

-- PASO 3: EJECUTAR LA MIGRACIÓN
SELECT
  '=== INICIANDO MIGRACIÓN ===' AS info;

INSERT INTO pagos_partidos (factura_id, metodo_pago, monto, fecha_pago)
SELECT
  f.id AS factura_id,
  f.metodo_pago,
  COALESCE(f.valor_real_a_pagar, f.monto_pagado, f.total_a_pagar) AS monto,
  COALESCE(f.fecha_pago, f.created_at) AS fecha_pago
FROM facturas f
WHERE
  f.estado_mercancia = 'pagada'
  AND f.metodo_pago IS NOT NULL
  AND f.metodo_pago != 'Pago Partido'
  AND NOT EXISTS (
    SELECT 1 FROM pagos_partidos pp WHERE pp.factura_id = f.id
  );

-- PASO 4: Verificar el estado DESPUÉS de la migración
SELECT
  '=== ESTADO DESPUÉS DE LA MIGRACIÓN ===' AS info;

SELECT
  'Total de registros en pagos_partidos' AS descripcion,
  COUNT(*) AS cantidad
FROM pagos_partidos;

SELECT
  'Facturas con registro en pagos_partidos' AS descripcion,
  COUNT(DISTINCT factura_id) AS cantidad
FROM pagos_partidos;

SELECT
  'Facturas pagadas SIN registro en pagos_partidos (deberían ser 0)' AS descripcion,
  COUNT(*) AS cantidad
FROM facturas f
WHERE f.estado_mercancia = 'pagada'
  AND NOT EXISTS (
    SELECT 1 FROM pagos_partidos pp WHERE pp.factura_id = f.id
  );

-- PASO 5: Desglose por método de pago
SELECT
  '=== DESGLOSE POR MÉTODO DE PAGO ===' AS info;

SELECT
  pp.metodo_pago,
  COUNT(*) AS cantidad_facturas,
  SUM(pp.monto) AS total_monto,
  AVG(pp.monto) AS promedio_monto
FROM pagos_partidos pp
GROUP BY pp.metodo_pago
ORDER BY cantidad_facturas DESC;

-- PASO 6: Verificar integridad - Facturas con pagos partidos
SELECT
  '=== FACTURAS CON MÚLTIPLES MÉTODOS DE PAGO ===' AS info;

SELECT
  f.numero_factura,
  f.emisor_nombre,
  COUNT(pp.id) AS cantidad_metodos,
  STRING_AGG(pp.metodo_pago || ': ' || pp.monto::TEXT, ', ') AS detalle_pagos,
  SUM(pp.monto) AS total_pagado
FROM facturas f
INNER JOIN pagos_partidos pp ON pp.factura_id = f.id
GROUP BY f.id, f.numero_factura, f.emisor_nombre
HAVING COUNT(pp.id) > 1
ORDER BY cantidad_metodos DESC;

-- PASO 7: Resumen final
SELECT
  '=== RESUMEN FINAL ===' AS info;

WITH stats AS (
  SELECT
    COUNT(DISTINCT CASE WHEN f.metodo_pago != 'Pago Partido' THEN pp.factura_id END) AS pagos_normales,
    COUNT(DISTINCT CASE WHEN f.metodo_pago = 'Pago Partido' THEN pp.factura_id END) AS pagos_partidos,
    COUNT(DISTINCT pp.factura_id) AS total_facturas_con_pago,
    COUNT(*) AS total_registros_pagos,
    SUM(pp.monto) AS monto_total
  FROM pagos_partidos pp
  INNER JOIN facturas f ON f.id = pp.factura_id
)
SELECT
  pagos_normales AS "Facturas con pago normal",
  pagos_partidos AS "Facturas con pago partido",
  total_facturas_con_pago AS "Total facturas con pago",
  total_registros_pagos AS "Total registros en pagos_partidos",
  monto_total AS "Monto total de todos los pagos"
FROM stats;

SELECT '=== MIGRACIÓN COMPLETADA EXITOSAMENTE ===' AS info;
