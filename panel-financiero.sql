-- =====================================================================
-- PANEL FINANCIERO — Ferrotodo
-- Ejecutar en: Supabase Dashboard > SQL Editor (SOLO LECTURA)
--
-- Este script NO lee las tarjetas de la app. Recalcula todo desde cero con
-- las fórmulas corregidas, porque las pantallas tienen tres problemas que
-- distorsionan lo que muestran:
--
--   1. "Total Impuestos" omite el IVA del 5% en las 6 pantallas.
--   2. Los saldos a favor se cuentan como pagos por banco.
--   3. calcularMontoPorMetodo tiene 4 implementaciones distintas.
--
-- Empezá por el BLOQUE 0: devuelve una fila por métrica. Pasame ese
-- resultado y con eso puedo analizarte la situación. Los demás bloques son
-- el detalle para profundizar donde haga falta.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOQUE 0 — PANEL GENERAL  ← EMPEZÁ POR ACÁ
--
-- La base del cálculo, para que puedas auditarla:
--   base_sin_iva = total_sin_iva, o total_a_pagar menos AMBOS IVAs
--   retencion    = base_sin_iva × monto_retencion%   (solo si tiene_retencion)
--   pronto_pago  = base_sin_iva × porcentaje%        (solo si uso_pronto_pago)
--   descuentos   = los de descuentos_antes_iva, % sobre la base SIN IVA
--   valor_real   = total_a_pagar − descuentos − retencion − pronto_pago
-- ---------------------------------------------------------------------
WITH base AS (
  SELECT
    f.*,
    COALESCE(
      f.total_sin_iva,
      f.total_a_pagar - COALESCE(f.factura_iva, 0) - COALESCE(f.factura_iva_5, 0)
    ) AS base_sin_iva,
    COALESCE(f.factura_iva, 0) + COALESCE(f.factura_iva_5, 0) AS iva_total
  FROM facturas f
  WHERE f.clasificacion IS DISTINCT FROM 'nota_credito'
),
calc AS (
  SELECT
    b.*,
    CASE WHEN b.tiene_retencion IS TRUE
         THEN b.base_sin_iva * COALESCE(b.monto_retencion, 0) / 100.0
         ELSE 0 END AS retencion_calc,
    CASE WHEN b.uso_pronto_pago IS TRUE
         THEN b.base_sin_iva * COALESCE(b.porcentaje_pronto_pago, 0) / 100.0
         ELSE 0 END AS pronto_pago_usado,
    CASE WHEN COALESCE(b.porcentaje_pronto_pago, 0) > 0 AND b.uso_pronto_pago IS NOT TRUE
         THEN b.base_sin_iva * COALESCE(b.porcentaje_pronto_pago, 0) / 100.0
         ELSE 0 END AS pronto_pago_no_usado,
    COALESCE((
      SELECT sum(
        CASE WHEN d->>'tipo' = 'porcentaje'
             THEN b.base_sin_iva * NULLIF(d->>'valor', '')::numeric / 100.0
             ELSE NULLIF(d->>'valor', '')::numeric
        END)
      FROM jsonb_array_elements(
             CASE WHEN b.descuentos_antes_iva ~ '^\s*\[' THEN b.descuentos_antes_iva::jsonb ELSE '[]'::jsonb END
           ) d
    ), 0) AS descuentos_calc
  FROM base b
),
final AS (
  SELECT
    c.*,
    GREATEST(c.total_a_pagar - c.descuentos_calc - c.retencion_calc - c.pronto_pago_usado, 0) AS valor_real_calc,
    -- El COALESCE no es decorativo: la mayoría de las facturas pendientes
    -- tienen estado_mercancia en NULL, y `NULL = 'pagada'` da NULL (no FALSE).
    -- Sin esto, `NOT esta_pagada` da NULL y los FILTER descartan la fila:
    -- el panel reportaba CERO facturas pendientes teniendo cuatro.
    (COALESCE(c.estado_mercancia = 'pagada', FALSE) OR c.fecha_pago IS NOT NULL) AS esta_pagada
  FROM calc c
)
SELECT metrica, valor, nota FROM (
            SELECT  0 AS ord, '── POSICIÓN ──'::text AS metrica, NULL::numeric AS valor, NULL::text AS nota
  UNION ALL SELECT  1, 'Facturas totales', count(*)::numeric, NULL FROM final
  UNION ALL SELECT  2, 'Facturas pendientes', count(*) FILTER (WHERE NOT esta_pagada)::numeric, NULL FROM final
  UNION ALL SELECT  3, 'POR PAGAR (valor real)', round(sum(valor_real_calc) FILTER (WHERE NOT esta_pagada)), 'lo que realmente debés hoy' FROM final
  UNION ALL SELECT  4, 'Por pagar (bruto, con IVA)', round(sum(total_a_pagar) FILTER (WHERE NOT esta_pagada)), 'antes de descuentos y retención' FROM final
  UNION ALL SELECT  5, 'IVA contenido en lo pendiente', round(sum(iva_total) FILTER (WHERE NOT esta_pagada)), 'incluye IVA 19% Y 5%' FROM final

  UNION ALL SELECT 10, '── VENCIMIENTOS ──', NULL, NULL
  UNION ALL SELECT 11, 'VENCIDO', round(sum(valor_real_calc) FILTER (WHERE NOT esta_pagada AND fecha_vencimiento < CURRENT_DATE)), 'ya pasó la fecha' FROM final
  UNION ALL SELECT 12, 'Facturas vencidas', count(*) FILTER (WHERE NOT esta_pagada AND fecha_vencimiento < CURRENT_DATE)::numeric, NULL FROM final
  UNION ALL SELECT 13, 'Vence en 7 días', round(sum(valor_real_calc) FILTER (WHERE NOT esta_pagada AND fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)), NULL FROM final
  UNION ALL SELECT 14, 'Vence en 30 días', round(sum(valor_real_calc) FILTER (WHERE NOT esta_pagada AND fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)), NULL FROM final
  UNION ALL SELECT 15, 'Pendiente SIN fecha de vencimiento', round(sum(valor_real_calc) FILTER (WHERE NOT esta_pagada AND fecha_vencimiento IS NULL)), 'no entra en ninguna proyección' FROM final

  UNION ALL SELECT 20, '── PRONTO PAGO ──', NULL, NULL
  UNION ALL SELECT 21, 'Ahorro capturado', round(sum(pronto_pago_usado)), 'uso_pronto_pago = true' FROM final
  UNION ALL SELECT 22, 'AHORRO PERDIDO (ya pagadas)', round(sum(pronto_pago_no_usado) FILTER (WHERE esta_pagada)), 'plata que se dejó en la mesa' FROM final
  UNION ALL SELECT 23, 'Ahorro disponible (pendientes)', round(sum(pronto_pago_no_usado) FILTER (WHERE NOT esta_pagada)), 'todavía se puede capturar' FROM final

  UNION ALL SELECT 30, '── RETENCIONES ──', NULL, NULL
  UNION ALL SELECT 31, 'Retención sobre lo pendiente', round(sum(retencion_calc) FILTER (WHERE NOT esta_pagada)), NULL FROM final
  UNION ALL SELECT 32, 'Retención sobre lo pagado', round(sum(retencion_calc) FILTER (WHERE esta_pagada)), NULL FROM final

  UNION ALL SELECT 40, '── CAJA REAL (movimientos) ──', NULL, NULL
  UNION ALL SELECT 41, 'Pagos registrados', round(COALESCE((SELECT sum(monto) FROM pagos_partidos), 0)), 'suma cruda de pagos_partidos'
  UNION ALL SELECT 42, 'De eso: SALDOS A FAVOR', round(COALESCE((SELECT sum(monto_aplicado) FROM aplicaciones_saldo), 0)), 'NO salió plata: es crédito del proveedor'
  UNION ALL SELECT 43, 'CAJA REAL DESEMBOLSADA',
                   round(COALESCE((SELECT sum(monto) FROM pagos_partidos), 0)
                       - COALESCE((SELECT sum(monto_aplicado) FROM aplicaciones_saldo), 0)), 'plata que sí se movió'

  UNION ALL SELECT 50, '── SALDOS A FAVOR ──', NULL, NULL
  UNION ALL SELECT 51, 'Saldo disponible sin usar', round(COALESCE((SELECT sum(saldo_disponible) FROM saldos_favor WHERE estado = 'activo'), 0)), 'crédito que ya tenés'
  UNION ALL SELECT 52, 'Saldos activos', (SELECT count(*) FROM saldos_favor WHERE estado = 'activo')::numeric, NULL

  UNION ALL SELECT 60, '── NOTAS DE CRÉDITO ──', NULL, NULL
  UNION ALL SELECT 61, 'Notas de crédito', (SELECT count(*) FROM facturas WHERE clasificacion = 'nota_credito')::numeric, NULL
  UNION ALL SELECT 62, 'Monto en notas de crédito', round(COALESCE((SELECT sum(total_a_pagar) FROM facturas WHERE clasificacion = 'nota_credito'), 0)), NULL
) t
ORDER BY ord;


