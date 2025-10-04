# 🔍 Diagnóstico Paso a Paso - Comprobantes no se Crean

## 📋 Síntoma
Al registrar un pago, el comprobante NO se guarda en la base de datos.

---

## 🎯 Pasos de Diagnóstico

### **Paso 1: Abrir la Consola del Navegador**

1. Presiona **F12** para abrir DevTools
2. Ve a la pestaña **Console**
3. Limpia la consola (icono de 🚫 o botón "Clear console")
4. Deja la consola abierta

---

### **Paso 2: Registrar un Pago de Prueba**

1. Ve a una factura pendiente
2. Click en el botón de pago
3. Completa el formulario
4. Click en "Generar PDF y Pagar"

---

### **Paso 3: Revisar los Logs en la Consola**

Busca estos mensajes (con emojis):

#### **✅ ESCENARIO EXITOSO:**
```
💾 Iniciando guardado de comprobante para factura: [uuid]
📤 Subiendo PDF a storage: comprobantes-pago/Pago_...pdf
✅ PDF subido correctamente: {path: "..."}
👤 User ID: [uuid]
📝 Datos del comprobante a insertar: {tipo_comprobante: "pago_individual", ...}
✅ Comprobante guardado en BD: [{id: "...", ...}]
```

Si ves esto, **el comprobante SÍ se guardó** ✅

---

#### **❌ ESCENARIO 1: Tabla no existe**
```
❌ Error al insertar en BD: {
  code: "42P01",
  message: "relation \"public.comprobantes_pago\" does not exist"
}
```

**SOLUCIÓN:**
La tabla NO existe. Ejecutar migración:

1. Ir a Supabase Dashboard → SQL Editor
2. Copiar el contenido de: `supabase/migrations/20251004000002_create_comprobantes_pago_table.sql`
3. Pegar y ejecutar

---

#### **❌ ESCENARIO 2: Permisos RLS**
```
❌ Error al insertar en BD: {
  code: "42501",
  message: "new row violates row-level security policy"
}
```

**SOLUCIÓN:**
Problema de permisos. Verificar políticas RLS:

```sql
-- Ver políticas actuales
SELECT * FROM pg_policies WHERE tablename = 'comprobantes_pago';

-- Si no hay políticas, ejecutar la migración completa
```

---

#### **❌ ESCENARIO 3: Constraint violation**
```
❌ Error al insertar en BD: {
  code: "23514",
  message: "new row for relation ... violates check constraint"
}
```

**SOLUCIÓN:**
Valor inválido en algún campo. Verificar:
- `tipo_comprobante` debe ser: `'pago_individual'` o `'pago_multiple'`
- `metodo_pago` debe ser: `'Pago Banco'`, `'Pago Tobías'`, `'Caja'`, o `'Pago Partido'`
- `monto` debe ser mayor a 0

---

#### **❌ ESCENARIO 4: Error al subir PDF**
```
❌ Error al subir PDF: {
  message: "The resource already exists"
}
```

**SOLUCIÓN:**
El archivo PDF ya existe. Cambiar `upsert: false` a `upsert: true` en el código.

O simplemente esperar y volver a intentar (el timestamp cambiará).

---

#### **❌ ESCENARIO 5: User ID null**
```
👤 User ID: undefined
❌ Error al insertar en BD: {
  message: "null value in column user_id violates not-null constraint"
}
```

**SOLUCIÓN:**
El usuario no está autenticado correctamente.

```typescript
// Verificar en consola:
const { data } = await supabase.auth.getUser();
console.log('Usuario:', data);
```

---

### **Paso 4: Ejecutar Diagnóstico en Supabase**

1. Ir a Supabase Dashboard → SQL Editor
2. Ejecutar el script: `diagnostico_comprobantes.sql`
3. Revisar los resultados

**Verificaciones clave:**

```sql
-- ¿Existe la tabla?
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_name = 'comprobantes_pago'
);
-- Debe devolver: true

-- ¿Hay registros?
SELECT COUNT(*) FROM comprobantes_pago;
-- Si devuelve 0, ningún comprobante se ha guardado

-- ¿RLS está habilitado?
SELECT relrowsecurity FROM pg_class WHERE relname = 'comprobantes_pago';
-- Debe devolver: true
```

