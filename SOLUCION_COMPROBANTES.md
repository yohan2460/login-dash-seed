# 🔧 Solución al Error: "Comprobante no encontrado"

## 📋 Problema

Al hacer clic en el botón de descarga de comprobante (icono verde), aparece el mensaje:
> "Comprobante no encontrado - No hay comprobante de pago asociado a esta factura"

---

## 🎯 Causa Raíz

La tabla `comprobantes_pago` **no existe en la base de datos** porque la migración aún no se ha ejecutado.

---

## ✅ Solución Paso a Paso

### **Opción 1: Usando Supabase CLI (Recomendado)**

1. **Verificar que Docker Desktop esté corriendo** (requerido por Supabase CLI)

2. **Ejecutar la migración:**
   ```bash
   cd d:/Ferrotodo/login-dash-seed
   npx supabase db push
   ```

3. **Verificar que la tabla se creó:**
   ```bash
   npx supabase db diff
   ```

---

### **Opción 2: Manual desde Supabase Dashboard**

1. **Ir a Supabase Dashboard:**
   - Abrir: https://supabase.com/dashboard
   - Seleccionar el proyecto

2. **Ir a SQL Editor:**
   - Click en "SQL Editor" en el menú izquierdo

3. **Ejecutar el contenido de la migración:**
   - Abrir el archivo: `supabase/migrations/20251004000002_create_comprobantes_pago_table.sql`
   - Copiar todo el contenido
   - Pegarlo en el SQL Editor
   - Click en "Run" o presionar `Ctrl+Enter`

4. **Verificar que se creó correctamente:**
   ```sql
   SELECT * FROM information_schema.tables
   WHERE table_name = 'comprobantes_pago';
   ```

---

## 🔍 Verificación Post-Migración

### 1. **Verificar que la tabla existe:**

Ejecutar en SQL Editor:
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'comprobantes_pago'
) as tabla_existe;
```

Resultado esperado: `tabla_existe: true`

### 2. **Ver estructura de la tabla:**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'comprobantes_pago'
ORDER BY ordinal_position;
```

Debería mostrar 10 columnas:
- id
- user_id
- tipo_comprobante
- metodo_pago
- fecha_pago
- total_pagado
- cantidad_facturas
- pdf_file_path
- facturas_ids
- detalles
- created_at

### 3. **Verificar índices:**

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'comprobantes_pago';
```

Debería mostrar 4 índices:
- `comprobantes_pago_pkey`
- `idx_comprobantes_pago_user_id`
- `idx_comprobantes_pago_fecha`
- `idx_comprobantes_pago_facturas_ids`

### 4. **Verificar políticas RLS:**

```sql
SELECT policyname FROM pg_policies
WHERE tablename = 'comprobantes_pago';
```

Debería mostrar 4 políticas:
- Los usuarios pueden ver sus propios comprobantes
- Los usuarios pueden insertar sus propios comprobantes
- Los usuarios pueden actualizar sus propios comprobantes
- Los usuarios pueden eliminar sus propios comprobantes

---

## 🧪 Pruebas Post-Migración

### **Paso 1: Registrar un nuevo pago**

1. Ir a una factura pendiente de pago
2. Click en el botón de pago
3. Completar el formulario de pago
4. Click en "Generar PDF y Pagar"

**Verificar en consola del navegador (F12):**
```
✅ Deberías ver estos logs:
💾 Iniciando guardado de comprobante para factura: [uuid]
📤 Subiendo PDF a storage: comprobantes-pago/[filename].pdf
✅ PDF subido correctamente
👤 User ID: [uuid]
📝 Datos del comprobante a insertar: {...}
✅ Comprobante guardado en BD: [{...}]
```

**❌ Si ves errores:**
- Error "relation comprobantes_pago does not exist" → La migración NO se ejecutó
- Error "permission denied" → Verificar políticas RLS
- Error "violates foreign key constraint" → Problema con user_id

### **Paso 2: Verificar que se guardó en BD**

Ejecutar en SQL Editor:
```sql
SELECT
  id,
  tipo_comprobante,
  metodo_pago,
  total_pagado,
  cantidad_facturas,
  facturas_ids,
  created_at
