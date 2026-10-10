-- Ejecuta ingest-correos cada 10 minutos (reemplaza el trigger de n8n).
--
-- La clave x-ingest-secret se lee del Vault en cada corrida: no vive en el
-- código ni en el historial de migraciones (el repo es público). Se carga
-- una sola vez desde el panel: Project Settings → Vault → secreto con nombre
-- 'ingest_correos_secret' y el mismo valor que INGEST_CORREOS_SECRET.
-- Si falta, el header va vacío y la función responde 401 sin procesar nada.
--
-- limite 8: el plan FREE da 150 s de reloj por request; un lote de 15 tardó
-- hasta 46 s en el backlog, así que 8 deja margen de sobra.
-- Corridas solapadas no duplican facturas: lo impide el índice único por CUFE.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'ingest-correos',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://tzftaefstlhiwpfxojpk.supabase.co/functions/v1/ingest-correos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-secret', coalesce(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ingest_correos_secret'),
        ''
      )
    ),
    body := '{"limite": 8}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cron$
);
