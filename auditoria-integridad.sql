-- =====================================================================
-- AUDITORÍA DE INTEGRIDAD DE DATOS — Ferrotodo / login-dash-seed
-- Proyecto Supabase: tzftaefstlhiwpfxojpk
-- Ejecutar en: Supabase Dashboard > SQL Editor (SOLO LECTURA)
-- Cada bloque es independiente. Ninguno modifica datos.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. CENSO GENERAL — ¿de qué volumen estamos hablando?
--    Importa porque el frontend trae tablas enteras al browser y
--    Supabase corta en 1000 filas por defecto SIN AVISAR.
-- ---------------------------------------------------------------------
SELECT 'facturas'           AS tabla, count(*) AS filas FROM facturas
UNION ALL SELECT 'comprobantes_pago', count(*) FROM comprobantes_pago
UNION ALL SELECT 'pagos_partidos',    count(*) FROM pagos_partidos
UNION ALL SELECT 'saldos_favor',      count(*) FROM saldos_favor
UNION ALL SELECT 'aplicaciones_saldo',count(*) FROM aplicaciones_saldo
ORDER BY filas DESC;
-- LEER ASÍ: cualquier tabla con >= 1000 filas significa que las
-- pantallas que la consultan SIN .range() están mostrando totales
-- incompletos hoy mismo.


-- ---------------------------------------------------------------------
-- 2. EL HALLAZGO GRANDE: la relación de notas de crédito vive en
--    `notas` (TEXT con JSON), no en las columnas relacionales.
--    Estas consultas miden cuánta data quedó fuera del modelo.
-- ---------------------------------------------------------------------

-- 2.a ¿Cuántas NC hay y cuántas usan el FK real?
SELECT
  count(*) FILTER (WHERE clasificacion = 'nota_credito')        AS nc_por_clasificacion,
  count(*) FILTER (WHERE es_nota_credito IS TRUE)               AS nc_por_flag_booleano,
  count(*) FILTER (WHERE factura_original_id IS NOT NULL)       AS nc_con_fk_poblado,
  count(*) FILTER (WHERE valor_nota_credito IS NOT NULL)        AS nc_con_valor_en_columna,
  count(*) FILTER (WHERE total_con_descuento IS NOT NULL)       AS filas_con_total_con_descuento
FROM facturas;
-- ESPERADO SEGÚN EL CÓDIGO: nc_por_clasificacion > 0, y las otras
-- cuatro en 0 o casi. Eso confirma que el trigger de la DB nunca
-- se dispara y que las columnas del modelo están muertas.

-- 2.b Las tres banderas de "esto es una NC" en desacuerdo entre sí
SELECT
  (clasificacion = 'nota_credito') AS por_clasificacion,
  es_nota_credito                  AS por_flag,
  estado_nota_credito,
  count(*)
FROM facturas
WHERE clasificacion = 'nota_credito'
   OR es_nota_credito IS TRUE
   OR estado_nota_credito IS NOT NULL
GROUP BY 1,2,3
ORDER BY count(*) DESC;

-- 2.c NC cuyo JSON en `notas` apunta a una factura que YA NO EXISTE
--     (huérfanas — no hay FK que lo impida)
SELECT
  f.id,
  f.numero_factura,
  f.emisor_nombre,
  f.notas::jsonb ->> 'factura_aplicada_id' AS apunta_a,
  f.notas::jsonb ->> 'valor_aplicado'      AS valor_aplicado
FROM facturas f
WHERE f.clasificacion = 'nota_credito'
  AND f.notas IS NOT NULL
  AND f.notas ~ '^\s*\{'
  AND (f.notas::jsonb ->> 'factura_aplicada_id') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM facturas o
    WHERE o.id = (f.notas::jsonb ->> 'factura_aplicada_id')::uuid
  );
-- CUALQUIER FILA AQUÍ = una NC aplicada contra una factura borrada.
-- El descuento ya se restó del total y no hay forma de reconstruirlo.