FROM comprobantes_pago
ORDER BY created_at DESC
LIMIT 5;
```

Deberías ver el comprobante recién creado.

### **Paso 3: Descargar el comprobante**

1. Ir a "Mercancía Pagada" o "Gastos Pagados"
2. Buscar la factura que acabas de pagar
3. Click en el botón verde de descarga (icono Download)

**Verificar en consola:**
```
✅ Logs esperados:
🔍 Buscando comprobante para factura: [uuid]
📊 Resultado búsqueda: {comprobantes: [{...}], error: null}
```

**✅ Si funciona:**
- El PDF se descarga automáticamente
- Toast verde: "Comprobante descargado correctamente"

**❌ Si sigue sin funcionar:**
- Verificar que `facturas_ids` contenga el UUID correcto
- Revisar consola para ver el query exacto que se está ejecutando

---

## 🔄 Migrar Pagos Antiguos (Opcional)

Si ya tienes facturas pagadas ANTES de implementar este sistema, puedes crear comprobantes retroactivos:

```sql
-- ADVERTENCIA: Esto creará comprobantes para pagos antiguos
-- Solo ejecutar si quieres tener comprobantes históricos

INSERT INTO public.comprobantes_pago (
  user_id,
  tipo_comprobante,
  metodo_pago,
  fecha_pago,
  total_pagado,
  cantidad_facturas,
  pdf_file_path,
  facturas_ids,
  detalles
)
SELECT
  user_id,
  'pago_individual' as tipo_comprobante,
  COALESCE(metodo_pago, 'Pago Banco') as metodo_pago,
  COALESCE(fecha_pago, created_at) as fecha_pago,
  COALESCE(valor_real_a_pagar, total_a_pagar) as total_pagado,
  1 as cantidad_facturas,
  'sin-pdf-comprobante' as pdf_file_path, -- Marcador para pagos sin PDF
  ARRAY[id] as facturas_ids,
  jsonb_build_object(
    'factura_numero', numero_factura,
    'proveedor', emisor_nombre,
    'migrado', true,
    'nota', 'Comprobante creado retroactivamente'
  ) as detalles
FROM facturas
WHERE estado_mercancia = 'pagada'
AND metodo_pago IS NOT NULL
AND metodo_pago != 'Pago Partido'
-- Solo las que no tienen comprobante
AND NOT EXISTS (
  SELECT 1 FROM comprobantes_pago cp
  WHERE cp.facturas_ids @> ARRAY[facturas.id]
);
```

**Nota:** Los comprobantes retroactivos tendrán `pdf_file_path = 'sin-pdf-comprobante'` porque no se generó el PDF en su momento.

---

## 📝 Resumen de Logs para Debugging

### **Logs exitosos al generar comprobante:**
```
💾 Iniciando guardado de comprobante para factura: [uuid]
📤 Subiendo PDF a storage: comprobantes-pago/[filename]
✅ PDF subido correctamente
👤 User ID: [uuid]
📝 Datos del comprobante a insertar: {tipo_comprobante: "pago_individual", ...}
✅ Comprobante guardado en BD: [{id: "...", ...}]
```

### **Logs exitosos al buscar comprobante:**
```
🔍 Buscando comprobante para factura: [uuid]
📊 Resultado búsqueda: {comprobantes: [1 item], error: null}
```

### **Logs de ERROR comunes:**

**Error 1: Tabla no existe**
```
❌ Error al insertar en BD: {
  code: "42P01",
  message: "relation \"public.comprobantes_pago\" does not exist"
}
```
**Solución:** Ejecutar la migración

**Error 2: Permiso denegado**
```
❌ Error: {
  code: "42501",
  message: "permission denied for table comprobantes_pago"
}
```
**Solución:** Verificar políticas RLS

**Error 3: No se encuentra el comprobante**
```
📊 Resultado búsqueda: {comprobantes: null, error: null}
```
**Solución:** Verificar que se guardó correctamente primero

---

## ✅ Checklist Final

- [ ] Migración ejecutada (tabla existe)
- [ ] Índices creados
- [ ] Políticas RLS configuradas
- [ ] Registrar un pago de prueba
- [ ] Verificar logs en consola (sin errores)
- [ ] Verificar registro en BD
- [ ] Botón verde visible en facturas pagadas
- [ ] Comprobante se descarga correctamente
- [ ] Toast de éxito aparece

---

## 🆘 Si Sigue Sin Funcionar

1. **Compartir logs completos de consola** al generar un pago
2. **Ejecutar este query y compartir resultado:**
   ```sql
   SELECT COUNT(*) FROM comprobantes_pago;
   SELECT * FROM comprobantes_pago LIMIT 1;
   ```
3. **Verificar en Supabase Storage** que existe la carpeta `comprobantes-pago/`

---

**Desarrollado con ❤️ para Ferrotodo**
