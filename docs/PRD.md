# PRD — Sistema de Gestión de Depósito de Laboratorio

> **Estado:** Borrador v1 — Pendiente revisión del stakeholder
> **Fecha:** 31/03/2026
> **Autor:** Ivan (Encargado de depósito + Developer)

---

## 1. Visión del Producto

Reemplazar el sistema actual basado en planillas Excel por una plataforma web que centralice la gestión operativa de laboratorios veterinarios. El sistema tiene un concepto central: el **Acta Inteligente** — un hub operativo desde donde se registran ingresos y se distribuye mercadería al inventario en tiempo real, con trazabilidad completa.

No es solo una app de stock. Es un **sistema operativo para laboratorios veterinarios** que formaliza procesos informales (pedidos por WhatsApp, descuentos de memoria, planillas desactualizadas) y se complementa con Ale-Bet Manager (logística) para ofrecer una solución integral.

**Visión comercial:** Producto SaaS vendible a laboratorios veterinarios en Argentina y LATAM. Primer usuario: el propio desarrollador (encargado de depósito). Escalable a múltiples clientes con arquitectura multi-tenant. A largo plazo, ambos sistemas (depósito + logística) se unifican bajo una marca paraguas como módulos de un ecosistema completo.

---

## 2. Usuarios y Roles

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| **Encargado** | Operador principal del depósito (Ivan). Gestiona ingresos, stock, actas, aprobaciones. | CRUD completo en todo el sistema |
| **Observador** | Personal de producción, supervisores. Consultan stock y reciben notificaciones. | Solo lectura. Panel de notificaciones. Consultas de stock. |
| **Solicitante** | Personal de producción que necesita insumos. Genera pedidos/órdenes. | Crear órdenes de producción. Ver estado de sus pedidos. Lectura de stock. |

**Escala inicial:** ~5-10 usuarios. Encargado desde PC, observadores y solicitantes desde celular y PC.

---

## 3. Módulos del Sistema

### 3.1 Acta Inteligente (Hub Central)

El corazón del sistema. Todo ingreso de mercadería pasa por el acta.

**Flujo principal:**
1. Llega mercadería al depósito
2. Encargado crea un acta: fecha, producto, lote, cantidad
3. Desde el acta, decide la distribución:
   - Enviar todo al inventario correspondiente
   - Enviar parcial (si ya se necesita una parte)
   - Dividir entre varios destinos
4. El stock se actualiza en el momento de la decisión
5. Observadores reciben notificación del ingreso en tiempo real

**Datos del acta:**
- Fecha de ingreso
- Producto (nombre + categoría: droga, estuche, etiqueta, frasco)
- Lote
- Cantidad ingresada
- Cantidad distribuida vs. cantidad pendiente
- Estado: pendiente | parcial | completada
- Extensible: campos de control de calidad (fase 2)

**Regla clave:** La cantidad en stock nunca se actualiza sin pasar por un acta o un ajuste manual justificado. Trazabilidad total.

### 3.2 Inventario — Drogas (Materias Primas)

Principios activos y excipientes del laboratorio.

**Datos:**
- Nombre del producto
- Cantidad actual
- **Fase 2:** Lote, fecha de vencimiento, gestión FIFO

**FIFO (Fase 2):** Al descontar drogas, el sistema selecciona automáticamente el lote con vencimiento más próximo. El encargado puede override manual con justificación.

**Productos actuales:** ~50 drogas (Ácido Cítrico, ATP, Vitaminas, etc.)

### 3.3 Inventario — Estuches

Packaging de producto terminado, separado por mercado de destino.

**Mercados:** Argentina, Colombia, México, Ecuador, Bolivia, Paraguay + No Exportable

**Datos:**
- Artículo (nombre del producto + presentación)
- Cantidad actual
- Mercado de destino

**Descuento:**
- Por orden de producción (flujo formal)
- Ajuste manual con justificación (imprevistos)

**Productos actuales:** ~40 artículos en Argentina + variantes por mercado

### 3.4 Inventario — Etiquetas

Misma lógica que estuches. Separado por mercado.

**Mercados:** Argentina, Colombia, México, Ecuador, Bolivia, Paraguay

**Datos y descuento:** Idéntico a estuches.

**Productos actuales:** ~45 artículos en Argentina + variantes por mercado

### 3.5 Inventario — Frascos (Envases)

Envases físicos para producto terminado.

**Datos:**
- Artículo (tipo + capacidad: "Dorado 250 ML", "PVC 100 ML")
- Unidades por frasco/caja
- Cantidad de cajas/frascos
- Total calculado (unidades × cantidad)

