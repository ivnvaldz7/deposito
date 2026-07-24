# Auditoría del Proyecto - Julio 2026

## 1. Objetivo
Realizar una revisión integral del proyecto para detectar contradicciones entre documentación, código y configuración, recuperar el build del frontend, estandarizar las convenciones del JWT (particularmente para el módulo `ale-bet`), resolver fallos masivos en la suite de testing, y evaluar estrategias críticas como la concurrencia en la base de datos y la exposición de la autenticación local.

## 2. Alcance
- **Módulos:** `@platform/client`, `@platform/server` (específicamente rutas de auth, dashboard, ale-bet y middlewares).
- **Documentos:** `ARCHITECTURE.md`, `CONTEXT.md`, `STAGING.md`, `PRD.md`.
- **Comandos:** `npm run build`, `npm run typecheck`, `npm run test`.
- **Flujos:** Autenticación (Google OAuth vs Local), Generación de JWT, Renderizado de Dashboard, Flujo de Ordenes de Producción, Movimientos de Stock y Testing.

## 3. Estado de la revisión
- **En curso**

## 4. Línea de tiempo

### Fase 1: Recuperación del Build del Frontend
* **Fecha:** 24 de Julio, 2026
* **Objetivo:** Resolver los errores de compilación (`tsc`) del cliente web sin comprometer la seguridad de tipos, sin agregar propiedades opcionales arbitrariamente y sin silenciar errores que pudieran afectar el payload en runtime.
* **Verificaciones realizadas:** Búsqueda en servidor de tipos originales (ej. `DashboardStats`, `OrdenProduccion`, Prisma Enums), inspección de uso de interfaces en las vistas.
* **Comandos ejecutados:**
  - `npm --workspace @platform/client run build`
  - `npm --workspace @platform/client run typecheck`
  - `npm --workspace @platform/client run test`
* **Resultado:** Build y Typecheck exitosos. Se corrigieron los errores formales de TS, y se resolvió un fallo de casteo en runtime para `Mercado`.
* **Cambios aplicados:** Refactorización y centralización de tipos en `use-dashboard.ts`, `use-estuches.ts`, `use-etiquetas.ts`, `use-ordenes.ts`, `use-pendientes.ts`. Sustitución de `(api.get as any)` por `vi.mocked(api.get)` en tests. Corrección de strings sueltos en `toast.ts`.
* **Problemas pendientes:** La suite de tests arroja 61 fallos debido a la ausencia de `QueryClientProvider` en el entorno de pruebas, lo cual debe abordarse en la Fase 3.

## 5. Hallazgos

### REV-001
* **Título:** Inconsistencia masiva en la suite de tests del cliente por falta de `QueryClientProvider`
* **Severidad:** Alta
* **Estado:** Pendiente (Asignado a Fase 3)
* **Descripción:** Tras la normalización estricta de tipos de las queries (React Query), 19 archivos de tests (61 tests individuales) pasaron a fallar lanzando `Error: No QueryClient set, use QueryClientProvider to set one`.
* **Evidencia:** Ejecución de `npm --workspace @platform/client run test`.
* **Rutas y símbolos relacionados:** Todos los componentes de página del frontend (ej. `ActaNuevaPage.tsx`, `EstuchesPage.tsx`) y sus respectivos `__tests__`.
* **Causa raíz:** Vitest está renderizando los componentes de React que hacen uso de `useQuery` o `useMutation` sin inyectar el Provider global de `react-query` en el DOM virtual.
* **Impacto:** Suite de frontend inutilizable, impidiendo prácticas de TDD o CI confiable.
* **Corrección aplicada o propuesta:** Configurar un decorador global en `setupTests.ts` o crear un `renderWithProviders` genérico en utils de testing.
* **Forma de validación:** `npm --workspace @platform/client run test` debe reportar 100% de éxito.

### REV-002
* **Título:** Inconsistencia en la representación del identificador de aplicación `ale-bet` en el payload del JWT
* **Severidad:** Media
* **Estado:** Requiere decisión (Fase 2)
* **Descripción:** La base de datos (Prisma Enum `AppId`) registra la app como `ale_bet` (con guión bajo). Sin embargo, los generadores de JWT (`login-local.ts`, `refresh.ts`, `google.ts`) mutan este valor usando `.replace('_', '-')` a `ale-bet`. El middleware `requireApp` se llama con `ale-bet` y funciona, pero los handlers internos de las rutas y los fixtures de testing intentan acceder a `req.user.apps['ale_bet']` (con guión bajo), lo que en producción devuelve `undefined`.
* **Evidencia:** 
  - `login-local.ts` línea 85.
  - `apps/platform/server/src/routes/ale-bet/pedidos.ts` línea 190.
  - Fixtures en `__tests__/ale-bet.test.ts`.
