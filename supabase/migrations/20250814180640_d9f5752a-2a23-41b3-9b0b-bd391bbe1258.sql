-- Crear función temporal para insertar datos de prueba
CREATE OR REPLACE FUNCTION public.insert_sample_facturas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Obtener el ID del usuario actual
  current_user_id := auth.uid();
  
  -- Solo insertar si hay un usuario autenticado
  IF current_user_id IS NOT NULL THEN
    INSERT INTO public.facturas (
      user_id,
      numero_factura,
      emisor_nombre,
      emisor_nit,
      notas,
      total_a_pagar,
      nombre_carpeta_factura,
      factura_cufe
    ) VALUES 
    (
      current_user_id,
      'FE-001-2024',
      'Empresa ABC S.A.S.',
      '900123456-1',
      'Servicios de consultoría empresarial mes de enero',
      2500000.00,
      'facturas_2024_01',
      'CUFE-ABC-001-2024'
    ),
    (
      current_user_id,
      'FE-002-2024',
      'Proveedores XYZ Ltda.',
      '800987654-3',
      'Suministro de materiales de oficina',
      450000.50,
      'facturas_2024_01',
      'CUFE-XYZ-002-2024'
    ),
    (
      current_user_id,
      'FE-003-2024',
      'Servicios Tecnológicos DEF',
      '901234567-8',
      'Licencias de software y soporte técnico anual',
      8900000.00,
      'facturas_2024_01',
      'CUFE-DEF-003-2024'
    ),
    (
      current_user_id,
      'FE-004-2024',
      'Transportes GHI S.A.',
      '890567123-2',
      'Servicios de logística y distribución',
      1250000.75,
      'facturas_2024_01',
      'CUFE-GHI-004-2024'
    ),
    (
      current_user_id,
      'FE-005-2024',
      'Mantenimiento JKL E.U.',
      '123456789-0',
      'Mantenimiento preventivo equipos de aire acondicionado',
      680000.00,
      'facturas_2024_01',
      'CUFE-JKL-005-2024'
    );
  END IF;
END;
$$;