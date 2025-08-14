import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token',
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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Initialize Supabase client with service role for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        total_a_pagar: parseFloat(formData.get('total_a_pagar') as string),
        nombre_carpeta_factura: formData.get('nombre_carpeta_factura') as string || undefined,
        factura_cufe: formData.get('factura_cufe') as string || undefined,
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
      facturaData = await req.json();
    }
    
    // Validate required fields
    const requiredFields = ['numero_factura', 'emisor_nombre', 'emisor_nit', 'total_a_pagar'];
    const missingFields = requiredFields.filter(field => !facturaData[field as keyof FacturaData]);
    
    if (missingFields.length > 0) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields', 
        missing: missingFields 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate data types
    if (typeof facturaData.total_a_pagar !== 'number' || isNaN(facturaData.total_a_pagar)) {
      return new Response(JSON.stringify({ 
        error: 'total_a_pagar must be a valid number' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar o crear usuario por defecto para facturas de n8n
    const defaultUserEmail = 'facturas@n8n.system';
    let defaultUserId: string;

    // Intentar obtener el usuario por defecto existente
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const defaultUser = existingUsers?.users?.find(user => user.email === defaultUserEmail);

    if (defaultUser) {
      defaultUserId = defaultUser.id;
      console.log('Using existing default user:', defaultUserId);
    } else {
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
        return new Response(JSON.stringify({ 
          error: 'Failed to create default user for facturas',
          details: createUserError?.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      defaultUserId = newUser.user.id;
      console.log('Created new default user:', defaultUserId);
    }

    // Subir archivo PDF si existe
    let pdfFilePath: string | null = null;
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
        return new Response(JSON.stringify({ 
          error: 'Failed to upload PDF file',
          details: uploadError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
    };

    // Insert factura into database
    const { data, error } = await supabase
      .from('facturas')
      .insert(finalFacturaData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to insert factura', 
        details: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Success response
    return new Response(JSON.stringify({ 
      success: true, 
      factura: data,
      message: 'Factura created successfully',
      pdf_uploaded: !!pdfFile
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});