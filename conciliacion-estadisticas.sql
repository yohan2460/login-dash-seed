-- =====================================================================
-- CONCILIACIÓN DE LAS TARJETAS DE ESTADÍSTICAS
-- Proyecto Supabase: tzftaefstlhiwpfxojpk
-- Ejecutar en: Supabase Dashboard > SQL Editor (SOLO LECTURA)
--
-- Cada bloque mide UNA discrepancia concreta encontrada en el código.
-- El objetivo es poner número a cada una con tus datos reales.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA DIFERENCIA DE $4.567.134
--
-- En Mercancía Pagada, "Total General" sale de facturas.valor_real_a_pagar
-- y "Pagado por Bancos/Tobías/Caja" sale de pagos_partidos.
--
-- Al aplicar un saldo a favor, PaymentMethodDialog hace DOS cosas:
--   a) resta el saldo de valor_real_a_pagar   (línea 1269/1319)
--   b) inserta una fila en pagos_partidos por ese mismo monto (línea 1385)
--
-- Resultado: los métodos suman de más exactamente los saldos aplicados.
-- Si el número de abajo se parece a tu diferencia, esta es la causa.
-- ---------------------------------------------------------------------
SELECT
  count(DISTINCT a.factura_destino_id) AS facturas_con_saldo_aplicado,
  sum(a.monto_aplicado)                AS total_saldos_aplicados,
  'Este monto está contado en los métodos de pago pero descontado del Total General' AS lectura
FROM aplicaciones_saldo a
JOIN facturas f ON f.id = a.factura_destino_id
WHERE f.clasificacion = 'mercancia'
  AND f.estado_mercancia = 'pagada';

-- 1.b Desglosado por el método al que se imputó el saldo.
--     Ojo: un saldo a favor NO es plata que pasó por el banco. Cuando
--     `medio_pago` del saldo es 'Pago Banco' (o cae al default 'Pago Banco'),
--     esa tarjeta reporta como bancario un crédito del proveedor.
SELECT
  p.metodo_pago,
  count(*)     AS cantidad,
  sum(p.monto) AS monto_imputado
FROM aplicaciones_saldo a
JOIN pagos_partidos p
  ON p.factura_id = a.factura_destino_id
 AND p.monto = a.monto_aplicado
 AND p.fecha_pago::date = a.fecha_aplicacion::date
GROUP BY p.metodo_pago
ORDER BY sum(p.monto) DESC;


-- ---------------------------------------------------------------------
-- 2. EL FALLBACK QUE EXISTE EN UNA PANTALLA Y NO EN OTRA
--
-- Hay CUATRO implementaciones de calcularMontoPorMetodo:
--   MercanciaPagada  -> con fallback: valor_real_a_pagar ?? monto_pagado ?? total_a_pagar
--   Informes         -> con fallback: valor_real_a_pagar || monto_pagado
--   GastosPagados    -> SIN fallback: la factura aporta 0
--   ModernDashboard  -> SIN fallback: la factura aporta 0
--
-- El fallback solo se activa para facturas pagadas SIN filas en
-- pagos_partidos. Esta consulta mide cuánta plata depende de eso.
-- ---------------------------------------------------------------------
SELECT
  f.clasificacion,
  count(*) AS facturas_pagadas_sin_pagos_partidos,
  sum(COALESCE(f.valor_real_a_pagar, f.monto_pagado, f.total_a_pagar, 0)) AS monto_en_juego,
  'Este monto aparece en MercanciaPagada e Informes, y NO en GastosPagados ni ModernDashboard' AS lectura
FROM facturas f
WHERE f.estado_mercancia = 'pagada'
  AND NOT EXISTS (SELECT 1 FROM pagos_partidos p WHERE p.factura_id = f.id)
GROUP BY f.clasificacion
ORDER BY monto_en_juego DESC NULLS LAST;


-- ---------------------------------------------------------------------
-- 3. pagos_partidos QUE NO SUMAN LO QUE DICE LA FACTURA
--
-- Si estas dos cifras no coinciden, "Total General" y "Pagado por X"
-- nunca van a cuadrar, haya saldos a favor o no.
-- ---------------------------------------------------------------------
SELECT
  f.id,
  f.numero_factura,
  f.emisor_nombre,
  f.clasificacion,
  COALESCE(f.valor_real_a_pagar, f.total_a_pagar) AS segun_factura,
  sum(p.monto)                                    AS segun_pagos_partidos,
  sum(p.monto) - COALESCE(f.valor_real_a_pagar, f.total_a_pagar) AS diferencia,
  count(p.id)                                     AS cant_pagos
FROM facturas f
JOIN pagos_partidos p ON p.factura_id = f.id
WHERE f.estado_mercancia = 'pagada'
GROUP BY f.id, f.numero_factura, f.emisor_nombre, f.clasificacion,
         f.valor_real_a_pagar, f.total_a_pagar
HAVING abs(sum(p.monto) - COALESCE(f.valor_real_a_pagar, f.total_a_pagar)) > 1
ORDER BY abs(sum(p.monto) - COALESCE(f.valor_real_a_pagar, f.total_a_pagar)) DESC
LIMIT 100;

-- 3.b El total agregado de esa desviación, que es lo que descuadra las tarjetas.
SELECT
  count(*)                         AS facturas_descuadradas,
  sum(diferencia)                  AS desviacion_neta,
  sum(abs(diferencia))             AS desviacion_absoluta
FROM (
  SELECT sum(p.monto) - COALESCE(f.valor_real_a_pagar, f.total_a_pagar) AS diferencia
  FROM facturas f
  JOIN pagos_partidos p ON p.factura_id = f.id
  WHERE f.estado_mercancia = 'pagada'
  GROUP BY f.id, f.valor_real_a_pagar, f.total_a_pagar
  HAVING abs(sum(p.monto) - COALESCE(f.valor_real_a_pagar, f.total_a_pagar)) > 1
) d;


