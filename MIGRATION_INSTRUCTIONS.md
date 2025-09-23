# Instrucciones para Migración - Campo ingresado_sistema

## Cambios realizados en el código

1. **Nueva migración creada**: `supabase/migrations/20250923000001_add_ingresado_sistema_column.sql`
   - Agrega columna `ingresado_sistema` (boolean) a la tabla `facturas`
   - Migra datos existentes donde `estado_mercancia = 'ingresado_sistema'` para establecer `ingresado_sistema = true`
   - Actualiza `estado_mercancia` de 'ingresado_sistema' a 'pagada' para mantener la lógica de secciones

2. **Tipos actualizados**: `src/integrations/supabase/types.ts`
   - Agregado campo `ingresado_sistema: boolean | null` en Row, Insert y Update

3. **Interfaces actualizadas**:
   - `src/pages/MercanciaPagada.tsx`: Interface Factura actualizada
   - `src/components/FacturasTable.tsx`: Interface Factura actualizada

4. **Lógica actualizada**:
   - `getEstadoSistemaBadge` ahora usa `ingresado_sistema` en lugar de `estado_mercancia`
   - Checkboxes actualizados para usar el nuevo campo
   - Query en MercanciaPagada incluye el nuevo campo

## Para aplicar los cambios:

1. Ejecutar la migración en Supabase:
   ```bash
   npx supabase db push
   ```

2. Si hay problemas con el link, primero ejecutar:
   ```bash
   npx supabase link --project-ref [PROJECT_REF]
   ```

## Resultado esperado:

- El campo `estado_mercancia` se usa solo para determinar en qué sección aparece la factura (pendiente/pagada)
- El campo `ingresado_sistema` se usa para mostrar si la factura fue ingresada al sistema
- Cuando una factura se marca como pagada, no se pierde la información de si fue ingresada al sistema
- En la página de Mercancía Pagada se muestra correctamente el estado del sistema sin checkbox para cambiar