-- Migration: add lote + vencimiento to inventario_drogas
-- Also: add vencimiento to acta_items, add lote to movimientos

-- Step 1: Remove old unique constraint on inventario_drogas.nombre
ALTER TABLE "inventario_drogas" DROP CONSTRAINT IF EXISTS "inventario_drogas_nombre_key";

-- Step 2: Add lote and vencimiento columns to inventario_drogas (nullable for backward compat)
ALTER TABLE "inventario_drogas" ADD COLUMN IF NOT EXISTS "lote" TEXT;
ALTER TABLE "inventario_drogas" ADD COLUMN IF NOT EXISTS "vencimiento" DATE;

-- Step 3: Create composite unique index (nombre, lote)
-- NOTE: In PostgreSQL, NULLs are DISTINCT in unique indexes, so (X, NULL) and (X, NULL) would NOT conflict.
-- Application-level enforcement handles the null-lote uniqueness case.
CREATE UNIQUE INDEX IF NOT EXISTS "inventario_drogas_nombre_lote_key"
  ON "inventario_drogas" ("nombre", "lote");

-- Step 4: Add vencimiento to acta_items
ALTER TABLE "acta_items" ADD COLUMN IF NOT EXISTS "vencimiento" DATE;

-- Step 5: Add lote to movimientos
ALTER TABLE "movimientos" ADD COLUMN IF NOT EXISTS "lote" TEXT;
