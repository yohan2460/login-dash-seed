import { supabase } from '@/integrations/supabase/client';
import { calcularValorRealAPagar, calcularTotalReal } from './calcularValorReal';
import { fetchAllRows } from '@/integrations/supabase/fetchAll';

interface FacturaDB {
  id: string;
  numero_factura: string;
  total_a_pagar: number;
  tiene_retencion?: boolean | null;
  monto_retencion?: number | null;
  porcentaje_pronto_pago?: number | null;
  factura_iva?: number | null;
  notas?: string | null;
  clasificacion?: string | null;
  valor_real_a_pagar?: number | null;
}

export async function migrateValorRealAPagar(): Promise<void> {
  console.log('🚀 Iniciando migración de valor_real_a_pagar...');

  try {
    // Paginado: sin esto solo se migraban las primeras 1000 facturas y el
    // resto quedaba con valor_real_a_pagar en null, en silencio y reportando
    // "migración completada".
    const facturas = await fetchAllRows<FacturaDB>(
      (from, to) => supabase
        .from('facturas')
        .select('*')
        .is('valor_real_a_pagar', null)
        .order('id')
        .range(from, to),
      { label: 'facturas a migrar' }
    );

    if (!facturas || facturas.length === 0) {
      console.log('✅ No se encontraron facturas para migrar.');
      return;
    }

    console.log(`📊 Encontradas ${facturas.length} facturas para migrar.`);

    const updates: Array<{id: string, valor_real_a_pagar: number}> = [];

    for (const factura of facturas) {
      let valorRealAPagar: number;

      // Para notas de crédito, el valor real a pagar es 0 si están relacionadas
      if (factura.clasificacion === 'nota_credito' && factura.notas) {
        try {
          const notasData = JSON.parse(factura.notas);
          if (notasData.tipo === 'nota_credito' && notasData.factura_original_id) {
            valorRealAPagar = 0;
          } else {
            valorRealAPagar = calcularValorRealAPagar(factura);
          }
        } catch (error) {
          valorRealAPagar = calcularValorRealAPagar(factura);
        }
      } else {
        // Para facturas normales, calcular basado en el total real (considerando notas de crédito)
        const totalReal = calcularTotalReal(factura);

        const facturaConTotalReal = {
          ...factura,
          total_a_pagar: totalReal
        };

        valorRealAPagar = calcularValorRealAPagar(facturaConTotalReal);
      }

      updates.push({
        id: factura.id,
        valor_real_a_pagar: valorRealAPagar
      });

      console.log(`💰 Factura ${factura.numero_factura}: ${valorRealAPagar.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}`);
    }

    // Actualizar en lotes de 100 para evitar timeouts
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      console.log(`📦 Procesando lote ${Math.floor(i / batchSize) + 1} de ${Math.ceil(updates.length / batchSize)} (${batch.length} facturas)...`);

      // Ejecutar updates en paralelo para este lote
      const updatePromises = batch.map(update =>
        supabase
          .from('facturas')
          .update({ valor_real_a_pagar: update.valor_real_a_pagar })
          .eq('id', update.id)
      );

      const results = await Promise.allSettled(updatePromises);

      // Un update de Supabase que falla NO rechaza la promesa: resuelve con
      // { error }. Chequear solo `status === 'rejected'` daba por exitosos
      // todos los updates que la base había rechazado.
      const errors = results.flatMap((result, idx) => {
        if (result.status === 'rejected') {
          return [`${batch[idx].id}: ${result.reason}`];
        }
        if (result.value?.error) {
          return [`${batch[idx].id}: ${result.value.error.message}`];
        }
        return [];
      });

      if (errors.length > 0) {
        console.error('❌ Errores en el lote:', errors);
        throw new Error(`${errors.length} actualizaciones fallaron en el lote: ${errors.join('; ')}`);
      }

      console.log(`✅ Lote ${Math.floor(i / batchSize) + 1} completado.`);
    }

    console.log(`🎉 Migración completada exitosamente. ${updates.length} facturas actualizadas.`);

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  }
}

// Función para verificar el resultado de la migración
export async function verificarMigracion(): Promise<void> {
  console.log('🔍 Verificando resultado de la migración...');

  try {
    const { data: facturasSinValor, error: fetchError } = await supabase
      .from('facturas')
      .select('id, numero_factura')
      .is('valor_real_a_pagar', null);

    if (fetchError) {
      throw new Error(`Error al verificar: ${fetchError.message}`);
    }

    const { count, error: countError } = await supabase
      .from('facturas')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Error al contar: ${countError.message}`);
    }

    console.log(`📊 Total de facturas: ${count}`);
    console.log(`📊 Facturas sin valor_real_a_pagar: ${facturasSinValor?.length || 0}`);

    if (facturasSinValor && facturasSinValor.length > 0) {
      console.log('⚠️ Facturas pendientes:', facturasSinValor.map(f => f.numero_factura));
    } else {
      console.log('✅ Todas las facturas tienen valor_real_a_pagar calculado.');
    }

  } catch (error) {
    console.error('❌ Error al verificar:', error);
    throw error;
  }
}