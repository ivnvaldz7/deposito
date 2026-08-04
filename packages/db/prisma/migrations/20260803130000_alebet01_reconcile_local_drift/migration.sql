-- Reconciles an already-expanded ALEBET-01 database with the Prisma schema.
-- This is additive/non-destructive: it changes only timestamp defaults and the
-- nullable Remito -> Transportista referential action. No tables, columns, or
-- application data are removed.

ALTER TABLE "ale_bet"."Cliente"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "ale_bet"."Transportista"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "ale_bet"."Remito"
  DROP CONSTRAINT "Remito_transportistaId_fkey";

ALTER TABLE "ale_bet"."Remito"
  ADD CONSTRAINT "Remito_transportistaId_fkey"
  FOREIGN KEY ("transportistaId") REFERENCES "ale_bet"."Transportista"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
