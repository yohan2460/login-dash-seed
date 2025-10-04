-- Corrección de políticas RLS para pagos_partidos
-- Esta migración soluciona el error 403 Forbidden al insertar en pagos_partidos

-- 1. Eliminar las políticas existentes si existen
DROP POLICY IF EXISTS "Los usuarios pueden ver pagos de sus propias facturas" ON public.pagos_partidos;
DROP POLICY IF EXISTS "Los usuarios pueden insertar pagos en sus propias facturas" ON public.pagos_partidos;
DROP POLICY IF EXISTS "Los usuarios pueden actualizar pagos de sus propias facturas" ON public.pagos_partidos;
DROP POLICY IF EXISTS "Los usuarios pueden eliminar pagos de sus propias facturas" ON public.pagos_partidos;

-- 2. Crear políticas mejoradas que manejen facturas sin user_id

-- Política SELECT: Ver pagos de facturas propias O facturas sin user_id
CREATE POLICY "Los usuarios pueden ver pagos de sus propias facturas"
ON public.pagos_partidos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.facturas
    WHERE facturas.id = pagos_partidos.factura_id
    AND (facturas.user_id = auth.uid() OR facturas.user_id IS NULL)
  )
);

-- Política INSERT: Insertar pagos en facturas propias O facturas sin user_id
CREATE POLICY "Los usuarios pueden insertar pagos en sus propias facturas"
ON public.pagos_partidos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.facturas
    WHERE facturas.id = pagos_partidos.factura_id
    AND (facturas.user_id = auth.uid() OR facturas.user_id IS NULL)
  )
);

-- Política UPDATE: Actualizar pagos de facturas propias O facturas sin user_id
CREATE POLICY "Los usuarios pueden actualizar pagos de sus propias facturas"
ON public.pagos_partidos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.facturas
    WHERE facturas.id = pagos_partidos.factura_id
    AND (facturas.user_id = auth.uid() OR facturas.user_id IS NULL)
  )
);

-- Política DELETE: Eliminar pagos de facturas propias O facturas sin user_id
CREATE POLICY "Los usuarios pueden eliminar pagos de sus propias facturas"
ON public.pagos_partidos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.facturas
    WHERE facturas.id = pagos_partidos.factura_id
    AND (facturas.user_id = auth.uid() OR facturas.user_id IS NULL)
  )
);

-- 3. Comentarios explicativos
COMMENT ON POLICY "Los usuarios pueden ver pagos de sus propias facturas" ON public.pagos_partidos IS
'Permite ver pagos de facturas propias o facturas sin user_id (compatibilidad con datos antiguos)';

COMMENT ON POLICY "Los usuarios pueden insertar pagos en sus propias facturas" ON public.pagos_partidos IS
'Permite insertar pagos en facturas propias o facturas sin user_id (compatibilidad con datos antiguos)';
