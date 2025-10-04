# Sistema de Gestión de Facturas - Ferrotodo

## 📋 Descripción

Sistema integral de gestión de facturas desarrollado con React, TypeScript y Supabase. Permite administrar facturas de proveedores, clasificarlas, gestionar pagos, generar informes y realizar seguimiento de pagos próximos.

## 🚀 Características Principales

### 1. **Gestión de Facturas**
- Creación manual de facturas
- Carga masiva desde archivos PDF
- Clasificación automática y manual de facturas
- Edición completa de datos de facturas
- Visualización de PDFs integrada
- Sistema de numeración de series

### 2. **Clasificación de Facturas**
- **Mercancía**: Facturas relacionadas con productos
- **Gastos**: Facturas de servicios y gastos operativos
- **Sistematizadas**: Facturas procesadas y organizadas
- **Notas de Crédito**: Gestión de devoluciones y ajustes
- **Sin Clasificar**: Facturas pendientes de clasificación

### 3. **Gestión de Pagos**
- Registro de pagos individuales y múltiples
- Métodos de pago: Tobías, Banco, Caja
- Gestión de pronto pago con porcentajes
- Cálculo automático de retenciones
- Seguimiento de fechas de vencimiento

### 4. **Informes Avanzados**
- **Filtros combinados**:
  - Búsqueda por proveedor, factura o NIT
  - Rango de fechas
  - Tipo (Mercancía/Gastos/Sistematizada)
  - Estado de pago
  - Método de pago
  - Rango de montos
  - Estado de ingreso al sistema

- **Estadísticas**:
  - Total de facturas y montos
  - Totales pagados (oficial y real)
  - Total pendiente
  - Desglose por métodos de pago con ahorro
  - Pronto pago utilizado y no utilizado
  - Retenciones e impuestos

- **Exportación**:
  - Exportar a Excel con selección múltiple
  - Datos completos incluyendo cálculos

### 5. **Pagos Próximos**
- **Clasificación por urgencia**:
  - 🔴 **Vencidas**: Facturas con fecha vencida
  - 🟠 **Urgentes**: Vencimiento ≤3 días
  - 🟡 **Próximas**: Vencimiento ≤7 días
  - 🟢 **Al día**: Vencimiento >7 días

- **Totales por periodo**:
  - A pagar este mes (incluye vencidas)
  - Meses próximos
  - Sin fecha de vencimiento

- **Indicadores**:
  - IVA incluido por periodo
  - Valor total por categoría de urgencia

### 6. **Características Adicionales**
- Sistema de navegación intuitivo
- Búsqueda global de facturas
- Highlight automático al navegar a facturas específicas
- Edición inline de números de serie
- Actualización en tiempo real
- Modo claro/oscuro
- Responsive design

## 🛠️ Tecnologías

- **Frontend**:
  - React 18
  - TypeScript
  - Vite
  - Tailwind CSS
  - shadcn/ui

- **Backend**:
  - Supabase (PostgreSQL)
  - Supabase Storage (PDFs)
  - Real-time subscriptions

- **Librerías**:
  - React Router (navegación)
  - XLSX (exportación Excel)
  - Lucide React (iconos)
  - date-fns (manejo de fechas)

## 📁 Estructura del Proyecto

```
src/
├── components/          # Componentes reutilizables
│   ├── ui/             # Componentes de UI (shadcn)
│   ├── AppSidebar.tsx  # Barra lateral de navegación
│   ├── ModernLayout.tsx # Layout principal
│   ├── PDFViewer.tsx   # Visor de PDFs
│   ├── FacturasTable.tsx # Tabla de facturas
│   └── [otros componentes de diálogos]
│
├── pages/              # Páginas principales
│   ├── Auth.tsx        # Autenticación
│   ├── Dashboard.tsx   # Panel principal
│   ├── Informes.tsx    # Informes avanzados
│   ├── PagosProximos.tsx # Pagos próximos
│   ├── MercanciaPendiente.tsx
│   ├── MercanciaPagada.tsx
│   ├── GastosPendientes.tsx
│   ├── GastosPagados.tsx
│   ├── SinClasificar.tsx
│   ├── Sistematizadas.tsx
│   ├── NotasCredito.tsx
│   └── FacturasPorSerie.tsx
│
├── hooks/              # Custom hooks
│   └── useAuth.tsx     # Autenticación
│
├── utils/              # Utilidades
│   ├── calcularValorReal.ts # Cálculos de valores
│   └── serieNumberSuggestion.ts
│
└── integrations/       # Integraciones
    └── supabase/       # Cliente de Supabase
```

## 🗄️ Modelo de Datos

