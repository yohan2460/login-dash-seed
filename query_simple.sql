-- Total de facturas PENDIENTES (no pagadas)
SELECT
  'PENDIENTES' as tipo,
  COUNT(*) as cantidad_facturas,
  SUM(total_a_pagar) as suma_total_a_pagar
FROM facturas
WHERE estado_mercancia != 'pagada' OR estado_mercancia IS NULL;

-- Total de facturas PAGADAS
SELECT
  'PAGADAS' as tipo,
  COUNT(*) as cantidad_facturas,
  SUM(total_a_pagar) as suma_total_a_pagar,
  SUM(COALESCE(valor_real_a_pagar, monto_pagado, 0)) as suma_valor_real_pagado
FROM facturas
WHERE estado_mercancia = 'pagada';

-- Total GENERAL de todas las facturas
SELECT
  'TOTAL GENERAL' as tipo,
  COUNT(*) as cantidad_facturas,
  SUM(total_a_pagar) as suma_total_a_pagar
FROM facturas;