* **Rutas y símbolos relacionados:** `apps/platform/server/src/routes/auth/`, `apps/platform/server/src/routes/ale-bet/`.
* **Causa raíz:** Desalineación entre la capa de emisión de JWT, el middleware de chequeo, y el consumo interno de roles de la lógica de negocio.
* **Impacto:** Los endpoints internos fallarán silenciosamente u omitirán permisos al no encontrar el objeto `ale_bet` en el request context en producción, aunque pasen en los tests gracias a mocks incorrectos.
* **Corrección aplicada o propuesta:** Decidir cuál es la fuente de verdad. Si es el JWT, los handlers deben usar `['ale-bet']` y los tests actualizarse. Si es la DB, el generador no debe hacer el replace.
* **Forma de validación:** Búsqueda exhaustiva del uso de `['ale_bet']` y `['ale-bet']` en código y tests. Ejecutar suite de backend post-corrección.

## 6. Cambios realizados

| ID | Archivo | Cambio | Motivo | Validación | Estado |
| -- | ------- | ------ | ------ | ---------- | ------ |
| C-001 | `use-dashboard.ts` | Definición de interfaces estrictas extraídas del payload real de `/stats` | Fallo de build por objetos sin tipar en `DashboardPage` | `npm run typecheck` en client | Corregido |
| C-002 | `use-ordenes.ts` | Corrección de `OrdenProduccion` para requerir objeto `solicitante` en vez de strings y tipar Enums | Tipos divergentes respecto a las consultas a BD | `npm run typecheck` en client | Corregido |
| C-003 | `OrdenesPage.tsx` | Inyección de tipo exacto en `submit` y casteo explícito de `data.mercado as Mercado` | TS quejándose por falta de mapeo explícito de Payload | `npm run build` en client | Corregido |
| C-004 | `use-estuches.ts` | Adaptar payload de mutation a `{ articulo, cantidad, mercado: Mercado }` | Endpoint requiere saber a qué mercado va dirigido | `npm run build` en client | Corregido |
| C-005 | `toast.ts` | Actualización de `TOAST_COLORS.style` de string plano a objeto JSX `React.CSSProperties` | React falla en Runtime por atributo `style` mal formado | Ejecución app local | Corregido |
| C-006 | `ActaNuevaPage.test.tsx` | Sustituir `as any` por `vi.mocked` en `api.get` | Recuperar tipado y compatibilidad con Vitest | `npm run typecheck` en client | Corregido |

## 7. Verificaciones

| Comando | Directorio | Resultado | Observaciones |
| ------- | ---------- | --------- | ------------- |
| `npm run typecheck` | `@platform/client` | Exitoso | Todos los errores TS corregidos en Fase 1 |
| `npm run build` | `@platform/client` | Exitoso | Genera dist/ correctamente |
| `npm run test` | `@platform/client` | 61 fallos | Múltiples errores por falta de `QueryClientProvider` en el render. Documentado en REV-001 |

## 8. Decisiones pendientes

* **Convención del JWT (ale_bet vs ale-bet):** Es necesario decidir si se actualizan los handlers internos del backend y los tests para que consuman `ale-bet` (alineado al JWT emitido), o si se elimina la mutación en la autenticación para que todo consuma `ale_bet` (alineado a Prisma).
* **Entorno de Tests del Frontend:** Decidir el enfoque a aplicar (decorador global vs render wrapper personalizado) para inicializar los Providers requeridos por React Query.
* **Estrategia de concurrencia del inventario:** Evaluar estrategia de bloqueos (Fase 5).
* **Autenticación local frente a Google OAuth en producción:** Evaluar exposición en producción (Fase 4).

## 9. Riesgos residuales
* Falsos positivos en tests del backend que asumen payloads de JWT incorrectos, ocultando el error real (REV-002).
* Suite de test frontend no operativa al 100% hasta concluir la Fase 3, lo cual nos deja a ciegas ante regresiones funcionales en React.

## 10. Próximos pasos
1. **Decisión Fase 2:** El usuario debe elegir el estándar canónico para el JWT de `ale-bet` para aplicar y documentar la corrección formal en código y tests.
2. **Ejecución Fase 3:** Arreglar el setup global de Vitest para reactivar la suite de frontend (`QueryClientProvider`).
3. **Auditoría Fase 4:** Evaluar las rutas de autenticación local.
4. **Auditoría Fase 5:** Evaluar bloqueos de base de datos para movimientos de stock.