-- ---------------------------------------------------------------------
-- BLOQUE 1 — AGING: hace cuánto está vencido lo que debés
-- ---------------------------------------------------------------------
SELECT
  CASE
    WHEN f.fecha_vencimiento IS NULL                        THEN '0. Sin fecha'
    WHEN f.fecha_vencimiento >= CURRENT_DATE                THEN '1. Al día'
    WHEN f.fecha_vencimiento >= CURRENT_DATE - 30           THEN '2. Vencido 1-30 días'
    WHEN f.fecha_vencimiento >= CURRENT_DATE - 60           THEN '3. Vencido 31-60 días'
    WHEN f.fecha_vencimiento >= CURRENT_DATE - 90           THEN '4. Vencido 61-90 días'
    ELSE                                                         '5. Vencido +90 días'
  END AS tramo,
  count(*)                                    AS facturas,
  round(sum(COALESCE(f.valor_real_a_pagar, f.total_a_pagar))) AS monto,
  round(avg(CURRENT_DATE - f.fecha_vencimiento)) AS dias_promedio_vencido
FROM facturas f
WHERE f.clasificacion IS DISTINCT FROM 'nota_credito'
  AND f.estado_mercancia IS DISTINCT FROM 'pagada'
  AND f.fecha_pago IS NULL
