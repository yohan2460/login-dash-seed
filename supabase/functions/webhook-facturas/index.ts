import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface FacturaData {
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  notas?: string;
  total_a_pagar: number;
  nombre_carpeta_factura?: string;
  factura_cufe?: string;
  user_id: string;
  pdf_file_path?: string;
  factura_iva?: number;
  factura_iva_porcentaje?: number;
  factura_iva_5?: number;
  factura_iva_5_porcentaje?: number;
  descripcion?: string;
  tiene_retencion?: boolean;
  monto_retencion?: number;
  porcentaje_pronto_pago?: number;
  fecha_emision?: string;
  fecha_vencimiento?: string;
  total_sin_iva?: number;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Comparación en tiempo constante. Hashea ambos lados primero para no
// filtrar la longitud del secreto por el tiempo de respuesta.
async function secretsMatch(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// Parseo estricto de montos. parseFloat("abc") es NaN y parseFloat("1,5")
// es 1 — ambos entraban a la base sin que nadie se enterara.
function parseMonto(raw: unknown, fallback: number | null = null): number | null {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return fallback;
  // Los montos son DECIMAL(x,2) en la base: redondeamos acá para que el
  // valor que validamos sea exactamente el que se persiste.
  return Math.round(n * 100) / 100;
}

// Función para generar nombre único de archivo
function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  return `${timestamp}_${randomStr}.${extension}`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ---------------------------------------------------------------
  // AUTENTICACIÓN
  // Esta función corre con SERVICE_ROLE_KEY, que bypassea toda RLS.
  // Sin este chequeo el endpoint es una puerta abierta de escritura
  // a la tabla facturas de producción. Falla cerrado a propósito:
  // si el secreto no está configurado, no se atiende a nadie.
  // ---------------------------------------------------------------
  const webhookSecret = Deno.env.get('WEBHOOK_FACTURAS_SECRET');
  if (!webhookSecret) {
    console.error('WEBHOOK_FACTURAS_SECRET no está configurado — rechazando request');
    return json({ error: 'Webhook not configured' }, 503);
  }

  const providedSecret = req.headers.get('x-webhook-secret') ?? '';
  if (!(await secretsMatch(providedSecret, webhookSecret))) {
    console.warn('Request rechazado: secreto inválido o ausente');
    return json({ error: 'Unauthorized' }, 401);
  }

  let pdfFilePath: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    // Initialize Supabase client with service role for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const contentType = req.headers.get('content-type') || '';
    let facturaData: Partial<FacturaData> = {};
    let pdfFile: File | null = null;

    // Determinar si es multipart/form-data o JSON
    if (contentType.includes('multipart/form-data')) {
      console.log('Processing multipart/form-data request');

      const formData = await req.formData();

      // Extraer datos de la factura
      facturaData = {
        numero_factura: formData.get('numero_factura') as string,
        emisor_nombre: formData.get('emisor_nombre') as string,
        emisor_nit: formData.get('emisor_nit') as string,
        notas: formData.get('notas') as string || undefined,
        total_a_pagar: parseMonto(formData.get('total_a_pagar')) ?? NaN,
        nombre_carpeta_factura: formData.get('nombre_carpeta_factura') as string || undefined,
        factura_cufe: formData.get('factura_cufe') as string || undefined,
        factura_iva: parseMonto(formData.get('factura_iva'), 0)!,
        factura_iva_porcentaje: parseMonto(formData.get('factura_iva_porcentaje'), 0)!,
        factura_iva_5: parseMonto(formData.get('factura_iva_5'), 0)!,
        factura_iva_5_porcentaje: parseMonto(formData.get('factura_iva_5_porcentaje'), 5)!,
        descripcion: formData.get('descripcion') as string || undefined,
        tiene_retencion: formData.get('tiene_retencion') === 'true',
        monto_retencion: parseMonto(formData.get('monto_retencion'), 0)!,
        porcentaje_pronto_pago: parseMonto(formData.get('porcentaje_pronto_pago')),
        fecha_emision: formData.get('fecha_emision') as string || undefined,
        fecha_vencimiento: formData.get('fecha_vencimiento') as string || undefined,
      };

      // Extraer archivo PDF si existe
      const pdfFileEntry = formData.get('pdf_file');
      if (pdfFileEntry && pdfFileEntry instanceof File) {
        pdfFile = pdfFileEntry;
        console.log('PDF file received:', pdfFile.name, 'Size:', pdfFile.size);
      }
    } else {
      // Procesar como JSON (compatibilidad hacia atrás)
      console.log('Processing JSON request');
      const body = await req.json();

      // Los montos pasan por el mismo parseo estricto que la rama multipart:
      // antes la rama JSON aceptaba strings y NaN sin normalizar.
      facturaData = {
        ...body,
        total_a_pagar: parseMonto(body.total_a_pagar) ?? NaN,
        factura_iva: parseMonto(body.factura_iva, 0)!,
        factura_iva_porcentaje: parseMonto(body.factura_iva_porcentaje, 0)!,
        factura_iva_5: parseMonto(body.factura_iva_5, 0)!,
        factura_iva_5_porcentaje: parseMonto(body.factura_iva_5_porcentaje, 5)!,
        monto_retencion: parseMonto(body.monto_retencion, 0)!,
        porcentaje_pronto_pago: parseMonto(body.porcentaje_pronto_pago),
      };
    }

    // Validate required fields
    const requiredFields = ['numero_factura', 'emisor_nombre', 'emisor_nit', 'total_a_pagar'];
    const missingFields = requiredFields.filter(field => !facturaData[field as keyof FacturaData]);

    if (missingFields.length > 0) {
      return json({ error: 'Missing required fields', missing: missingFields }, 400);
    }

    // Validate data types
    if (typeof facturaData.total_a_pagar !== 'number' || !Number.isFinite(facturaData.total_a_pagar)) {
      return json({ error: 'total_a_pagar must be a valid number' }, 400);
    }

    if (facturaData.total_a_pagar <= 0) {
      return json({ error: 'total_a_pagar must be greater than zero' }, 400);
    }

    // ---------------------------------------------------------------
    // Usuario del sistema.
    // Antes se usaba auth.admin.listUsers(), que pagina de a 50: con más
    // de 50 usuarios el usuario del sistema dejaba de aparecer, se
    // intentaba recrearlo y la ingesta entera fallaba con 500.
    // get_system_user_id() ya existe en las migraciones y resuelve
    // el id en una sola consulta, sin paginación.
    // ---------------------------------------------------------------
    let defaultUserId: string | null = null;
    const defaultUserEmail = 'facturas@n8n.system';

    const { data: systemUserId, error: rpcError } = await supabase.rpc('get_system_user_id');

    if (rpcError) {
      console.warn('get_system_user_id() falló, se usa el camino de respaldo:', rpcError.message);
    } else if (systemUserId) {
      defaultUserId = systemUserId as string;
      console.log('Using existing default user:', defaultUserId);
    }

    if (!defaultUserId) {
      // Crear usuario por defecto si no existe
      const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
        email: defaultUserEmail,
        email_confirm: true,
        user_metadata: {
          display_name: 'Sistema N8N - Facturas'
        }
      });

      if (createUserError || !newUser.user) {
        console.error('Error creating default user:', createUserError);
        return json({
          error: 'Failed to create default user for facturas',
          details: createUserError?.message,
        }, 500);
      }

      defaultUserId = newUser.user.id;
      console.log('Created new default user:', defaultUserId);
    }

    // ---------------------------------------------------------------
    // IDEMPOTENCIA
    // n8n reintenta ante timeouts. Sin este chequeo cada reintento
    // creaba una factura duplicada, que después se paga dos veces.
    // El índice único de la migración 20260914000001 es la garantía
    // real; esto evita el 409 en el caso normal y ahorra subir el PDF.
    // ---------------------------------------------------------------
    const { data: existing, error: dupError } = await supabase
      .from('facturas')
      .select('*')
      .eq('numero_factura', facturaData.numero_factura!)
      .eq('emisor_nit', facturaData.emisor_nit!)
      .maybeSingle();

    if (dupError) {
      console.error('Error verificando duplicados:', dupError);
      return json({ error: 'Failed to check for duplicates', details: dupError.message }, 500);
    }

    if (existing) {
      console.log('Factura ya existente, no se inserta de nuevo:', existing.id);
      return json({
        success: true,
        duplicate: true,
        factura: existing,
        message: 'Factura already exists, no changes made',
      }, 200);
    }

    // Subir archivo PDF si existe
    if (pdfFile) {
      const fileName = generateUniqueFileName(pdfFile.name);
      const filePath = `facturas/${defaultUserId}/${fileName}`;

      console.log('Uploading PDF file to:', filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('facturas-pdf')
        .upload(filePath, pdfFile, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) {
        console.error('Error uploading PDF:', uploadError);
        return json({ error: 'Failed to upload PDF file', details: uploadError.message }, 500);
      }

      pdfFilePath = uploadData.path;
      console.log('PDF uploaded successfully to:', pdfFilePath);
    }

    // Prepare factura data
    const finalFacturaData: Omit<FacturaData, 'id'> = {
      user_id: defaultUserId,
      numero_factura: facturaData.numero_factura!,
      emisor_nombre: facturaData.emisor_nombre!,
      emisor_nit: facturaData.emisor_nit!,
      notas: facturaData.notas || null,
      total_a_pagar: facturaData.total_a_pagar!,
      nombre_carpeta_factura: facturaData.nombre_carpeta_factura || null,
      factura_cufe: facturaData.factura_cufe || null,
      pdf_file_path: pdfFilePath,
      factura_iva: facturaData.factura_iva || 0,
      factura_iva_porcentaje: facturaData.factura_iva_porcentaje || 0,
      // Estos dos se parseaban y se descartaban. El trigger
      // calculate_total_sin_iva resta factura_iva_5, así que al no
      // persistirlo toda factura con IVA 5% guardaba total_sin_iva mal.
      factura_iva_5: facturaData.factura_iva_5 || 0,
      factura_iva_5_porcentaje: facturaData.factura_iva_5_porcentaje ?? 5,
      descripcion: facturaData.descripcion || null,
      tiene_retencion: facturaData.tiene_retencion || false,
      monto_retencion: facturaData.monto_retencion || 0,
      porcentaje_pronto_pago: facturaData.porcentaje_pronto_pago ?? null,
      fecha_emision: facturaData.fecha_emision || null,
      fecha_vencimiento: facturaData.fecha_vencimiento || null,
    };

    // Insert factura into database
    const { data, error } = await supabase
      .from('facturas')
      .insert(finalFacturaData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);

      // El PDF ya está en storage pero la factura no existe: sin esta
      // limpieza el archivo queda huérfano y nadie lo referencia nunca.
      if (pdfFilePath) {
        const { error: cleanupError } = await supabase.storage
          .from('facturas-pdf')
          .remove([pdfFilePath]);
        if (cleanupError) {
          console.error('No se pudo limpiar el PDF huérfano:', pdfFilePath, cleanupError.message);
        } else {
          console.log('PDF huérfano eliminado:', pdfFilePath);
        }
      }

      // 23505 = unique_violation: otro request insertó la misma factura
      // entre nuestro chequeo de duplicados y este insert.
      if ((error as { code?: string }).code === '23505') {
        return json({ error: 'Factura already exists', details: error.message }, 409);
      }

      return json({ error: 'Failed to insert factura', details: error.message }, 500);
    }

    // Success response
    return json({
      success: true,
      factura: data,
      message: 'Factura created successfully',
      pdf_uploaded: !!pdfFile,
    }, 201);

  } catch (error) {
    console.error('Unexpected error:', error);

    if (pdfFilePath && supabase) {
      await supabase.storage.from('facturas-pdf').remove([pdfFilePath]).catch(() => {});
    }

    return json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});