### Tabla `facturas`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `numero_factura` | String | Número de factura |
| `numero_serie` | String | Número de serie ordenable |
| `emisor_nombre` | String | Nombre del proveedor |
| `emisor_nit` | String | NIT del proveedor |
| `total_a_pagar` | Number | Total oficial de la factura |
| `valor_real_a_pagar` | Number | Valor real después de descuentos |
| `clasificacion` | String | Clasificación de la factura |
| `clasificacion_original` | String | Clasificación original |
| `estado_mercancia` | String | pagada/pendiente |
| `metodo_pago` | String | Pago Tobías/Pago Banco/Caja |
| `factura_iva` | Number | IVA de la factura |
| `total_sin_iva` | Number | Total sin IVA |
| `uso_pronto_pago` | Boolean | Si usó pronto pago |
| `porcentaje_pronto_pago` | Number | % de descuento |
| `tiene_retencion` | Boolean | Si tiene retención |
| `monto_retencion` | Number | Monto de retención |
| `fecha_emision` | Date | Fecha de emisión |
| `fecha_vencimiento` | Date | Fecha de vencimiento |
| `fecha_pago` | Date | Fecha de pago |
| `pdf_file_path` | String | Ruta del PDF en storage |
| `ingresado_sistema` | Boolean | Si fue ingresado al sistema |

## 🔐 Autenticación

El sistema utiliza Supabase Auth para la gestión de usuarios:
- Login con email y contraseña
- Sesiones persistentes
- Protección de rutas privadas

## 💡 Funcionalidades Clave

### Cálculo de Valores Reales

El sistema calcula automáticamente el valor real a pagar considerando:

```typescript
valor_real_a_pagar = total_sin_iva
                   - descuento_pronto_pago
                   - retencion
                   + IVA
```

### Filtros Combinados

Los filtros se aplican de forma acumulativa:
1. Búsqueda por texto
2. Rango de fechas (comparación de strings para evitar problemas de zona horaria)
3. Proveedor
4. Tipo/Clasificación
5. Estado de pago
6. Método de pago
7. Rango de montos
8. Estado de ingreso al sistema

### Desglose de Ahorro

Para cada método de pago se muestra:
- **Valor Oficial**: Suma de `total_a_pagar`
- **Valor Pagado**: Suma de `valor_real_a_pagar`
- **Ahorro Total**: Diferencia entre oficial y pagado
- **Desglose**:
  - Ahorro por pronto pago
  - Ahorro por retenciones

## 🚀 Instalación y Configuración

### Prerequisitos

- Node.js 18+ y npm
- Cuenta de Supabase

### Pasos de Instalación

1. **Clonar el repositorio**
```bash
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**

Crear archivo `.env` con:
```env
VITE_SUPABASE_URL=tu_supabase_url
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
```

4. **Configurar Supabase**

Ejecutar las migraciones de base de datos incluidas en el proyecto.

5. **Iniciar servidor de desarrollo**
```bash
npm run dev
```

## 📊 Uso del Sistema

### 1. Crear una Factura

1. Ir a "Sin Clasificar"
2. Click en "Nueva Factura"
3. Ingresar datos manualmente o subir PDF
4. Guardar

### 2. Clasificar Facturas

1. Seleccionar factura en "Sin Clasificar"
2. Click en "Clasificar"
3. Elegir tipo: Mercancía o Gastos
4. Asignar estado: Pendiente o Pagada
5. Confirmar

### 3. Registrar Pago

1. Ir a la sección correspondiente (Mercancía/Gastos Pendientes)
2. Click en el ícono de pago
3. Ingresar:
   - Método de pago
   - Fecha de pago
   - Uso de pronto pago (opcional)
   - Retenciones (opcional)
4. Confirmar

### 4. Generar Informes

1. Ir a "Informes"
2. Aplicar filtros deseados
3. Seleccionar facturas para exportar
4. Click en "Exportar Excel"

### 5. Revisar Pagos Próximos

1. Ir a "Pagos Próximos"
2. Ver facturas organizadas por urgencia
3. Revisar totales por periodo
4. Planificar pagos

## 🎨 Características de UI/UX

- **Tema**: Modo claro/oscuro
- **Navegación**: Sidebar colapsable con íconos
- **Tablas**: Ordenables, selección múltiple
- **Búsqueda**: Global con highlight
- **Feedback**: Toasts para acciones
- **Loading**: States para mejor UX
- **Responsive**: Adaptado a móvil y desktop

## 🔄 Actualizaciones en Tiempo Real

El sistema se actualiza automáticamente cuando hay cambios en:
- Facturas
- Pagos
- Clasificaciones

Usando Supabase Real-time subscriptions.

## 📈 Roadmap Futuro

- [ ] Dashboard con gráficos
- [ ] Reportes personalizados
- [ ] Integración con sistemas contables
- [ ] Notificaciones de vencimientos
- [ ] Gestión de proveedores
- [ ] Historial de cambios
- [ ] API REST

## 🤝 Contribuir

1. Fork el proyecto
2. Crear rama de feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📝 Licencia

Este proyecto es privado y confidencial.

## 📧 Contacto

Para soporte o consultas, contactar al equipo de desarrollo.

---

**Desarrollado con ❤️ usando React + TypeScript + Supabase**
