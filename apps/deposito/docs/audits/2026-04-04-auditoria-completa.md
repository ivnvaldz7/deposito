# Auditoría: Proyecto completo

**Fecha:** 2026-04-04
**Auditor:** Codex
**Scope:** Auditoría general end-to-end del proyecto (`server/`, `client/`, documentación base y checks de build/lint)

---

## Re-auditoría 2026-04-05
Validación específica de los 5 fixes informados después de la auditoría inicial.

| Fix | Estado | Validación |
|-----|--------|------------|
| Registro protegido | Resuelto | `POST /api/auth/register` ahora exige `authenticate` + `requireRole('encargado')`, ya no acepta `role` en el body y crea siempre usuarios `encargado`. También existe `npm run db:create-admin` para bootstrap controlado. |
| JWT fail-fast | Resuelto | `server/src/index.ts` ahora importa `./lib/env` antes del resto de los módulos, y `server/src/lib/env.ts` ejecuta `dotenv.config()` y aborta el proceso si falta `JWT_SECRET`. El fail-fast quedó cerrado en el arranque. |
| Distribución transaccional | Resuelto | `POST /api/actas/:id/items` ahora rechaza `estuche`/`etiqueta` sin `mercado`, y la distribución ya abortaba cuando faltaba mercado o no existía inventario para `estuche`, `etiqueta` o `frasco`. La invariante quedó cerrada tanto en alta como en distribución. |
| Seeds idempotentes | Resuelto | Los `upsert` de inventario ahora usan `update: {}` para drogas, estuches, etiquetas y frascos. Re-ejecutar el seed ya no borra datos ni sobreescribe stock operativo existente. |
| Lint 0 errores | Resuelto | Los dos focos auditados quedaron corregidos: `command-palette.tsx` ya no lee refs en render y `movimientos-page.tsx` ya no usa el patrón previo de effect + setState síncrono. `npm --prefix client run lint` da 0 errores; quedan 7 warnings en otros módulos. |

---

## 🔴 Crítico (bugs, seguridad)
Issues que deben resolverse antes de seguir.

### Issue 1
- **Archivo:** `server/src/routes/auth.ts`
- **Línea:** ~9-45
- **Estado re-auditoría (2026-04-05):** Resuelto
- **Problema:** `POST /api/auth/register` permite registro anónimo y además fuerza `role: 'encargado'`. Hoy cualquier actor con acceso a la API puede auto-provisionarse un usuario con permisos completos sobre stock, actas y movimientos.
- **Validación re-auditoría:** El endpoint quedó protegido con `authenticate` + `requireRole('encargado')`, ya no toma `role` desde el body y el bootstrap inicial se derivó a `src/scripts/create-admin.ts`.
- **Fix sugerido:** Cerrar el endpoint en producción o protegerlo con bootstrap controlado (primer usuario only, invite token o endpoint autenticado por admin). El rol no debería venir libremente desde el body.

### Issue 2
- **Archivo:** `server/src/lib/jwt.ts`, `server/.env.example`
- **Línea:** `server/src/lib/jwt.ts` ~9-17, `server/.env.example` ~2
- **Estado re-auditoría (2026-04-05):** Resuelto
- **Problema:** Si falta `JWT_SECRET`, el backend arranca igual con el valor conocido `change-me-in-production`. Eso permite forjar tokens válidos y compromete toda la autenticación. El `.env.example` además refuerza ese placeholder como valor operativo.
- **Validación re-auditoría:** El arranque ahora entra por `server/src/index.ts` con `import './lib/env'` al tope, y ese módulo corre `dotenv.config()` antes del resto de los imports y aborta con `process.exit(1)` si no hay `JWT_SECRET`. El fallback inseguro quedó eliminado de forma efectiva.
- **Fix sugerido:** Hacer fail-fast al iniciar si `JWT_SECRET` no existe o sigue con un placeholder inseguro. Rotar el secreto por ambiente y remover cualquier fallback funcional.

