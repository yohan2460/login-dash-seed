# 📄 Sistema de Comprobantes de Pago - Documentación

## 📋 Descripción General

Se ha implementado un sistema completo para **generar, almacenar y descargar comprobantes de pago** en formato PDF. Los comprobantes se guardan automáticamente en Supabase Storage y se registran en la base de datos para poder ser descargados posteriormente.

---

## 🗄️ **Estructura de Base de Datos**

### Tabla: `comprobantes_pago`

**Ubicación de migración**: `supabase/migrations/20251004000002_create_comprobantes_pago_table.sql`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | ID único del comprobante |
| `user_id` | UUID | ID del usuario que creó el comprobante |
| `tipo_comprobante` | TEXT | `pago_individual` o `pago_multiple` |
| `metodo_pago` | TEXT | Método de pago utilizado |
| `fecha_pago` | TIMESTAMP | Fecha del pago |
| `total_pagado` | NUMERIC | Monto total pagado |
| `cantidad_facturas` | INTEGER | Cantidad de facturas en el comprobante |
| `pdf_file_path` | TEXT | Ruta del PDF en Storage |
| `facturas_ids` | TEXT[] | Array de IDs de facturas asociadas |
| `detalles` | JSONB | Detalles adicionales del pago |
| `created_at` | TIMESTAMP | Fecha de creación |

**Índices creados:**
- `idx_comprobantes_pago_user_id` - Por usuario
- `idx_comprobantes_pago_fecha` - Por fecha (descendente)
- `idx_comprobantes_pago_facturas_ids` - GIN index para búsquedas en array

**Políticas RLS:**
- Los usuarios solo pueden ver/crear/modificar sus propios comprobantes

---

## 🔧 **Componentes Modificados**

### 1. **PaymentMethodDialog.tsx** (Pago Individual)

**Funcionalidad agregada:**

✅ Al generar el PDF del comprobante:
1. Se descarga automáticamente al navegador
2. Se sube a Supabase Storage en `facturas-pdf/comprobantes-pago/`
3. Se registra en la tabla `comprobantes_pago` con:
   - Información básica del pago
   - Detalles de la factura
   - Descuentos aplicados (retención, pronto pago, descuentos adicionales)
   - Si es pago partido: montos por cada método

**Código clave** (líneas 466-522):
```typescript
// Guardar el PDF en Supabase Storage
const pdfBlob = doc.output('blob');
const storagePath = `comprobantes-pago/${fileName}`;

await supabase.storage.from('facturas-pdf').upload(storagePath, pdfBlob);

await supabase.from('comprobantes_pago').insert({
  tipo_comprobante: 'pago_individual',
  metodo_pago: usarPagoPartido ? 'Pago Partido' : metodoPago,
  fecha_pago: fechaPago,
  total_pagado: valorFinal,
  cantidad_facturas: 1,
  pdf_file_path: storagePath,
  facturas_ids: [factura.id],
  detalles: { ... }
});
```

**Mejoras en el PDF:**
- Incluye descuentos adicionales (campo `descuentos_antes_iva`)
- Muestra cada descuento con su concepto y valor
- Calcula totales correctamente

---

### 2. **MultiplePaymentDialog.tsx** (Pago Múltiple)

**Funcionalidad agregada:**

✅ Al generar PDF de pago múltiple:
1. Se descarga automáticamente
2. Se sube a Storage
3. Se registra con información de todas las facturas incluidas

**Código clave** (líneas 643-707):
```typescript
await supabase.from('comprobantes_pago').insert({
  tipo_comprobante: 'pago_multiple',
  metodo_pago: metodoPago,
  fecha_pago: fechaPago,
  total_pagado: totalPagado,
  cantidad_facturas: facturas.length,
  pdf_file_path: storagePath,
  facturas_ids: facturas.map(f => f.id),
  detalles: {
    proveedor_unico: esProveedorUnico ? proveedoresUnicos[0] : null,
    total_original: totalOriginal,
    facturas: [ ... ]
  }
});
```

**Mejoras en el PDF:**
- Muestra descuentos adicionales por cada factura
- Panel visual con fondo morado para descuentos adicionales en UI
- Detalle completo en la tabla del PDF

---

### 3. **FacturasTable.tsx** (Tabla de Facturas)

**Funcionalidad agregada:**

✅ Botón de descarga de comprobantes (líneas 146-199 y 1307-1318)

**Nueva función:**
```typescript
const descargarComprobante = async (facturaId: string) => {
  // 1. Buscar comprobante asociado a la factura
  const { data: comprobantes } = await supabase
    .from('comprobantes_pago')
    .select('*')
    .contains('facturas_ids', [facturaId])
    .order('created_at', { ascending: false })
    .limit(1);

  // 2. Obtener URL firmada del PDF
  const { data: urlData } = await supabase.storage
    .from('facturas-pdf')
    .createSignedUrl(comprobante.pdf_file_path, 3600);

  // 3. Descargar automáticamente
  const link = document.createElement('a');
  link.href = urlData.signedUrl;
  link.download = 'comprobante.pdf';
  link.click();
}
```

**Botón agregado:**
```tsx
{factura.estado_mercancia === 'pagada' && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => descargarComprobante(factura.id)}
    className="h-8 w-8 p-0 hover:bg-green-50"
    title="Descargar Comprobante de Pago"
  >
    <Download className="w-3.5 h-3.5 text-green-600" />
  </Button>
)}
```

**Características:**
- ✅ Solo se muestra para facturas **pagadas**
- ✅ Icono verde de descarga
- ✅ Hover con fondo verde claro
- ✅ Tooltip informativo
- ✅ Busca el comprobante más reciente asociado a la factura
- ✅ Manejo de errores si no existe comprobante

---

## 📍 **Dónde está disponible la descarga**