**Productos actuales:** ~20 tipos de frasco

### 3.6 Órdenes de Producción

Formalización del proceso de pedido que hoy es por WhatsApp.

**Flujo:**
1. **Solicitante** crea orden desde su celular: producto, cantidad, categoría (estuche/etiqueta/droga/frasco), urgencia
2. **Encargado** recibe notificación en su panel
3. Encargado revisa disponibilidad, aprueba/rechaza/ajusta
4. Al aprobar, el descuento se ejecuta automáticamente en el inventario correspondiente
5. Queda registro: quién pidió, cuándo, cuánto, quién aprobó, de qué lote se descontó

**Estados de orden:** solicitada → aprobada → ejecutada → completada | rechazada

### 3.7 Panel de Notificaciones

Feed en tiempo real para observadores y solicitantes.

**Eventos notificados:**
- Nuevo ingreso registrado en acta
- Stock distribuido desde acta
- Orden de producción creada/aprobada/rechazada
- Alertas de stock bajo (threshold configurable)
- **Fase 2:** Alertas de vencimiento próximo

### 3.8 Command Palette — Buscador Global (⌘K)

Buscador omnipresente estilo Spotlight/⌘K que navega todas las categorías de inventario y permite ejecutar acciones directas desde el resultado.

**Acceso:** Shortcut ⌘K (desktop) + botón flotante (mobile). Disponible desde cualquier pantalla.

**Búsqueda inteligente:**
- **Fuzzy matching:** "comp b 100" → "Complejo B B12 B15 100 ML". Fragmentos en cualquier orden, sin necesidad de nombre completo.
- **Frecuencia de uso:** productos más usados aparecen primero. El índice se actualiza con cada interacción.
- **Recientes:** últimas 10 búsquedas aparecen al abrir el palette, antes de escribir nada.
- **Alias/shortcuts (opcional):** códigos cortos configurables por el encargado. "OLI5" = Olivitasan 500ml, "CB100" = Complejo B B12 B15 100ml.
- **Contexto adaptativo:** si estás en la sección de estuches, prioriza estuches. Desde el acta, busca en todo.

**Acciones contextuales por resultado:**
- **Ver** → stock actual con lote, categoría y mercado (si aplica)
- **Ingresar** → abre acta rápida pre-cargada con ese producto
- **Descontar** → descuento rápido con justificación obligatoria
- **Historial** → últimos movimientos de ese producto

**Modo consulta/métricas:**
El command palette también funciona como interfaz de consulta. Ejemplos de queries:
- "ingresos marzo 2026" → resumen de todos los ingresos del período
- "ingresos 01/03 - 31/03" → filtro por rango de fechas
- "egresos drogas semana" → movimientos de salida de la semana

Desde el resultado de la consulta: botón **Exportar a PDF** que genera un reporte con los datos filtrados (fechas, productos, cantidades, lotes, responsable).

**Implementación:** `cmdk` (de Pacocoursey, mismo autor de shadcn) + `fuse.js` para fuzzy search local. Índice de frecuencia persistido en localStorage. Generación de PDF con librería server-side (ej: `pdfkit` o `@react-pdf/renderer`).

**Filosofía:** El acta inteligente es el flujo formal y completo. El command palette es el atajo operativo del día a día. Buscar, actuar y consultar en un solo lugar, sin navegar menús.

### 3.9 Métricas de Ingresos

Panel de métricas y reportes sobre actividad del depósito.

**Datos disponibles:**
- Total de ingresos por período (día, semana, mes, rango personalizado)
- Ingresos por categoría (drogas, estuches, etiquetas, frascos)
- Productos más ingresados
- Productos más solicitados por producción
- Movimientos totales (ingresos vs egresos)

**Acceso:** Desde el dashboard principal y desde el command palette (modo consulta).

**Exportación:** PDF descargable con los datos filtrados, formateado para impresión o archivo digital.

### 3.10 Panel de Insumos Pendientes

Seguimiento de materiales pedidos que aún no ingresaron al depósito. Aplica especialmente a frascos que pasan por planta de esterilización.

**Flujo de frascos con esterilización:**
1. Se envían frascos a planta de esterilización → estado **"en esterilización"**
2. Frascos vuelven esterilizados → estado **"recibido / listo para ingreso"**
3. Encargado los ingresa por acta → salen del panel de pendientes y entran al inventario