GROUP BY 1
ORDER BY 1;


-- ---------------------------------------------------------------------
-- BLOQUE 2 — CONCENTRACIÓN DE PROVEEDORES
-- A quién le debés más, y qué tan expuesto estás a un solo proveedor.
-- ---------------------------------------------------------------------
WITH pend AS (
  SELECT
    emisor_nit,
    max(emisor_nombre) AS proveedor,
    count(*) AS facturas,
    sum(COALESCE(valor_real_a_pagar, total_a_pagar)) AS monto,
    min(fecha_vencimiento) AS vence_primero,
    count(*) FILTER (WHERE fecha_vencimiento < CURRENT_DATE) AS vencidas
  FROM facturas
  WHERE clasificacion IS DISTINCT FROM 'nota_credito'
    AND estado_mercancia IS DISTINCT FROM 'pagada'
    AND fecha_pago IS NULL
  GROUP BY emisor_nit
)
SELECT
  proveedor,
  emisor_nit,
  facturas,
  vencidas,
  round(monto) AS monto_pendiente,
  round(100.0 * monto / NULLIF(sum(monto) OVER (), 0), 1) AS pct_del_total,
  round(100.0 * sum(monto) OVER (ORDER BY monto DESC) / NULLIF(sum(monto) OVER (), 0), 1) AS pct_acumulado,
  vence_primero
FROM pend
ORDER BY monto DESC
LIMIT 25;
-- LEER ASÍ: si los primeros 3 proveedores superan el 50% acumulado, tenés
-- concentración alta y tu flujo de caja depende de pocas relaciones.


-- ---------------------------------------------------------------------
-- BLOQUE 3 — EVOLUCIÓN MENSUAL: qué entró y qué se pagó
-- ---------------------------------------------------------------------
WITH emitido AS (
  SELECT to_char(COALESCE(fecha_emision, created_at::date), 'YYYY-MM') AS mes,
         count(*) AS facturas_emitidas,
         sum(total_a_pagar) AS monto_emitido
  FROM facturas
  WHERE clasificacion IS DISTINCT FROM 'nota_credito'
  GROUP BY 1
),
pagado AS (
  SELECT to_char(fecha_pago::date, 'YYYY-MM') AS mes,
         count(*) AS facturas_pagadas,
         sum(COALESCE(valor_real_a_pagar, total_a_pagar)) AS monto_pagado
  FROM facturas
  WHERE fecha_pago IS NOT NULL
    AND clasificacion IS DISTINCT FROM 'nota_credito'
  GROUP BY 1
)
SELECT
  COALESCE(e.mes, p.mes) AS mes,
  COALESCE(e.facturas_emitidas, 0) AS emitidas,
  round(COALESCE(e.monto_emitido, 0))  AS monto_emitido,
  COALESCE(p.facturas_pagadas, 0)  AS pagadas,
  round(COALESCE(p.monto_pagado, 0))   AS monto_pagado,
  round(COALESCE(e.monto_emitido, 0) - COALESCE(p.monto_pagado, 0)) AS diferencia
