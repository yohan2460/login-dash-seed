SELECT 
  COUNT(*) as total_facturas,
  SUM(total_a_pagar) as suma_total_a_pagar,
  SUM(CASE WHEN estado_mercancia = 'pagada' THEN total_a_pagar ELSE 0 END) as suma_pagadas_total_a_pagar,
  SUM(CASE WHEN estado_mercancia != 'pagada' OR estado_mercancia IS NULL THEN total_a_pagar ELSE 0 END) as suma_pendientes_total_a_pagar,
  SUM(CASE WHEN estado_mercancia = 'pagada' THEN COALESCE(valor_real_a_pagar, monto_pagado, 0) ELSE 0 END) as suma_pagadas_valor_real,
  COUNT(CASE WHEN estado_mercancia = 'pagada' THEN 1 END) as count_pagadas,
  COUNT(CASE WHEN estado_mercancia != 'pagada' OR estado_mercancia IS NULL THEN 1 END) as count_pendientes
FROM facturas;
