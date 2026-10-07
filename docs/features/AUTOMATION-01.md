# AUTOMATION-01 — Ingesta de pedidos + sincronización operativa de stock

Estado: en construcción (stock-effective workflow)

## Alcance del Slice 1

Backend de borradores interpretados: texto pegado, interpretación determinística,
edición estructurada y confirmación humana transaccional. La confirmación reutiliza
el núcleo de pedidos y reservas para crear un pedido `APROBADO` de origen
`AUTOMATION`, consumir físicamente el stock FEFO en la misma transacción y crear
eventos `PENDING` de proyección de stock.

No incluye UI, IA externa, Google Sheets, worker/outbox processor, hotkey ni ajustes
extraordinarios.

## Invariantes

- PostgreSQL es la fuente de verdad.
- Disponible = físico - reservas activas.
- La interpretación no altera stock.
- Confirmar Automation descuenta físico; no queda ninguna reserva `ACTIVA` y
  no existe un despacho posterior de Armador.
- La implementación crea la reserva FEFO y la consume dentro de la misma
  transacción para reutilizar los locks, la asignación por lote y los
  `MovimientoStock` existentes.
- Pedidos `MANUAL`/legacy conservan reservas activas y el workflow Armador.
- Cantidades numéricas sin modalidad son unidades.
- La reserva FEFO y el preview comparten la misma regla de elegibilidad de lote.

## Decisión de stock efectivo

- `Pedido.origen` usa `MANUAL` (default compatible para existentes) y
  `AUTOMATION`; en Automation `vendedorId` queda nulo y `confirmedBy`/
  auditoría identifica al operador.
- El estado operativo de Automation es `APROBADO` con `origen = AUTOMATION`.
  La UI lo representa como “Automation · Confirmado” y deriva el estado
  documental de `Remito` vigente: pendiente de remito o remito emitido.
- La confirmación bloquea draft, valida versión/cliente/productos, consolida
  líneas, recalcula disponibilidad, resuelve FEFO, crea pedido/items, crea y
  consume las reservas, registra movimientos/auditoría/outbox y confirma el
  draft dentro de una única transacción. Cualquier error revierte todo.
- Remitos son puramente documentales para Automation: emitir, anular o
  reemitir nunca genera una segunda salida ni repone stock.
