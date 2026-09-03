# AUTOMATION-01 — Ingesta de pedidos + sincronización operativa de stock

Estado: en construcción (Slice 1)

## Alcance del Slice 1

Backend de borradores interpretados: texto pegado, interpretación determinística,
edición estructurada y confirmación humana transaccional. La confirmación reutiliza
el núcleo de pedidos y reservas para crear un pedido APROBADO, reservas activas y
eventos `PENDING` de proyección de stock.

No incluye UI, IA externa, Google Sheets, worker/outbox processor, hotkey ni ajustes
extraordinarios.

## Invariantes

- PostgreSQL es la fuente de verdad.
- Disponible = físico - reservas activas.
- La interpretación no altera stock.
- Confirmar nunca descuenta físico; el despacho consume la reserva.
- Cantidades numéricas sin modalidad son unidades.
- La reserva FEFO y el preview comparten la misma regla de elegibilidad de lote.