**Datos del insumo pendiente:**
- Producto (artículo + categoría)
- Cantidad enviada
- Destino (planta de esterilización u otro)
- Fecha de envío
- Estado: en esterilización | recibido / listo para ingreso
- Fecha estimada de retorno (opcional)
- Notas

**Visibilidad:** El panel muestra en todo momento qué hay afuera del depósito y en qué estado está. Los observadores también pueden ver este panel.

**Relación con el acta:** Cuando un insumo pendiente cambia a "recibido", el sistema sugiere crear un acta de ingreso pre-cargada con los datos del pendiente.

---

## 4. Stack Técnico

### Frontend
- **React 18+** con Vite como bundler
- **Zustand** para estado global
- **React Router** para navegación
- **TailwindCSS** para estilos
- **shadcn/ui** como component library (accesible, Tailwind-native, copy-paste)
- **cmdk** para command palette (⌘K)
- **fuse.js** para fuzzy search local
- **Modo oscuro** — dark mode nativo con TailwindCSS (toggle claro/oscuro). Funcional para entornos con luz variable (depósito).
- **Mobile-first** — responsive obligatorio
- Deploy: **Vercel**

### Diseño
- **Google Stitch** para design system y prototipado inicial
- **DESIGN.md** exportado desde Stitch como referencia para Claude Code
- **shadcn/ui** como base de componentes (tablas, modals, formularios, dropdowns)

### Backend
- **Node.js + Express**
- **Prisma** como ORM
- **PostgreSQL** como base de datos
- **JWT** propio para autenticación
- **SSE (Server-Sent Events)** para notificaciones realtime a observadores
- Deploy: **Railway** (servidor + base de datos)

### Herramientas de desarrollo
- **Engram** — memoria persistente entre sesiones de Claude Code
- **Documentación:** PRD.md, CONTEXT.md, CLAUDE.md, README.md, DECISIONS.md
- **Commits:** en español
- **TypeScript** en frontend y backend

---

## 5. Modelo de Datos (Borrador)

### users
```
id            UUID PK
email         VARCHAR UNIQUE
password_hash VARCHAR
name          VARCHAR
role          ENUM('encargado', 'observador', 'solicitante')
created_at    TIMESTAMP
```

### actas
```
id            UUID PK
fecha         DATE
created_by    UUID FK → users
estado        ENUM('pendiente', 'parcial', 'completada')
notas         TEXT nullable
created_at    TIMESTAMP
updated_at    TIMESTAMP
```

### acta_items
```
id                UUID PK
acta_id           UUID FK → actas
categoria         ENUM('droga', 'estuche', 'etiqueta', 'frasco')
producto_nombre   VARCHAR
lote              VARCHAR
cantidad_ingresada  INTEGER
cantidad_distribuida INTEGER DEFAULT 0
created_at        TIMESTAMP
```

### inventario_drogas
```
id            UUID PK
nombre        VARCHAR
cantidad      INTEGER
-- Fase 2:
-- lote        VARCHAR
-- vencimiento DATE
updated_at    TIMESTAMP
```

### inventario_estuches
```
id            UUID PK
articulo      VARCHAR
mercado       ENUM('argentina', 'colombia', 'mexico', 'ecuador', 'bolivia', 'paraguay', 'no_exportable')
cantidad      INTEGER
updated_at    TIMESTAMP
```

### inventario_etiquetas
```
id            UUID PK
articulo      VARCHAR
mercado       ENUM('argentina', 'colombia', 'mexico', 'ecuador', 'bolivia', 'paraguay')
cantidad      INTEGER
updated_at    TIMESTAMP
```

### inventario_frascos
```
id              UUID PK
articulo        VARCHAR
unidades_por_caja INTEGER
cantidad_cajas  INTEGER
total           INTEGER  -- calculado: unidades_por_caja × cantidad_cajas
updated_at      TIMESTAMP
```

### ordenes_produccion
```
id              UUID PK
solicitante_id  UUID FK → users
aprobado_por    UUID FK → users nullable
categoria       ENUM('droga', 'estuche', 'etiqueta', 'frasco')
producto_nombre VARCHAR
cantidad        INTEGER
urgencia        ENUM('normal', 'urgente')
estado          ENUM('solicitada', 'aprobada', 'ejecutada', 'completada', 'rechazada')
motivo_rechazo  TEXT nullable
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### movimientos
```
id              UUID PK
tipo            ENUM('ingreso_acta', 'egreso_orden', 'ajuste_manual')
categoria       ENUM('droga', 'estuche', 'etiqueta', 'frasco')
producto_nombre VARCHAR
cantidad        INTEGER  -- positivo = ingreso, negativo = egreso
referencia_id   UUID nullable  -- FK a acta_item u orden según tipo
justificacion   TEXT nullable  -- obligatorio para ajuste_manual
created_by      UUID FK → users
created_at      TIMESTAMP
```

### insumos_pendientes
```
id              UUID PK
categoria       ENUM('frasco')  -- extensible a otras categorías si se necesita
articulo        VARCHAR
cantidad        INTEGER
destino         VARCHAR  -- ej: "Planta de esterilización"
estado          ENUM('en_esterilizacion', 'recibido')
fecha_envio     DATE
fecha_retorno_estimada DATE nullable
fecha_recibido  DATE nullable
notas           TEXT nullable
created_by      UUID FK → users
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