-- 2.d `notas` que NO es JSON válido (el código hace JSON.parse a ciegas)
SELECT id, numero_factura, left(notas, 120) AS notas_muestra
FROM facturas
WHERE notas IS NOT NULL
  AND notas <> ''
  AND NOT (notas ~ '^\s*[\{\[]')
LIMIT 50;
-- Estas filas rompen cualquier lectura de descuentos/NC en el frontend.


-- ---------------------------------------------------------------------
-- 3. DINERO QUE NO CUADRA
-- ---------------------------------------------------------------------

-- 3.a total_sin_iva desincronizado del trigger
SELECT id, numero_factura, total_a_pagar, factura_iva, total_sin_iva,
       total_a_pagar - COALESCE(factura_iva,0) AS deberia_ser,
       total_sin_iva - (total_a_pagar - COALESCE(factura_iva,0)) AS diferencia
FROM facturas
WHERE total_sin_iva IS DISTINCT FROM (total_a_pagar - COALESCE(factura_iva,0))
ORDER BY abs(total_sin_iva - (total_a_pagar - COALESCE(factura_iva,0))) DESC
LIMIT 50;
-- NOTA: si la columna factura_iva_5 existe, agregale
--   - COALESCE(factura_iva_5,0)  a las dos expresiones.

-- 3.b Facturas marcadas como pagadas cuyo monto_pagado no coincide
SELECT id, numero_factura, emisor_nombre, fecha_pago, metodo_pago,
       total_a_pagar, valor_real_a_pagar, monto_pagado,
       COALESCE(monto_pagado,0) - COALESCE(valor_real_a_pagar, total_a_pagar) AS diferencia
FROM facturas
WHERE fecha_pago IS NOT NULL
  AND COALESCE(monto_pagado,0)
      <> COALESCE(valor_real_a_pagar, total_a_pagar)
ORDER BY abs(COALESCE(monto_pagado,0) - COALESCE(valor_real_a_pagar, total_a_pagar)) DESC
LIMIT 50;

-- 3.c Pagos partidos que no suman el total de su factura
SELECT f.id, f.numero_factura, f.emisor_nombre,
       COALESCE(f.valor_real_a_pagar, f.total_a_pagar) AS total_factura,
       sum(p.monto)                                    AS suma_partidos,
       sum(p.monto) - COALESCE(f.valor_real_a_pagar, f.total_a_pagar) AS diferencia,
       count(p.id)                                     AS cant_pagos
FROM facturas f
JOIN pagos_partidos p ON p.factura_id = f.id
GROUP BY f.id, f.numero_factura, f.emisor_nombre, f.valor_real_a_pagar, f.total_a_pagar
HAVING sum(p.monto) <> COALESCE(f.valor_real_a_pagar, f.total_a_pagar)
ORDER BY abs(sum(p.monto) - COALESCE(f.valor_real_a_pagar, f.total_a_pagar)) DESC;

-- 3.d Valores negativos o cero donde no deberían existir
SELECT 'total_a_pagar <= 0'      AS problema, count(*) FROM facturas WHERE total_a_pagar <= 0
UNION ALL SELECT 'valor_real_a_pagar < 0', count(*) FROM facturas WHERE valor_real_a_pagar < 0
UNION ALL SELECT 'monto_pagado < 0',       count(*) FROM facturas WHERE monto_pagado < 0
UNION ALL SELECT 'total_sin_iva < 0',      count(*) FROM facturas WHERE total_sin_iva < 0
UNION ALL SELECT 'monto_retencion < 0',    count(*) FROM facturas WHERE monto_retencion < 0;


-- ---------------------------------------------------------------------
-- 4. COMPROBANTES: facturas_ids es TEXT[] sin FK. Referencias fantasma.
-- ---------------------------------------------------------------------

-- 4.a Comprobantes que apuntan a facturas inexistentes
SELECT c.id, c.tipo_comprobante, c.fecha_pago, c.total_pagado,
       c.cantidad_facturas, fid AS factura_id_fantasma
