-- Keep returns distinct from manual receipts and adjustments. This allows the
-- exact lot consumed by a dispatched order to be replenished and audited.
ALTER TYPE "ale_bet"."TipoMovimiento" ADD VALUE IF NOT EXISTS 'DEVOLUCION_PEDIDO';
