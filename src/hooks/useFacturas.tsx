import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface Factura {
  id: string;
  numero_factura: string;
  emisor_nombre: string;
  emisor_nit: string;
  total_a_pagar: number;
  user_id: string;
  pdf_file_path?: string | null;
  clasificacion?: string | null;
  clasificacion_original?: string | null;
  created_at: string;
  updated_at?: string;
  factura_iva?: number | null;
  factura_iva_porcentaje?: number | null;
  descripcion?: string | null;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  numero_serie?: string | null;
  estado_mercancia?: string | null;
  metodo_pago?: string | null;
  uso_pronto_pago?: boolean | null;
  monto_pagado?: number | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  factura_cufe?: string | null;
  nombre_carpeta_factura?: string | null;
  notas?: string | null;
}

export function useFacturas() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchFacturas = useCallback(async () => {
    if (!user) {
      console.log('No user available, skipping fetch');
      setLoading(false);
      return;
    }

    try {
      console.log('🔄 Fetching facturas...');
      setLoading(true);
      
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Error fetching facturas:', error);
        throw error;
      }

      // Validar y filtrar datos válidos
      const validFacturas = (data || [])
        .filter((factura: any) => 
          factura !== null && 
          factura !== undefined && 
          typeof factura.id === 'string' && 
          factura.id.length > 0
        ) as Factura[];

      console.log(`✅ Facturas loaded: ${validFacturas.length}`);
      setFacturas(validFacturas);
      
    } catch (error) {
      console.error('❌ Error in fetchFacturas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las facturas",
        variant: "destructive"
      });
      setFacturas([]);
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  const deleteFactura = useCallback(async (facturaId: string): Promise<boolean> => {
    if (!user) {
      console.error('❌ No user authenticated for deletion');
      toast({
        title: "Error de autenticación",
        description: "No hay usuario autenticado",
        variant: "destructive"
      });
      return false;
    }

    if (!facturaId || typeof facturaId !== 'string') {
      console.error('❌ Invalid factura ID provided:', facturaId);
      toast({
        title: "Error",
        description: "ID de factura inválido",
        variant: "destructive"
      });
      return false;
    }

    try {
      console.log(`🗑️ Starting deletion of factura: ${facturaId}`);
      console.log(`👤 User: ${user.id} (${user.email})`);

      // Primero verificar que la factura existe y pertenece al usuario
      const { data: existingFactura, error: checkError } = await supabase
        .from('facturas')
        .select('id, user_id')
        .eq('id', facturaId)
        .single();

      if (checkError) {
        console.error('❌ Error checking factura existence:', checkError);
        if (checkError.code === 'PGRST116') {
          toast({
            title: "Error",
            description: "La factura no existe o no tienes permisos para eliminarla",
            variant: "destructive"
          });
          return false;
        }
        throw checkError;
      }

      if (!existingFactura) {
        console.error('❌ Factura not found');
        toast({
          title: "Error",
          description: "La factura no fue encontrada",
          variant: "destructive"
        });
        return false;
      }

      console.log(`✅ Factura exists, belongs to user: ${existingFactura.user_id}`);

      // Ejecutar la eliminación
      const { data: deletedData, error: deleteError } = await supabase
        .from('facturas')
        .delete()
        .eq('id', facturaId)
        .select();

      if (deleteError) {
        console.error('❌ Delete operation failed:', deleteError);
        throw deleteError;
      }

      if (!deletedData || deletedData.length === 0) {
        console.error('❌ No records deleted - permission issue');
        toast({
          title: "Error",
          description: "No se pudo eliminar la factura. Verifica tus permisos.",
          variant: "destructive"
        });
        return false;
      }

      console.log(`✅ Successfully deleted factura: ${facturaId}`);
      console.log(`📊 Deleted records:`, deletedData);

      // Actualizar el estado local inmediatamente
      setFacturas(prev => {
        const updated = prev.filter(f => f.id !== facturaId);
        console.log(`📋 Local state updated: ${prev.length} -> ${updated.length} facturas`);
        return updated;
      });

      toast({
        title: "Factura eliminada",
        description: "La factura ha sido eliminada exitosamente",
      });

      return true;

    } catch (error: any) {
      console.error('❌ Critical error in deleteFactura:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      });

      toast({
        title: "Error al eliminar",
        description: `Error: ${error?.message || 'Error desconocido'}`,
        variant: "destructive"
      });

      return false;
    }
  }, [user, toast]);

  const updateFactura = useCallback(async (facturaId: string, updates: Partial<Factura>) => {
    try {
      const { data, error } = await supabase
        .from('facturas')
        .update(updates)
        .eq('id', facturaId)
        .select()
        .single();

      if (error) throw error;

      // Actualizar estado local
      setFacturas(prev => prev.map(f => 
        f.id === facturaId ? { ...f, ...data } : f
      ));

      return data;
    } catch (error) {
      console.error('Error updating factura:', error);
      throw error;
    }
  }, []);

  // Cargar facturas cuando el usuario cambie
  useEffect(() => {
    fetchFacturas();
  }, [fetchFacturas]);

  // Setup realtime subscription
  useEffect(() => {
    if (!user) return;

    console.log('🔄 Setting up realtime subscription...');
    
    const channel = supabase
      .channel('facturas-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'facturas'
        },
        (payload) => {
          console.log('🔔 Realtime update received:', payload);
          fetchFacturas();
        }
      )
      .subscribe();

    return () => {
      console.log('🔄 Cleaning up realtime subscription...');
      supabase.removeChannel(channel);
    };
  }, [user, fetchFacturas]);

  return {
    facturas,
    loading,
    fetchFacturas,
    deleteFactura,
    updateFactura,
    refetch: fetchFacturas
  };
}