-- Script para verificar el estado de pagos_partidos

-- 1. Contar total de registros en pagos_partidos
SELECT COUNT(*) as total_pagos_partidos FROM public.pagos_partidos;

-- 2. Ver todos los pagos partidos agrupados por método
SELECT
  metodo_pago,
  COUNT(*) as cantidad,
  SUM(monto) as total_monto
FROM public.pagos_partidos
GROUP BY metodo_pago
ORDER BY metodo_pago;

-- 3. Contar facturas pagadas
SELECT COUNT(*) as facturas_pagadas
FROM public.facturas
WHERE estado_mercancia = 'pagada';

-- 4. Contar facturas pagadas que NO tienen registros en pagos_partidos
SELECT COUNT(*) as facturas_sin_pagos_partidos
FROM public.facturas f
WHERE f.estado_mercancia = 'pagada'
AND NOT EXISTS (
  SELECT 1 FROM public.pagos_partidos pp WHERE pp.factura_id = f.id
);

-- 5. Ver las facturas pagadas sin registros en pagos_partidos (primeras 10)
SELECT
  f.id,
  f.numero_factura,
  f.emisor_nombre,
  f.metodo_pago,
  f.valor_real_a_pagar,
  f.fecha_pago
FROM public.facturas f
WHERE f.estado_mercancia = 'pagada'
AND NOT EXISTS (
  SELECT 1 FROM public.pagos_partidos pp WHERE pp.factura_id = f.id
)
LIMIT 10;

-- 6. Ver ejemplo de pagos partidos (primeros 10)
SELECT
  pp.id,
  pp.factura_id,
  f.numero_factura,
  pp.metodo_pago,
  pp.monto,
  pp.fecha_pago
FROM public.pagos_partidos pp
JOIN public.facturas f ON f.id = pp.factura_id
LIMIT 10;
