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
  user_id: string; // n8n debe enviar el user_id del usuario
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

    // Get webhook token for authentication
    const webhookToken = req.headers.get('x-webhook-token');
    const expectedToken = Deno.env.get('WEBHOOK_TOKEN');
    
    if (!webhookToken || webhookToken !== expectedToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body = await req.json();
    
    // Validate required fields
    const requiredFields = ['numero_factura', 'emisor_nombre', 'emisor_nit', 'total_a_pagar', 'user_id'];
    const missingFields = requiredFields.filter(field => !body[field]);
    
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
    if (typeof body.total_a_pagar !== 'number') {
      return new Response(JSON.stringify({ 
        error: 'total_a_pagar must be a number' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(body.user_id);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ 
        error: 'Invalid user_id' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare factura data
    const facturaData: Omit<FacturaData, 'id'> = {
      user_id: body.user_id,
      numero_factura: body.numero_factura,
      emisor_nombre: body.emisor_nombre,
      emisor_nit: body.emisor_nit,
      notas: body.notas || null,
      total_a_pagar: body.total_a_pagar,
      nombre_carpeta_factura: body.nombre_carpeta_factura || null,
      factura_cufe: body.factura_cufe || null,
    };

    // Insert factura into database
    const { data, error } = await supabase
      .from('facturas')
      .insert(facturaData)
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
      message: 'Factura created successfully'
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