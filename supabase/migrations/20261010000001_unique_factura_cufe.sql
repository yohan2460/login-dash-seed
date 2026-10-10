-- Una factura electrónica no puede existir dos veces: el CUFE es el
-- identificador único que le asigna la DIAN.
--
-- Contexto: n8n reintentaba ante timeouts y la tabla no tenía ninguna clave
-- natural, así que GLOBAL CONEXIT #989 entró dos veces (mismo CUFE, 2 s de
-- diferencia) y se registró pagada dos veces. ingest-correos reemplaza a n8n
-- y también reintenta, así que la garantía tiene que vivir en la base.
--
-- - Se normaliza con lower(btrim()) para que mayúsculas o espacios no evadan
--   la regla.
-- - Las facturas manuales llevan un CUFE sintético "MANUAL-<numero>-<ts>"; el
--   timestamp las hace únicas, así que no chocan entre sí.
-- - EXCEPCIÓN TEMPORAL: la copia 2 de GLOBAL CONEXIT #989 queda fuera del
--   índice hasta que se confirme en el banco si fue un pago doble o un error
--   de registro (no se borra una factura pagada sin saberlo). Al resolverla,
--   recrear el índice sin el WHERE.
--
-- Aborta si aparece cualquier OTRO duplicado, en vez de fallar con un error
-- de Postgres difícil de leer.

DO $$
DECLARE
  duplicados INTEGER;
  detalle TEXT;
BEGIN
  SELECT count(*), string_agg(format('%s (NIT %s) x%s', numero, nit, veces), ', ')
    INTO duplicados, detalle
  FROM (
    SELECT min(numero_factura) AS numero, min(emisor_nit) AS nit, count(*) AS veces
    FROM public.facturas
    WHERE id <> 'b6f62212-fe6f-471f-ac07-abefc7e1d9b5'
      AND factura_cufe IS NOT NULL AND btrim(factura_cufe) <> ''
    GROUP BY lower(btrim(factura_cufe))
    HAVING count(*) > 1
    LIMIT 20
  ) d;

  IF COALESCE(duplicados, 0) > 0 THEN
    RAISE EXCEPTION
      'No se puede crear el índice único por CUFE: hay % grupo(s) duplicados. Ejemplos: %',
      duplicados, detalle;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_cufe_unique
  ON public.facturas (lower(btrim(factura_cufe)))
  WHERE factura_cufe IS NOT NULL
    AND btrim(factura_cufe) <> ''
    AND id <> 'b6f62212-fe6f-471f-ac07-abefc7e1d9b5';

COMMENT ON INDEX public.idx_facturas_cufe_unique IS
  'Una factura por CUFE. Un insert repetido falla con 23505 (webhook-facturas responde 409). Excluye temporalmente la copia 2 de GLOBAL CONEXIT #989, pendiente de conciliar.';