El botón de descarga de comprobantes está visible en:

1. ✅ **Mercancía Pagada** - Usa `FacturasTable`
2. ✅ **Gastos Pagados** - Usa `FacturasTable`
3. ✅ **Sistematizadas** - Usa `FacturasTable` (si están pagadas)
4. ✅ **Informes** - Usa `FacturasTable` (filtrando por pagadas)
5. ✅ **Cualquier página que use FacturasTable** y muestre facturas pagadas

---

## 🎨 **Flujo de Datos**

```
┌─────────────────────────────────────────────┐
│  Usuario registra pago                      │
│  (PaymentMethodDialog / Multiple)          │
└───────────────┬─────────────────────────────┘
                │
                ├─── 1. Generar PDF (jsPDF)
                │
                ├─── 2. Descargar al navegador
                │
                ├─── 3. Subir a Storage
                │      (facturas-pdf/comprobantes-pago/)
                │
                └─── 4. Registrar en BD
                       (tabla: comprobantes_pago)

┌─────────────────────────────────────────────┐
│  Usuario quiere descargar comprobante       │
│  (Click en botón verde de descarga)        │
└───────────────┬─────────────────────────────┘
                │
                ├─── 1. Buscar en BD por factura_id
                │      (usando array contains)
                │
                ├─── 2. Obtener path del PDF
                │
                ├─── 3. Crear signed URL (válida 1h)
                │
                └─── 4. Descargar automáticamente
```

---

## 🔍 **Búsqueda de Comprobantes**

### Buscar por factura individual:
```sql
SELECT * FROM comprobantes_pago
WHERE facturas_ids @> ARRAY['factura-uuid-here']
ORDER BY created_at DESC
LIMIT 1;
```

### Buscar todos los comprobantes de un usuario:
```sql
SELECT * FROM comprobantes_pago
WHERE user_id = 'user-uuid-here'
ORDER BY fecha_pago DESC;
```

### Buscar comprobantes de pagos múltiples:
```sql
SELECT * FROM comprobantes_pago
WHERE tipo_comprobante = 'pago_multiple'
AND cantidad_facturas > 1
ORDER BY created_at DESC;
```

---

## 📊 **Estructura del campo `detalles` (JSONB)**

### Para pago individual:
```json
{
  "factura_numero": "12345",
  "proveedor": "ABC S.A.",
  "nit": "900123456",
  "total_original": 1200000,
  "retencion": 30000,
  "pronto_pago": 20000,
  "descuentos_adicionales": 50000,
  "pagos_partidos": [
    { "metodo": "Pago Banco", "monto": 500000 },
    { "metodo": "Pago Tobías", "monto": 600000 }
  ]
}
```

### Para pago múltiple:
```json
{
  "proveedor_unico": "XYZ Ltda.",
  "total_original": 5000000,
  "facturas": [
    {
      "id": "uuid-1",
      "numero": "12345",
      "proveedor": "XYZ Ltda.",
      "total_original": 1000000,
      "total_pagado": 950000,
      "descuentos": 50000
    },
    { ... }
  ]
}
```

---

## ✅ **Testing**

### Pruebas a realizar:

1. **Pago individual:**
   - [ ] Pagar una factura y verificar que se genera y guarda el PDF
   - [ ] Verificar que aparece el botón de descarga verde
   - [ ] Descargar el comprobante desde la tabla
   - [ ] Verificar que el PDF contiene descuentos adicionales

2. **Pago múltiple:**
   - [ ] Pagar múltiples facturas y verificar guardado
   - [ ] Verificar que todas las facturas tengan acceso al comprobante
   - [ ] Descargar desde cualquier factura del grupo

3. **Casos especiales:**
   - [ ] Factura sin comprobante (no mostrar error al hacer click)
   - [ ] Verificar permisos RLS (usuarios solo ven sus comprobantes)
   - [ ] Probar con descuentos adicionales

---

## 🚀 **Mejoras Futuras**

- [ ] Vista previa del comprobante antes de descargar
- [ ] Listado de todos los comprobantes en una sección dedicada
- [ ] Envío de comprobantes por email
- [ ] Re-generación de comprobantes si hay cambios
- [ ] Estadísticas de comprobantes generados
- [ ] Búsqueda y filtrado avanzado de comprobantes

---

## 📝 **Notas Importantes**

1. **Storage**: Los PDFs se guardan en el bucket `facturas-pdf` bajo la carpeta `comprobantes-pago/`

2. **Nombres de archivo**: Incluyen timestamp para evitar colisiones:
   - Individual: `Pago_ProveedorName_FacturaNum_timestamp.pdf`
   - Múltiple: `Pago_Multiple_timestamp_N_facturas.pdf`

3. **Seguridad**:
   - RLS habilitado en tabla `comprobantes_pago`
   - URLs firmadas con expiración de 1 hora
   - Solo el propietario puede acceder a sus comprobantes

4. **Relación con facturas**:
   - Un comprobante puede tener **1 o más facturas**
   - Una factura puede tener **múltiples comprobantes** (si se re-paga)
   - Siempre se obtiene el comprobante más reciente

5. **Reversión de pagos**:
   - `comprobantes_pago.estado` es `activo` o `reversado` (soft-delete: nunca se borra el comprobante).
   - Toda lectura de comprobantes debe filtrar `.eq('estado', 'activo')`.
   - Se reversa con la RPC `reversar_pago` (hook `useReversarPago`, diálogo `ReversarPagoDialog`, botón en Mercancía/Gastos pagados). Un pago múltiple se reversa completo.
   - Quedan guardados `reversado_at`, `reversado_por`, `motivo_reversion` y `snapshot_reversion`.

---

**Desarrollado con ❤️ para el sistema de gestión de facturas Ferrotodo**