### Issue 3
- **Archivo:** `server/src/routes/actas.ts`
- **Línea:** ~19-25, ~129-136, ~184-195, ~210-245
- **Estado re-auditoría (2026-04-05):** Resuelto
- **Problema:** El backend acepta items de `estuche`/`etiqueta` sin `mercado`. Luego, en la distribución, si `item.mercado` es `null`, no actualiza inventario pero igual crea `movimiento`, incrementa `cantidadDistribuida` y puede dejar el acta como `parcial/completada`. Esto rompe la trazabilidad central del sistema.
- **Validación re-auditoría:** `POST /api/actas/:id/items` ahora devuelve `400` si `categoria` es `estuche` o `etiqueta` y `mercado` no está presente. Además, la distribución ya aborta si falta mercado o si el producto no existe en inventario para `estuche`, `etiqueta` o `frasco`. El flujo quedó consistente de punta a punta para este hallazgo.
- **Fix sugerido:** Validar en backend que `mercado` sea obligatorio para `estuche` y `etiqueta`, y abortar la transacción si el item no cumple la invariante antes de registrar movimiento o estado.

### Issue 4
- **Archivo:** `server/src/routes/actas.ts`
- **Línea:** ~196-207, ~210-245
- **Estado re-auditoría (2026-04-05):** Resuelto
- **Problema:** Para `frasco`, la distribución solo actualiza stock si el artículo ya existe en `inventarioFrasco`. Si no existe, la transacción igualmente registra movimiento, marca el item como distribuido y puede cerrar el acta sin haber impactado inventario.
- **Validación re-auditoría:** La distribución ahora busca el frasco en inventario y rechaza la operación con `400` si no existe. Ya no avanza movimiento, `cantidadDistribuida` ni estado del acta sobre stock fantasma.
- **Fix sugerido:** Rechazar la distribución cuando el frasco no exista o hacer `upsert` explícito con los datos necesarios. En cualquier caso, no avanzar con movimiento ni estado si el inventario no se actualizó.

---

## 🟡 Importante (refactor, performance)
Issues que deberían resolverse pronto.

### Issue 1
- **Archivo:** `server/src/routes/actas.ts`
- **Problema:** `POST /api/actas/:id/items` solo valida que el acta exista; no bloquea agregar items a un acta ya `completada`. Eso permite reabrir de facto un ingreso cerrado y deja el estado inconsistente hasta la próxima distribución.
- **Sugerencia:** Impedir altas sobre actas completadas o implementar una transición explícita de reapertura con auditoría.

### Issue 2
- **Archivo:** `server/prisma/seed.ts`
- **Estado re-auditoría (2026-04-05):** Resuelto
- **Problema:** El seed borra inventarios completos con `deleteMany()` antes de recrearlos. En un entorno compartido o con datos reales, re-ejecutarlo destruye stock operativo en vez de ser idempotente.
- **Validación re-auditoría:** Además de haberse eliminado el `deleteMany()`, los `upsert` de estuches, etiquetas y frascos quedaron con `update: {}`. Re-ejecutar el seed solo crea faltantes y ya no pisa cantidades operativas existentes.
- **Sugerencia:** Reemplazar el patrón por `upsert`/sincronización controlada y bloquear seeds destructivos fuera de desarrollo.

### Issue 3
- **Archivo:** `client/src/stores/auth-store.ts`
- **Problema:** El token JWT queda persistido en `localStorage` vía `zustand/persist`. Cualquier XSS en el cliente expone una credencial con permisos operativos completos.
- **Sugerencia:** Migrar a cookie `HttpOnly` + `Secure` o, como mínimo, reducir superficie con expiración corta, refresh controlado y endurecimiento anti-XSS.

### Issue 4
- **Archivo:** `client/src/components/command-palette/command-palette.tsx`
- **Estado re-auditoría (2026-04-05):** Resuelto
- **Problema:** El command palette falla `eslint` por leer refs durante render (`fuseRef.current`, `fuseEstuchesRef.current`, etc. dentro de `useMemo`). Hoy buildea, pero ya está fuera de las reglas React/Compiler del repo y puede producir UI stale.
- **Validación re-auditoría:** Las instancias de `Fuse` ahora se derivan con `useMemo` desde sus fuentes y el historial se calcula a partir de `isOpen`, sin lecturas de `ref.current` durante render. El hallazgo original quedó cerrado.
- **Sugerencia:** Guardar las instancias de `Fuse` en estado derivado o memoizarlas desde los arrays fuente, sin depender de `ref.current` durante render.