---

### **Paso 5: Prueba Manual de INSERT**

Si todo lo anterior está bien, probar insertar manualmente:

```sql
-- 1. Obtener tu user_id
SELECT auth.uid() as mi_user_id;

-- 2. Intentar insertar (REEMPLAZA 'tu-user-id' con el valor del paso 1)
INSERT INTO comprobantes_pago (
  user_id,
  tipo_comprobante,
  metodo_pago,
  fecha_pago,
  total_pagado,
  cantidad_facturas,
  pdf_file_path,
  facturas_ids,
  detalles
) VALUES (
  'tu-user-id',  -- ⚠️ CAMBIAR ESTO
  'pago_individual',
  'Pago Banco',
  NOW(),
  1000000,
  1,
  'test/manual.pdf',
  ARRAY['test-id'],
  '{"test": true}'::jsonb
) RETURNING *;
```

**Si el INSERT manual funciona:**
- ✅ La tabla existe y funciona
- ✅ Los permisos están OK
- ❌ El problema está en el código de la aplicación

**Si el INSERT manual NO funciona:**
- Ver el error específico que devuelve
- Ese es el problema raíz

---

## 🔧 Soluciones Comunes

### **Solución 1: Ejecutar Migración**

**Archivo:** `supabase/migrations/20251004000002_create_comprobantes_pago_table.sql`

```bash
# Opción A: Con CLI
npx supabase db push

# Opción B: Manual
# Copiar contenido del archivo y ejecutar en SQL Editor
```

---

### **Solución 2: Verificar Storage Bucket**

El PDF se sube a `facturas-pdf` bucket:

1. Ir a Supabase → Storage
2. Verificar que el bucket `facturas-pdf` existe
3. Verificar permisos del bucket

Si no existe:
```sql
-- Crear bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas-pdf', 'facturas-pdf', false);

-- Dar permisos
CREATE POLICY "Usuarios pueden subir sus PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'facturas-pdf' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

### **Solución 3: Revisar Variables de Entorno**

Verificar `.env`:
```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

---

## 📊 Checklist de Verificación

Marca cada ítem cuando lo verifiques:

- [ ] La tabla `comprobantes_pago` existe
- [ ] RLS está habilitado
- [ ] Hay 4 políticas creadas
- [ ] Los índices existen
- [ ] El bucket `facturas-pdf` existe
- [ ] El usuario está autenticado (auth.uid() no es null)
- [ ] Los logs muestran "✅ Comprobante guardado en BD"
- [ ] El INSERT manual funciona
- [ ] No hay errores en la consola

---

## 🆘 Compartir para Ayuda

Si aún no funciona, comparte:

1. **Output del script diagnóstico** (`diagnostico_comprobantes.sql`)
2. **Logs completos de la consola** (copiar todo el texto)
3. **Captura de pantalla** del error específico
4. **Resultado del INSERT manual**

---

## 📝 Logs Esperados (Completos)

```javascript
// Al generar PDF y pagar:
💾 Iniciando guardado de comprobante para factura: a1b2c3d4-...
📤 Subiendo PDF a storage: comprobantes-pago/Pago_Proveedor_12345_1696800000000.pdf
✅ PDF subido correctamente: {
  path: "comprobantes-pago/Pago_Proveedor_12345_1696800000000.pdf",
  id: "...",
  fullPath: "..."
}
👤 User ID: x9y8z7w6-...
📝 Datos del comprobante a insertar: {
  user_id: "x9y8z7w6-...",
  tipo_comprobante: "pago_individual",
  metodo_pago: "Pago Banco",
  fecha_pago: "2025-10-04T...",
  total_pagado: 950000,
  cantidad_facturas: 1,
  pdf_file_path: "comprobantes-pago/Pago_Proveedor_12345_1696800000000.pdf",
  facturas_ids: ["a1b2c3d4-..."],
  detalles: {...}
}
✅ Comprobante guardado en BD: [{
  id: "c4d5e6f7-...",
  user_id: "x9y8z7w6-...",
  tipo_comprobante: "pago_individual",
  ...
}]
```

Si ves esto, **TODO ESTÁ FUNCIONANDO** ✅
