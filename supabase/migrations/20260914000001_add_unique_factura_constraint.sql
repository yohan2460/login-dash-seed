-- Evitar facturas duplicadas.
--
-- Contexto: la edge function webhook-facturas hacía .insert() sin ninguna
-- verificación previa y la tabla no tenía clave natural. Cada reintento de
-- n8n ante un timeout creaba una factura duplicada, que luego se paga dos
-- veces y además infla los totales del dashboard.
--
-- Esta migración ABORTA si ya existen duplicados, en vez de fallar con un
-- error de Postgres difícil de leer. Si aborta, limpiá los duplicados
-- primero (ver la consulta del bloque 6 en la auditoría de integridad) y
-- volvé a correrla.

DO $$
DECLARE
  duplicados INTEGER;
  detalle TEXT;
BEGIN
  SELECT count(*), string_agg(
           format('%s (NIT %s) x%s', numero_factura, emisor_nit, veces),
           ', ' ORDER BY veces DESC
         )
    INTO duplicados, detalle
  FROM (
    SELECT numero_factura, emisor_nit, count(*) AS veces
    FROM public.facturas
    GROUP BY numero_factura, emisor_nit
    HAVING count(*) > 1
    LIMIT 20
  ) d;

  IF COALESCE(duplicados, 0) > 0 THEN
    RAISE EXCEPTION
      'No se puede crear el índice único: hay % grupo(s) de facturas duplicadas. Resolvelas antes de aplicar esta migración. Ejemplos: %',
      duplicados, detalle;
  END IF;
END $$;

-- Clave natural de una factura: el número de factura es único por emisor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_numero_emisor_unique
  ON public.facturas (numero_factura, emisor_nit);

COMMENT ON INDEX public.idx_facturas_numero_emisor_unique IS
  'Clave natural de factura. Hace idempotente la ingesta vía webhook-facturas: un reintento de n8n choca con 23505 en vez de duplicar la factura.';
