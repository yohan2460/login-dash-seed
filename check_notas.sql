-- Ver facturas con notas de crédito aplicadas
SELECT 
  numero_factura,
  emisor_nombre,
  clasificacion,
  estado_nota_credito,
  total_a_pagar,
  LENGTH(notas) as notas_length,
  LEFT(notas, 100) as notas_preview
FROM facturas
WHERE notas IS NOT NULL 
  AND notas != ''
  AND notas != '{}'
ORDER BY created_at DESC
LIMIT 5;