FROM comprobantes_pago c
CROSS JOIN LATERAL unnest(c.facturas_ids) AS fid
WHERE NOT EXISTS (SELECT 1 FROM facturas f WHERE f.id::text = fid);

-- 4.b cantidad_facturas mintiendo respecto del array real
SELECT id, tipo_comprobante, cantidad_facturas,
       array_length(facturas_ids, 1) AS largo_real, fecha_pago, total_pagado
FROM comprobantes_pago
WHERE cantidad_facturas IS DISTINCT FROM array_length(facturas_ids, 1);

-- 4.c Facturas pagadas SIN ningún comprobante asociado
SELECT f.id, f.numero_factura, f.emisor_nombre, f.fecha_pago, f.metodo_pago,
       COALESCE(f.valor_real_a_pagar, f.total_a_pagar) AS monto
FROM facturas f
WHERE f.fecha_pago IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM comprobantes_pago c WHERE f.id::text = ANY(c.facturas_ids)
  )
ORDER BY f.fecha_pago DESC
LIMIT 100;

-- 4.d Facturas con comprobante DUPLICADO (individual + múltiple a la vez)
--     Esta es la causa raíz de los bugs de "el PDF muestra otro total".
SELECT f.id, f.numero_factura, f.emisor_nombre,
       count(c.id) AS cant_comprobantes,
       array_agg(c.tipo_comprobante) AS tipos,
       array_agg(c.total_pagado)     AS totales,
       array_agg(c.fecha_pago::date) AS fechas
FROM facturas f
JOIN comprobantes_pago c ON f.id::text = ANY(c.facturas_ids)
GROUP BY f.id, f.numero_factura, f.emisor_nombre
HAVING count(c.id) > 1
ORDER BY count(c.id) DESC
LIMIT 100;

-- 4.e Comprobantes múltiples cuyo total no suma sus facturas
SELECT c.id, c.fecha_pago, c.total_pagado,
       sum(COALESCE(f.valor_real_a_pagar, f.total_a_pagar)) AS suma_facturas,
       c.total_pagado - sum(COALESCE(f.valor_real_a_pagar, f.total_a_pagar)) AS diferencia
FROM comprobantes_pago c
JOIN facturas f ON f.id::text = ANY(c.facturas_ids)
WHERE c.tipo_comprobante = 'pago_multiple'
GROUP BY c.id, c.fecha_pago, c.total_pagado
HAVING c.total_pagado <> sum(COALESCE(f.valor_real_a_pagar, f.total_a_pagar))
ORDER BY abs(c.total_pagado - sum(COALESCE(f.valor_real_a_pagar, f.total_a_pagar))) DESC
LIMIT 50;


-- ---------------------------------------------------------------------
-- 5. SALDOS A FAVOR
-- ---------------------------------------------------------------------

-- 5.a saldo_disponible que no cuadra con lo aplicado
SELECT s.id, s.monto_inicial, s.saldo_disponible, s.estado,
       COALESCE(sum(a.monto_aplicado), 0) AS total_aplicado,
       s.monto_inicial - COALESCE(sum(a.monto_aplicado),0) AS deberia_quedar,
       s.saldo_disponible - (s.monto_inicial - COALESCE(sum(a.monto_aplicado),0)) AS diferencia
FROM saldos_favor s
LEFT JOIN aplicaciones_saldo a ON a.saldo_favor_id = s.id
GROUP BY s.id, s.monto_inicial, s.saldo_disponible, s.estado
HAVING s.saldo_disponible <> s.monto_inicial - COALESCE(sum(a.monto_aplicado),0)
ORDER BY abs(s.saldo_disponible - (s.monto_inicial - COALESCE(sum(a.monto_aplicado),0))) DESC;

-- 5.b Estado incoherente con el saldo real
SELECT id, monto_inicial, saldo_disponible, estado
FROM saldos_favor
WHERE (saldo_disponible = 0 AND estado <> 'agotado')
   OR (saldo_disponible > 0 AND estado = 'agotado');


