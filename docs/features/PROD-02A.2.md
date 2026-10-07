# Feature: PROD-02A.2 — Catálogo maestro productivo

> Antes de trabajar esta funcionalidad, leer este documento, `.agents/current.md` y la guía del rol aplicable.

## Alcance

- Crear exactamente 49 productos canónicos de Ale-Bet en `platform_prod`.
- Usar SKU técnico determinista derivado del nombre canónico.
- Generar un manifiesto read-only de las 56 filas para la futura carga PROD-02B.

## No objetivos

- No crear lotes, saldos, movimientos, reservas, pedidos ni outbox.
- No cargar stock ni escribir Google Sheets.
- No ejecutar seeds históricos ni implementar conversiones de producto.

## Restricciones

- La inserción solo puede ejecutarse si `Producto`, `Lote`, `SaldoStock`, `MovimientoStock` y `Pedido` están vacíos en `platform_prod`.
- Los 49 productos deben crearse dentro de una única transacción con rollback total.
- Las diez filas fuente con cantidad cero deben preservarse en el manifiesto, sin efectos de inventario.

## Nivel de riesgo

`alto`

- Justificación: escritura controlada sobre catálogo productivo, con impacto posterior en stock.
- Riesgo alto requiere Reviewer independiente y Verify.

## Criterios de aceptación

- [x] `platform_prod` contiene exactamente los 49 productos definidos.
- [x] Nombres, SKU, unidades por caja y estado activo coinciden exactamente.
- [x] No existen lotes, saldos, movimientos, pedidos, reservas ni outbox creados por esta fase.
- [x] Las 56 filas fuente resuelven sin ambigüedades contra el catálogo.
- [x] El manifiesto conserva 17.177 unidades en DEPOSITO, 15.259 en ACONDICIONADO y 32.436 en total.
- [x] El manifiesto aplica BB0005, EA0116 y EQUINO singular, y conserva diez filas zero-lot.

## Plan de implementación

- [x] Validar target y precondiciones productivas.
- [x] Definir catálogo y fuente en un script operativo autocontenido.
- [x] Validar catálogo/SKU/matching en memoria.
- [x] Crear los productos en una transacción serializable.
- [x] Verificar postcondiciones y generar manifiesto.

## Evidencia de implementación

| Cambio | Archivo/ruta | Evidencia |
|---|---|---|
| Script transaccional y generador del manifiesto | `apps/platform/server/src/scripts/prod-02a2-catalog.ts` | Inserción atómica de 49 productos; verificación exacta posterior |
| Manifiesto para PROD-02B | `docs/operations/PROD-02B-initial-stock-manifest.json` | 56/56 filas resueltas; totales y diez ceros preservados |

## Evidencia de pruebas

| Criterio | Test/comando | Resultado |
|---|---|---|
| Validación pura del dataset | `tsx src/scripts/prod-02a2-catalog.ts validate-data` | PASS: 49 productos/SKU; 17.177 + 15.259 = 32.436; 10 ceros |
| TypeScript servidor | `npm --workspace @platform/server run typecheck` | PASS |
| Verificación productiva read-only | `tsx src/scripts/prod-02a2-catalog.ts verify` | PASS: catálogo exacto y tablas no objetivo vacías |

## Evidencia de verificación

| Verificación | Evidencia | Resultado |
|---|---|---|
| Conteos y catálogo exacto | Consulta Prisma read-only | PASS: 49 productos, todos activos; nombres/SKU/unidades exactos |
| Matching de 56 filas | Generación de manifiesto | PASS: 56 resueltas, 0 NOT_FOUND, 0 AMBIGUOUS |
| Aislamiento de inventario | Conteos Prisma/PostgreSQL | PASS: lotes/saldos/movimientos/pedidos/reservas/outbox = 0 |

## Estado e historial

- Estado actual: `en-revisión`
- Historial:
  - 2026-09-11 — Codex — creado para la ejecución controlada solicitada de PROD-02A.2.
  - 2026-09-11 — Codex — catálogo creado y evidencia técnica completada; pendiente de revisión antes de PROD-02B.

## Bloqueos

- Ninguno.