FROM emitido e
FULL OUTER JOIN pagado p ON p.mes = e.mes
ORDER BY 1 DESC
LIMIT 24;
-- LEER ASÍ: si `diferencia` es consistentemente positiva, la deuda crece mes
-- a mes: estás facturando más rápido de lo que pagás.


-- ---------------------------------------------------------------------
-- BLOQUE 4 — MÉTODOS DE PAGO, SEPARANDO LO QUE NO ES CAJA
--
-- Esta es la versión corregida de las tarjetas "Pagado por X": separa los
-- saldos a favor, que la app cuenta como si hubieran pasado por el banco.
-- ---------------------------------------------------------------------
SELECT
  p.metodo_pago,
  count(*)                          AS movimientos,
  round(sum(p.monto))               AS total_registrado,
  round(sum(p.monto) FILTER (WHERE ap.id IS NOT NULL)) AS de_saldos_a_favor,
  round(sum(p.monto) FILTER (WHERE ap.id IS NULL))     AS caja_real
FROM pagos_partidos p
LEFT JOIN aplicaciones_saldo ap
  ON ap.factura_destino_id = p.factura_id
 AND ap.monto_aplicado = p.monto
 AND ap.fecha_aplicacion::date = p.fecha_pago::date
GROUP BY p.metodo_pago
ORDER BY sum(p.monto) DESC;


-- ---------------------------------------------------------------------
-- BLOQUE 5 — VELOCIDAD DE PAGO: ¿pagás a tiempo?
-- ---------------------------------------------------------------------
SELECT
  to_char(fecha_pago::date, 'YYYY-MM')                              AS mes,
  count(*)                                                          AS pagadas,
  round(avg(fecha_pago::date - fecha_emision))                      AS dias_prom_emision_a_pago,
  round(avg(fecha_pago::date - fecha_vencimiento))                  AS dias_prom_vs_vencimiento,
  count(*) FILTER (WHERE fecha_pago::date > fecha_vencimiento)      AS pagadas_tarde,
  count(*) FILTER (WHERE fecha_pago::date <= fecha_vencimiento)     AS pagadas_a_tiempo
FROM facturas
WHERE fecha_pago IS NOT NULL
  AND fecha_emision IS NOT NULL
  AND clasificacion IS DISTINCT FROM 'nota_credito'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 18;
-- `dias_prom_vs_vencimiento` negativo = pagás antes de vencer.


-- ---------------------------------------------------------------------
-- BLOQUE 6 — CALIDAD DE LOS DATOS
-- Cuánta de la plata de arriba se apoya en campos incompletos. Si estos
-- números son altos, el análisis tiene menos piso del que parece.
-- ---------------------------------------------------------------------
SELECT 'Pendientes sin fecha de vencimiento' AS problema,
       count(*) AS facturas,
       round(sum(COALESCE(valor_real_a_pagar, total_a_pagar))) AS monto
  FROM facturas WHERE estado_mercancia IS DISTINCT FROM 'pagada' AND fecha_pago IS NULL AND fecha_vencimiento IS NULL
UNION ALL
SELECT 'Sin fecha de emisión', count(*), round(sum(total_a_pagar))
  FROM facturas WHERE fecha_emision IS NULL
UNION ALL
SELECT 'Sin clasificar', count(*), round(sum(total_a_pagar))
  FROM facturas WHERE clasificacion IS NULL
UNION ALL
SELECT 'valor_real_a_pagar sin calcular', count(*), round(sum(total_a_pagar))
  FROM facturas WHERE valor_real_a_pagar IS NULL
UNION ALL
SELECT 'Pagadas sin registro en pagos_partidos', count(*), round(sum(COALESCE(valor_real_a_pagar, total_a_pagar)))
  FROM facturas f WHERE f.fecha_pago IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM pagos_partidos p WHERE p.factura_id = f.id)
UNION ALL
SELECT 'Con IVA 5% cargado', count(*), round(sum(factura_iva_5))
  FROM facturas WHERE COALESCE(factura_iva_5, 0) > 0
ORDER BY monto DESC NULLS LAST;