---

## 6. Fases de Desarrollo

### Fase 1 — MVP: Drogas + Acta Inteligente + Command Palette
**Objetivo:** Validar la arquitectura y el flujo del acta con el módulo más simple.

- [ ] Setup proyecto (monorepo, Prisma, auth JWT)
- [ ] Design system en Google Stitch → exportar DESIGN.md
- [ ] Modo oscuro (dark/light toggle)
- [ ] CRUD de drogas (nombre + cantidad)
- [ ] Acta inteligente: crear acta → agregar items → distribuir a inventario
- [ ] Command palette (⌘K) con fuzzy search sobre drogas
- [ ] Dashboard con vista de stock de drogas
- [ ] Auth básico (login, registro de encargado)
- [ ] Tabla de movimientos (auditoría)
- [ ] Deploy a Vercel + Railway
- [ ] Configurar Engram para el proyecto

### Fase 2 — Estuches, Etiquetas, Frascos
- [ ] CRUD de estuches (con filtro por mercado)
- [ ] CRUD de etiquetas (con filtro por mercado)
- [ ] CRUD de frascos (con cálculo de total)
- [ ] Acta inteligente extendida a todas las categorías
- [ ] Command palette extendido a todas las categorías
- [ ] Panel de insumos pendientes (frascos en esterilización)
- [ ] Vinculación pendiente recibido → acta de ingreso pre-cargada

### Fase 3 — Órdenes de Producción + Roles
- [ ] Registro de observadores y solicitantes
- [ ] Flujo de orden de producción (solicitar → aprobar → ejecutar)
- [ ] SSE para notificaciones realtime
- [ ] Panel de notificaciones para observadores
- [ ] Mobile-optimized para solicitantes

### Fase 4 — Métricas + FIFO + Control de Calidad
- [ ] Métricas de ingresos (panel + command palette modo consulta)
- [ ] Exportación a PDF de reportes por rango de fechas
- [ ] Drogas: agregar lote + vencimiento
- [ ] Lógica FIFO con override manual
- [ ] Alertas de vencimiento próximo
- [ ] Campos de control de calidad en actas

### Fase 5 — Producto Comercial
- [ ] Arquitectura multi-tenant (aislamiento de datos por cliente)
- [ ] Importador de Excel para migración de planillas existentes
- [ ] Onboarding guiado (primera experiencia del usuario nuevo)
- [ ] Landing page de venta
- [ ] Integración con Ale-Bet Manager como módulo de logística
- [ ] Multi-ubicación (depósito principal + secundarios + planta esterilización)
- [ ] Logs de auditoría inmutables (quién, qué, cuándo, desde dónde)
- [ ] Backups y exportación completa de datos del cliente

### Fase 6 — Features Premium ($350+ tier)
- [ ] Predicción de consumo basada en histórico ("en 15 días te quedás sin X")
- [ ] Sugerencias de compra automáticas por consumo
- [ ] WhatsApp Business API para notificaciones automáticas
- [ ] Exportación compatible con sistemas contables argentinos
- [ ] API abierta para integraciones del cliente
- [ ] Validación regulatoria de estuches/etiquetas (foto + OCR/IA)
- [ ] Rol Técnico para validación de registros
- [ ] QR para identificación rápida de productos
- [ ] Chat interno
- [ ] Reportes customizados por cliente

---

## 7. Decisiones Arquitectónicas

