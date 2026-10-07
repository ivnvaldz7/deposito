# PROD-02B — Carga inicial de stock productivo

## Estado

`verificado`

## Objetivo

Cargar una única vez el stock inicial aprobado en `platform_prod` desde el manifiesto content-bound de PROD-02A.2, validar PostgreSQL como fuente de verdad y publicar su snapshot autoritativo en la solapa `STOCK APP`.

## Salvaguardas

- El importador opera en dry-run por defecto y exige `--apply` para escribir.
- El target debe ser exactamente `platform_prod`.
- El SHA-256 del manifiesto debe coincidir exactamente con el valor aprobado.
- La aplicación exige 49 productos y cero lotes, saldos, movimientos, pedidos, reservas y eventos de outbox antes de comenzar.
- La carga se realiza en una sola transacción Prisma; cualquier inconsistencia revierte todo.
- Las filas de cantidad cero crean únicamente un lote activo.
- Google se escribe solamente después de una conciliación exacta PostgreSQL ↔ manifiesto.
- No se modifican productos, no se usan seeds y no se importan pedidos.

## Fuente aprobada

- Manifiesto: `docs/operations/PROD-02B-initial-stock-manifest.json`
- SHA-256 esperado: `BDE23A05C7E40237B9146D20B739131EBF60442933B04758F6B2D0FCB2766CA5`
- Filas: 56
- Filas zero-lot: 10
- DEPOSITO: 17.177
- ACONDICIONADO: 15.259
- Total: 32.436

## Evidencia de ejecución

- Timestamp de cierre operativo: `2026-09-11T14:46:08-03:00`.
- Target confirmado: `platform_prod`.
- Manifest SHA-256: `BDE23A05C7E40237B9146D20B739131EBF60442933B04758F6B2D0FCB2766CA5` — PASS.
- Dry-run previo: PASS sobre 49 productos y todos los conteos operativos en cero.
- Aplicación: PASS en una transacción Prisma `Serializable`.
- Productos: 49, sin modificaciones al catálogo.
- Lotes distintos por `(productId, numero)`: 51; todos activos.
- Filas zero-lot: 10; sin `SaldoStock`, `MovimientoStock` ni outbox artificial.
- `SaldoStock`: 46.
- `MovimientoStock`: 46, exclusivamente `SALDO_APERTURA`, positivos y con actor/referencia/idempotencia validados.
- `StockProjectionOutbox`: 46, estado `PENDING`, intentos 0 y sin error. La escritura directa aprobada no consume el outbox; queda disponible para el mecanismo de proyección existente.
- `Pedido`: 0.
- `ReservaStock`: 0.
- Conciliación PostgreSQL ↔ manifiesto: 56/56 — PASS.
- Duplicados: 0 — PASS.
- Stock negativo: 0 — PASS.
- Totales PostgreSQL: DEPOSITO 17.177; ACONDICIONADO 15.259; general 32.436.
- Snapshot autoritativo: PRODUCTO TERMINADO 17.177; SIN ACONDICIONAR 15.259; general 32.436; 49 filas por tabla según la política de cero vigente.
- Escritura Google `STOCK APP`: PASS en el primer intento mediante el adapter existente.
- Lectura posterior Google ↔ snapshot: PASS; fingerprint de contenido saneado `21E3D6D0F62CE96F`.
- Relectura PostgreSQL posterior a Google ↔ snapshot escrito: PASS.

## Verificación focalizada

- TypeScript del servidor: PASS.
- Tests de snapshot, adapter Google, sync directa y ciclo de vida de lotes: 4 archivos / 43 tests — PASS.
- Revisión independiente del importador y sus salvaguardas: PASS.

No se ejecutaron seeds, SQL destructivo, carga de pedidos ni modificaciones de producto. No se hizo stage, receipt, commit ni push.
