-- Migración de pagos existentes a la tabla pagos_partidos
-- Esta migración inserta todos los pagos que están solo en la tabla facturas
-- hacia la nueva estructura unificada en pagos_partidos

-- Insertar pagos normales (facturas pagadas que NO son "Pago Partido")
-- Solo migrar si aún no existe un registro en pagos_partidos para esa factura
INSERT INTO public.pagos_partidos (factura_id, metodo_pago, monto, fecha_pago)
SELECT
  f.id AS factura_id,
  f.metodo_pago,
  COALESCE(f.valor_real_a_pagar, f.monto_pagado, f.total_a_pagar) AS monto,
  COALESCE(f.fecha_pago, f.created_at) AS fecha_pago
FROM
  public.facturas f
WHERE
  -- Solo facturas que están marcadas como pagadas
  f.estado_mercancia = 'pagada'
  -- Solo facturas con un método de pago normal (no "Pago Partido")
  AND f.metodo_pago IS NOT NULL
  AND f.metodo_pago != 'Pago Partido'
  -- Evitar duplicados: solo insertar si no existe ya un registro en pagos_partidos
  AND NOT EXISTS (
    SELECT 1
    FROM public.pagos_partidos pp
    WHERE pp.factura_id = f.id
  );

-- Resumen de la migración
DO $$
DECLARE
  total_migrados INT;
  total_pagos_partidos INT;
BEGIN
  -- Contar cuántos registros se migraron (pagos normales)
  SELECT COUNT(*) INTO total_migrados
  FROM public.pagos_partidos pp
  INNER JOIN public.facturas f ON pp.factura_id = f.id
  WHERE f.metodo_pago != 'Pago Partido';

  -- Contar cuántos pagos partidos existen
  SELECT COUNT(DISTINCT factura_id) INTO total_pagos_partidos
  FROM public.pagos_partidos pp
  INNER JOIN public.facturas f ON pp.factura_id = f.id
  WHERE f.metodo_pago = 'Pago Partido';

  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Migración completada exitosamente';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Pagos normales migrados: %', total_migrados;
  RAISE NOTICE 'Pagos partidos existentes: %', total_pagos_partidos;
  RAISE NOTICE 'Total de facturas en pagos_partidos: %', total_migrados + total_pagos_partidos;
  RAISE NOTICE '==============================================';
END $$;
