-- Distinguishes pre-go-live opening stock from later adjustments.
ALTER TYPE "ale_bet"."TipoMovimiento" ADD VALUE IF NOT EXISTS 'SALDO_APERTURA';
