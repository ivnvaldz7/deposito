# Feature: ALEBET-FACT-02 — Reporte agregado de ventas por cliente

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Endpoint `GET /api/ale-bet/facturacion/ventas` que devuelve un reporte agregado de pedidos **DESPACHADOS** agrupado por producto para un cliente dado.
- Soporta dos modos: mensual (`year` + `month`) y anual (`year` sin `month`).
- Filtros: `clienteId` (requerido), `year` (requerido), `month` (opcional).
- Reporte mensual: pedidos despachados, productos distintos, unidades totales, detalle por producto (nombre, SKU, `unidadesPorCaja`, cajas, sueltos, unidades).
- Reporte anual: mismos totales anuales + resumen por mes + totales anuales por producto.
- `unidadesPorCaja` dinámica: leída de `ItemPedido.producto.unidadesPorCaja` (live join).
- Fecha histórica de despacho: `Pedido.despachadoAt` (campo real del schema).
- Snapshot histórico de producto: `ItemPedido.producto` (join en tiempo real con datos actuales del producto). No existe tabla de auditoría de cambios de producto en `ale_bet`; la fuente más fiable disponible es el join live.
- RBAC: solo roles `admin` y `facturacion` del app `ale-bet`.
- 403 explícito para `vendedor`, `armador`, `encargado_deposito` (y cualquier otro rol distinto de los permitidos).
- Agregación hecha en backend; no se carga la colección completa en el cliente.

## No objetivos

- No crear endpoints de escritura ni modificar el esquema de Prisma.
- No tocar el frontend.
- No hacer commit ni push.

## Restricciones

- TypeScript estricto: sin `any`, `as unknown` ni `@ts-ignore`.
- TDD estricto: tests primero.
- Sin modificar `.agents/current.md`.

## Nivel de riesgo

`estándar`

- Endpoint de solo lectura con agregación; no toca stock, transacciones ni schema.

## Fuentes de datos investigadas

| Dato | Fuente elegida | Justificación |
|---|---|---|
| Fecha de despacho | `Pedido.despachadoAt` | Campo explícito en el schema; se setea al momento de despachar. Es la fecha histórica real, no `createdAt`. |
| Nombre y SKU del producto | `ItemPedido.producto.nombre` / `.sku` | No existe snapshot histórico de producto en `ale_bet`; join live es la mejor fuente disponible. |
| `unidadesPorCaja` | `ItemPedido.producto.unidadesPorCaja` | Dinámica desde el modelo vivo; en línea con cómo la usa el resto del sistema (dashboard, stock). |
| Snapshot de cliente | `Remito.clienteSnapshot` (disponible pero no necesario aquí) | Para el reporte de ventas el `clienteId` ya es el filtro; no se requiere snapshot del nombre. |

## Endpoint y contrato

```
GET /api/ale-bet/facturacion/ventas
  ?clienteId=<id>   (requerido)
  &year=<YYYY>      (requerido)
  &month=<MM>       (opcional, 1-12)
```

### Respuesta mensual (con `month`)

```json
{
  "modo": "mensual",
  "clienteId": "...",
  "year": 2026,
  "month": 7,
  "pedidosDespachados": 3,
  "productosDistintos": 2,
  "unidadesTotales": 145,
  "productos": [
    {
      "productoId": "...",
      "nombre": "Producto A",
      "sku": "SKU-001",
      "unidadesPorCaja": 12,
      "cajas": 10,
      "sueltos": 5,
      "unidades": 125
    }
  ]
}
```

### Respuesta anual (sin `month`)

```json
{
  "modo": "anual",
  "clienteId": "...",
  "year": 2026,
  "pedidosDespachados": 12,
  "productosDistintos": 3,
  "unidadesTotales": 960,
  "productos": [ ],
  "meses": [
    {
      "month": 1,
      "pedidosDespachados": 2,
      "productosDistintos": 1,
      "unidadesTotales": 80,
      "productos": [ ]
    }
  ]
}
```

### Errores

| Código | Condición |
|---|---|
| 400 | `clienteId`, `year` faltantes o inválidos; `month` fuera de rango 1-12 |
| 401 | Sin token |
| 403 | Token válido pero rol no permitido |

## Criterios de aceptación

- [ ] 1. Solo pedidos DESPACHADOS se incluyen en el reporte.
- [ ] 2. Pedidos en otros estados no aparecen.
- [ ] 3. El filtro por mes produce solo pedidos con `despachadoAt` en ese año/mes.
- [ ] 4. El filtro anual produce todos los pedidos con `despachadoAt` en ese año.
- [ ] 5. El filtro por `clienteId` excluye pedidos de otros clientes.
- [ ] 6. Múltiples pedidos del mismo producto en el mismo período se suman correctamente.
- [ ] 7. Cajas y sueltos calculados con `unidadesPorCaja` dinámica del producto.
- [ ] 8. En modo anual, meses sin ventas no aparecen en `meses`.
- [ ] 9. Roles `admin` y `facturacion` reciben 200.
- [ ] 10. Roles `vendedor`, `armador`, `encargado_deposito` reciben 403.
- [ ] 11. Sin token recibe 401.
- [ ] 12. `clienteId` o `year` faltantes reciben 400.

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Todos los criterios de aceptación (25 tests) | `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/facturacion.test.ts` | PASS — 25/25 |
| Regresión dashboard | `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/dashboard.test.ts` | PASS — 5/5 |
| Regresión historial | `npm --workspace @platform/server run test -- src/routes/ale-bet/__tests__/historial.test.ts` | PASS — 15/15 |
| Typecheck server (`facturacion.ts` sin errores) | `npx tsc --noEmit 2>&1 | Select-String -Pattern "facturacion"` | Sin errores en archivos del feature; errores pre-existentes en `test-desmarcar.ts` y `clientes.ts` son ajenos al alcance. |

## Estado e historial

- Estado actual: `en-prueba`
- Historial:
  - 2026-08-06 — Builder — implementación backend + tests. 25/25 PASS en primer run. Sin errores de typecheck en los archivos del feature. Frontend pendiente.