| Decisión | Elegido | Alternativa descartada | Motivo |
|----------|---------|----------------------|--------|
| Backend | Node + Express | Supabase | Control total, experiencia previa, lógica de negocio compleja |
| ORM | Prisma | Drizzle, SQL raw | Estándar de la industria, tipado automático, buena DX |
| DB | PostgreSQL | MongoDB | Datos altamente relacionales, FIFO con queries ordenados |
| Auth | JWT propio | Clerk/Auth0 | Pocos usuarios, roles simples, sin dependencia externa |
| Realtime | SSE | Socket.io, Polling | Unidireccional (servidor→cliente), simple, sin race conditions |
| State | Zustand | Redux, Context | Ligero, familiar, probado en proyectos anteriores |
| Deploy | Vercel + Railway | Netlify + otro | Consistencia con ChecAR, buen free tier |
| Estilos | TailwindCSS | CSS Modules, Styled Components | Rapid prototyping, mobile-first utilities |
| Componentes | shadcn/ui | Material UI, Chakra, Ant Design | Copy-paste (sin dependencia npm), Tailwind-native, accesible |
| Design System | Google Stitch + DESIGN.md | Figma manual | AI-native, exporta tokens legibles por Claude Code, flujo integrado |
| Buscador | cmdk + fuse.js | Algolia, búsqueda server-side | Local, instantáneo, sin costo, fuzzy matching nativo |
| Memoria dev | Engram standalone | gentle-ai completo, SDD | Solo memoria persistente, sin sub-agentes, sin gasto extra de tokens |

---

## 8. Restricciones y Reglas

- **Commits en español** (convención del desarrollador)
- **Mobile-first** en todo el frontend
- **Sin over-engineering** — no agregar features sin necesidad concreta
- **Trazabilidad total** — todo movimiento de stock tiene origen registrado
- **TypeScript estricto** en frontend y backend
- **Documentación como source of truth** — los 5 archivos de documentación se mantienen actualizados
- **Engram** se usa desde la sesión 1 de Claude Code

---

## 9. Modelo Comercial y Pricing

### Posicionamiento

Sistema operativo integral para laboratorios veterinarios. No se vende como "app de inventario" sino como plataforma que elimina planillas, formaliza procesos y da trazabilidad completa para auditorías. El módulo de depósito se complementa con Ale-Bet Manager (logística) bajo un ecosistema unificado.

### Planes y Precios

**Modelo:** Suscripción mensual o anual (pago anual = 2 meses gratis).

| Plan | Precio mensual | Precio anual | Incluye |
|------|---------------|-------------|---------|
| **Professional** | $200 USD/mes | $2.000 USD/año | Sistema completo (depósito + logística), hasta 10 usuarios, command palette, métricas, exportación PDF, predicción de consumo básica, 1 ubicación, soporte email + WhatsApp |
| **Enterprise** | $350 USD/mes | $3.500 USD/año | Todo Professional + usuarios ilimitados, multi-ubicación, FIFO + validación regulatoria, integraciones (WhatsApp Business, exportación contable), API abierta, onboarding + migración de datos, soporte prioritario con SLA |
| **Enterprise+** | Cotización | Cotización | Todo Enterprise + predicción avanzada con IA, reportes customizados, múltiples laboratorios/plantas bajo una cuenta, account manager dedicado |

### Propuesta de valor por tier

**Professional ($200):** "Eliminá las planillas, formalizá tus procesos, tené visibilidad total de tu depósito y logística en tiempo real."

**Enterprise ($350):** "Trazabilidad completa para auditorías SENASA, control de vencimientos FIFO, y operación multi-sede integrada."

**Enterprise+ (cotización):** "Solución enterprise con inteligencia predictiva y personalización total para laboratorios con operaciones complejas."

### Costos de infraestructura estimados por cliente

- Railway (servidor + PostgreSQL): ~$5-10 USD/mes
- Vercel (frontend): ~$0-5 USD/mes
- WhatsApp Business API (Enterprise): ~$15-25 USD/mes
- **Margen bruto estimado: 85-95%**

### Features necesarias para comercializar

| Feature | Motivo | Fase |
|---------|--------|------|
| Multi-tenant | Aislar datos por cliente, obligatorio para vender | Fase 5 |
| Importador de Excel | Migración de planillas existentes, reduce fricción de entrada | Fase 5 |
| Onboarding guiado | Primera experiencia del usuario, reduce churn | Fase 5 |
| Landing page | Canal de venta | Fase 5 |
| Logs inmutables | Auditoría para regulación (SENASA), genera confianza | Fase 5 |
| Backups/exportación | Requisito legal + confianza del cliente | Fase 5 |
| Multi-ubicación | Feature premium que justifica el salto de precio | Fase 6 |
| WhatsApp Business API | Notificaciones automáticas, alto valor percibido | Fase 6 |
| Predicción de consumo | Diferenciador principal vs competencia genérica | Fase 6 |