-- ---------------------------------------------------------------------
-- 6. DUPLICADOS Y CLAVES AUSENTES
--    `facturas` NO tiene UNIQUE sobre (numero_factura, emisor_nit).
-- ---------------------------------------------------------------------
SELECT emisor_nit, emisor_nombre, numero_factura,
       count(*) AS veces, array_agg(id) AS ids,
       array_agg(total_a_pagar) AS totales,
       array_agg(created_at::date) AS fechas_carga
FROM facturas
GROUP BY emisor_nit, emisor_nombre, numero_factura
HAVING count(*) > 1
ORDER BY count(*) DESC
LIMIT 100;
-- Cada fila = la misma factura cargada dos veces. Se paga dos veces
-- o infla los totales del dashboard.

-- 6.b Mismo NIT con nombres de emisor distintos (rompe agrupación por proveedor)
SELECT emisor_nit,
       count(DISTINCT emisor_nombre) AS variantes,
       array_agg(DISTINCT emisor_nombre) AS nombres
FROM facturas
GROUP BY emisor_nit
HAVING count(DISTINCT emisor_nombre) > 1
ORDER BY count(DISTINCT emisor_nombre) DESC;

-- 6.c Facturas huérfanas de usuario (user_id sin FK a auth.users)
SELECT count(*) AS facturas_con_usuario_inexistente
FROM facturas f
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = f.user_id);


-- ---------------------------------------------------------------------
-- 7. ESTADOS CONTRADICTORIOS
-- ---------------------------------------------------------------------
SELECT 'pagada sin metodo_pago'          AS inconsistencia, count(*)
  FROM facturas WHERE fecha_pago IS NOT NULL AND metodo_pago IS NULL
UNION ALL
SELECT 'metodo_pago sin fecha_pago',     count(*)
  FROM facturas WHERE metodo_pago IS NOT NULL AND fecha_pago IS NULL
UNION ALL
SELECT 'sin clasificar',                 count(*)
  FROM facturas WHERE clasificacion IS NULL
UNION ALL
SELECT 'pronto pago sin porcentaje',     count(*)
  FROM facturas WHERE uso_pronto_pago IS TRUE AND COALESCE(porcentaje_pronto_pago,0) = 0
UNION ALL
SELECT 'retencion sin monto',            count(*)
  FROM facturas WHERE tiene_retencion IS TRUE AND COALESCE(monto_retencion,0) = 0
UNION ALL
SELECT 'vence antes de emitirse',        count(*)
  FROM facturas WHERE fecha_vencimiento < fecha_emision
UNION ALL
SELECT 'pagada antes de emitirse',       count(*)
  FROM facturas WHERE fecha_pago::date < fecha_emision;


-- ---------------------------------------------------------------------
-- 8. TIPOS DE COLUMNA DE DINERO — precisión inconsistente
--    Mezclar NUMERIC sin precisión con DECIMAL(12,2) y (15,2)
--    produce divergencias de redondeo entre pantallas.
-- ---------------------------------------------------------------------
SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'facturas'
  AND (data_type IN ('numeric','double precision','real')
       OR column_name ~ 'total|valor|monto|iva|descuent|porcentaje|retencion')
ORDER BY numeric_scale NULLS FIRST, column_name;
-- Prestá atención a las que tengan numeric_scale NULL: son NUMERIC
-- sin límite y aceptan infinitos decimales.


-- ---------------------------------------------------------------------
-- 9. RLS — qué políticas están realmente activas hoy
-- ---------------------------------------------------------------------
SELECT tablename, rowsecurity AS rls_activo
FROM pg_tables WHERE schemaname = 'public'
ORDER BY tablename;

SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, cmd;


-- ---------------------------------------------------------------------
-- 10. ÍNDICES QUE NADIE USA (y consultas que los necesitan)
-- ---------------------------------------------------------------------
SELECT relname AS tabla, indexrelname AS indice,
       idx_scan AS veces_usado, pg_size_pretty(pg_relation_size(indexrelid)) AS tamano
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;