-- ---------------------------------------------------------------------
-- 4. EL REPARTO POR CANTIDAD EN LUGAR DE POR PESO
--
-- MultiplePaymentDialog reparte cada método haciendo `mp.monto / facturas.length`:
-- divide por la CANTIDAD de facturas, no por el peso de cada una. En un pago
-- múltiple con facturas de montos distintos, los pagos_partidos quedan
-- proporcionalmente mal aunque el total del grupo cierre.
--
-- Señal: varias facturas del mismo día, mismo método, con montos idénticos
-- pero valor_real_a_pagar distinto entre sí.
-- ---------------------------------------------------------------------
SELECT
  p.fecha_pago::date          AS dia,
  p.metodo_pago,
  p.monto                     AS monto_repetido,
  count(*)                    AS facturas_con_ese_monto,
  array_agg(f.numero_factura ORDER BY f.numero_factura) AS facturas,
  array_agg(COALESCE(f.valor_real_a_pagar, f.total_a_pagar) ORDER BY f.numero_factura) AS valores_reales
FROM pagos_partidos p
JOIN facturas f ON f.id = p.factura_id
GROUP BY p.fecha_pago::date, p.metodo_pago, p.monto
HAVING count(*) > 1
   AND count(DISTINCT COALESCE(f.valor_real_a_pagar, f.total_a_pagar)) > 1
ORDER BY count(*) DESC, p.monto DESC
LIMIT 50;


-- ---------------------------------------------------------------------
-- 5. "AHORRO PRONTO PAGO": POTENCIAL vs APLICADO
--
-- La tarjeta suma el descuento de TODA factura con porcentaje_pronto_pago > 0,
-- sin mirar uso_pronto_pago. Pero calcularValorRealAPagar solo lo descuenta
-- cuando uso_pronto_pago es true. Las dos tarjetas están una al lado de la
-- otra y no concilian entre sí.
-- ---------------------------------------------------------------------
SELECT
  f.clasificacion,
  f.uso_pronto_pago,
  count(*) AS facturas,
  sum(
    COALESCE(f.total_sin_iva, f.total_a_pagar - COALESCE(f.factura_iva,0) - COALESCE(f.factura_iva_5,0))
    * (f.porcentaje_pronto_pago / 100.0)
  ) AS descuento_pronto_pago
FROM facturas f
WHERE COALESCE(f.porcentaje_pronto_pago, 0) > 0
GROUP BY f.clasificacion, f.uso_pronto_pago
ORDER BY f.clasificacion, f.uso_pronto_pago NULLS FIRST;
-- LEER ASÍ: la fila con uso_pronto_pago = false/null es el monto que la
-- tarjeta "Ahorro Pronto Pago" está mostrando pero que NO se descuenta del
-- "Valor Real a Pagar".


-- ---------------------------------------------------------------------
-- 6. "TOTAL RETENCIONES": FACTURAS CON MONTO PERO SIN LA BANDERA
--
-- calcularMontoRetencionReal ahora exige tiene_retencion. Si hay facturas con
-- monto_retencion cargado y tiene_retencion en false, ese monto dejó de
-- sumarse (correcto), pero conviene saber cuánto es y si esas filas son datos
-- residuales o una bandera mal seteada.
-- ---------------------------------------------------------------------
SELECT
  f.tiene_retencion,
  count(*) AS facturas,
  sum(
    (f.total_a_pagar - COALESCE(f.factura_iva,0) - COALESCE(f.factura_iva_5,0))
    * (f.monto_retencion / 100.0)
  ) AS retencion_calculada
FROM facturas f
WHERE COALESCE(f.monto_retencion, 0) > 0
GROUP BY f.tiene_retencion
ORDER BY f.tiene_retencion NULLS FIRST;


-- ---------------------------------------------------------------------
-- 7. CONTROL GENERAL: lo que deberían decir las tarjetas de Mercancía Pagada
--
-- Corré esto y compará contra la pantalla. Si no coinciden, la diferencia
-- está explicada por los bloques 1 a 4.
-- ---------------------------------------------------------------------
WITH pagadas AS (
  SELECT * FROM facturas
  WHERE clasificacion = 'mercancia' AND estado_mercancia = 'pagada'
)
SELECT
  (SELECT count(*) FROM pagadas)                                            AS total_facturas,
  (SELECT sum(COALESCE(valor_real_a_pagar, total_a_pagar)) FROM pagadas)    AS total_general,
  (SELECT sum(p.monto) FROM pagos_partidos p
     JOIN pagadas f ON f.id = p.factura_id
    WHERE p.metodo_pago = 'Pago Banco')                                     AS pagado_bancos,
  (SELECT sum(p.monto) FROM pagos_partidos p
     JOIN pagadas f ON f.id = p.factura_id
    WHERE p.metodo_pago = 'Pago Tobías')                                    AS pagado_tobias,
  (SELECT sum(p.monto) FROM pagos_partidos p
     JOIN pagadas f ON f.id = p.factura_id
    WHERE p.metodo_pago = 'Caja')                                           AS pagado_caja,
  (SELECT sum(p.monto) FROM pagos_partidos p
     JOIN pagadas f ON f.id = p.factura_id)                                 AS suma_metodos,
  (SELECT sum(p.monto) FROM pagos_partidos p JOIN pagadas f ON f.id = p.factura_id)
    - (SELECT sum(COALESCE(valor_real_a_pagar, total_a_pagar)) FROM pagadas) AS descuadre;
