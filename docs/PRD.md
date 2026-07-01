# PRD — Plataforma

> Product Requirements Document v1.0

## 1. Resumen Ejecutivo

Sistema SaaS de gestión operativa para depósitos de laboratorios veterinarios y farmacéuticos. Unifica control de inventario, gestión de pedidos y administración de usuarios en una plataforma con autenticación centralizada Google OAuth.

**Stack**: React 19 + Express 4 + PostgreSQL + Prisma 7 + Turborepo

## 2. Usuarios Target

| Perfil | Descripción | Módulo |
|--------|-------------|--------|
| Encargado de depósito | Supervisa stock, ingresos y producción | Depósito |
| Solicitante | Solicita materiales para producción | Depósito |
| Vendedor | Gestiona pedidos de clientes | Ale-Bet |
| Armador | Prepara pedidos para despacho | Ale-Bet |
| Admin de plataforma | Gestiona usuarios y permisos | Admin |

## 3. Features por Módulo

### 3.1 Depósito (14 features)

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | Dashboard | KPIs de stock total, por vencer, stock bajo, movimientos del día |
| 2 | Inventario Drogas | CRUD con gestión por lote y fecha de vencimiento |
| 3 | Inventario Estuches | CRUD por mercado de exportación |
| 4 | Inventario Etiquetas | CRUD por mercado de exportación |
| 5 | Inventario Frascos | CRUD con unidades por caja y cantidad de cajas |
| 6 | Catálogo de Productos | Base normalizada de productos con categoría, volumen, mercado |
| 7 | Actas de Ingreso | Creación con items, control de calidad, distribución FIFO |
| 8 | Órdenes de Producción | Workflow completo: solicitar → aprobar → ejecutar → completar |
| 9 | Insumos Pendientes | Seguimiento de materiales enviados a esterilización |
| 10 | Trazabilidad | Historial completo de movimientos con filtros |
| 11 | Reportes | Exportación a PDF y Excel |
| 12 | Eventos SSE | Notificaciones en tiempo real |
| 13 | Gestión de Usuarios | CRUD de usuarios del módulo Depósito |
| 14 | Productos | Catálogo y configuración de productos base |

### 3.2 Ale-Bet (7 features)

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | Dashboard | KPIs de pedidos del día, en armado, stock bajo |
| 2 | Productos | Catálogo con gestión de lotes |
| 3 | Clientes | ABM de clientes |
| 4 | Pedidos | Workflow completo: pendiente → completado/cancelado |
| 5 | Stock | Visión global de stock por producto |
| 6 | Historial | Filtros por fecha, producto, estado + exportación Excel |
| 7 | Notificaciones SSE | Eventos en tiempo real para cambios de estado |

### 3.3 Admin (1 feature)

| # | Feature | Descripción |
|---|---------|-------------|
| 1 | Usuarios | CRUD de PlatformUsers con asignación de apps y roles |

## 4. User Journeys

### Journey 1: Ingreso de Materiales
1. Encargado inicia sesión con Google
2. Navega a `/deposito/ingresos/nueva`
3. Completa datos del acta y agrega items
4. Opcional: realiza control de calidad
5. Distribuye cantidades al inventario (FIFO)
6. Acta pasa a completada automáticamente

### Journey 2: Orden de Producción
1. Solicitante crea orden en `/deposito/ordenes`
2. Encargado recibe notificación y revisa
3. Aprueba o rechaza con motivo
4. Al ejecutar, stock se descuenta automáticamente
5. Orden se completa al entregar materiales

### Journey 3: Pedido Cliente
1. Vendedor crea pedido para cliente en `/ale-bet/pedidos`
2. Pedido se aprueba automática o manualmente
3. Armador ve el pedido en su cola de trabajo
4. Al completar el armado, stock se descuenta
5. Notificación SSE al vendedor

## 5. Roadmap

| Fase | Estado | Alcance |
|------|--------|---------|
| Migración a plataforma unificada | ✅ Completa | Servidores legacy migrados a platform/server |
| Cleanup baseline | ✅ Completa | Repositorio limpio, SDD inicializado |
| Documentación | ⬜ Pendiente | PRD, CONTEXT, ARCHITECTURE, GLOSSARY, AGENTS.md |
| Features | ⬜ Pendiente | Por definir en SDD cycles |

## 6. Métricas de Éxito

- Tiempo promedio de creación de acta < 2 minutos
- Trazabilidad 100% de movimientos de stock
- Cobertura de tests > 80% en módulos core
- TypeScript strict sin errores en build
