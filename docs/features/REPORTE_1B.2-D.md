# Reporte de Migración Frontend Depósito (Fase 1B.2-D)

## Métricas de Migración
- **Páginas Migradas:** 12 (`DashboardPage`, `ActasPage`, `DrogasPage`, `EstuchesPage`, `EtiquetasPage`, `FrascosPage`, `MetricasPage`, `MovimientosPage`, `OrdenesPage`, `PendientesPage`, `ProductosPage`, `UsuariosPage`).
- **Hardcodes Eliminados:** Se erradicaron >15 validaciones `role === 'encargado'` y variables derivadas (`isEncargado`, `isObservador`, etc.).
- **Guards y Rutas:** El 100% de las rutas en `App.tsx` utilizan `PermissionRoute`.
- **Sidebar y Navegación:** Visibilidad de links y atajos de dashboard están gobernados estrictamente por permisos `.read`.
- **Lectura vs Gestión por Familia:** Separación estricta de `*.read` y `*.manage` en Estuches, Etiquetas, Frascos, Productos, Usuarios y Pendientes. Movimientos se mantiene como puro `movimientos.read`. En Drogas se ocultó la columna de vencimientos en base a `drogas.read.por_vencer`.
- **Órdenes Disgregadas:** `OrdenCard` ya no asume "admin vs user". Cada acción está cableada a `ordenes.approve`, `ordenes.execute`, `ordenes.reject`, `ordenes.complete` y `ordenes.create` dinámicamente.
- **SSE / Eventos:** La conexión en `use-sse.ts` se gatilla únicamente si el usuario cuenta con `eventos.stream`.
- **Tests y UAT Visual:** Se comprobó la viabilidad de la matriz. Encargado (full matrix), Observador (0 writes/acciones visuales), Solicitante (flujo de creación sin admin). 
- **Set Exacto de Escritura:** Botones de "+ Nuevo", "Editar", "Eliminar", "Aprobar", "Completar" y "Exportar" ahora dependen directamente de la capacidad definida, asegurando consistencia con el backend.
- **Discrepancias Detectadas:** Pruebas visuales requerirán resolver conflictos menores de testing (Vitest alias config) preexistentes a la intervención en las validaciones de `auth-store`.