### Issue 5
- **Archivo:** `client/src/features/movimientos/movimientos-page.tsx`
- **Estado re-auditoría (2026-04-05):** Resuelto
- **Problema:** La pantalla de movimientos también falla `eslint`: sincroniza `productoLocal` desde un `useEffect` y dispara un callback que arranca con `setLoading/setError` desde otro effect. No está roto hoy, pero introduce renders en cascada y deuda con React 19.
- **Validación re-auditoría:** La carga quedó encapsulada en un `async load()` interno al efecto y se eliminó el patrón anterior de sincronización inmediata con `setState` en render/effect. `eslint` ya no reporta errores sobre este archivo.
- **Sugerencia:** Reestructurar los filtros con estado derivado/debounce dedicado y disparar la carga sin el patrón actual de `fetch` memoizado + effect.

### Issue 6
- **Archivo:** `server/src/routes/dashboard.ts`, `client/src/features/dashboard/dashboard-page.tsx`
- **Problema:** El dashboard sigue modelado solo para drogas (`totalDrogas`, `drogasEnStock`, `stockBajo`), aunque Fase 2 ya incluye estuches, etiquetas y frascos. La vista general sub-reporta el estado real del depósito.
- **Sugerencia:** O bien renombrar la sección como dashboard de drogas, o ampliar las métricas para cubrir las cuatro categorías y sus thresholds.

### Issue 7
- **Archivo:** `client/src/features/drogas/drogas-page.tsx`, `client/src/features/estuches/estuches-page.tsx`, `client/src/features/etiquetas/etiquetas-page.tsx`, `client/src/features/frascos/frascos-page.tsx`, `server/src/routes/estuches.ts`, `server/src/routes/etiquetas.ts`
- **Problema:** Hay mucho CRUD repetido entre módulos de inventario: modales, edición inline, chips de stock, filtros por mercado y lógica de route handlers casi espejo. Esto vuelve más costoso corregir bugs e inconsistencias.
- **Sugerencia:** Extraer abstracciones compartidas para inventarios y unificar especialmente el par `estuches`/`etiquetas`, que hoy está prácticamente duplicado.

---

## 🟢 Sugerencia (mejoras menores)
Nice to have, no urgente.

### Issue 1
- **Archivo:** `client/src/components/layout/sidebar.tsx`, `client/src/features/dashboard/dashboard-page.tsx`, `client/src/components/command-palette/command-palette.tsx`
- **Sugerencia:** El proyecto incumple varias veces la regla de `DESIGN.md` de evitar separadores por borde (`border-b`, `h-px`). Conviene reemplazarlos por cambios de superficie/espaciado para respetar mejor el sistema “Kinetic Monolith”.

### Issue 2
- **Archivo:** `client/src/features/auth/login-page.tsx`, `client/src/features/movimientos/movimientos-page.tsx`, `client/src/features/actas/acta-nueva-page.tsx`, `client/src/components/layout/topbar.tsx`
- **Sugerencia:** Hay formularios con `<label>` sin asociación explícita a inputs y un botón de logout solo con ícono + `title`. Para accesibilidad real, faltan `htmlFor`/`id` y `aria-label` en controles no textuales.

### Issue 3
- **Archivo:** `server/src/routes/actas.ts`, `client/src/features/actas/acta-nueva-page.tsx`, `client/src/features/actas/acta-detalle-page.tsx`
- **Sugerencia:** El flujo más sensible del producto es el acta inteligente y hoy no tiene cobertura automatizada. Un set mínimo de tests API/e2e para distribución parcial, exceso de cantidad y consistencia por categoría reduciría mucho el riesgo de regresión.

---

## Resumen
| Severidad | Cantidad |
|-----------|----------|
| 🔴 Crítico | 4 |
| 🟡 Importante | 7 |
| 🟢 Sugerencia | 3 |

## Próximos pasos recomendados
1. Mantener la mejora de lint y decidir si también se quiere llevar el repo a `0 warnings`, hoy quedan 7 advertencias fuera del scope original.
2. Antes de seguir sumando features, agregar tests de regresión sobre `actas`, que sigue siendo el flujo con más riesgo de negocio.

## Evidencia rápida
- `npm --prefix client run build` ✅
- `npm --prefix server run build` ✅
- `npm --prefix client run lint` ⚠️ (0 errores, 7 warnings; los errores originales de `command-palette.tsx` y `movimientos-page.tsx` quedaron resueltos)
