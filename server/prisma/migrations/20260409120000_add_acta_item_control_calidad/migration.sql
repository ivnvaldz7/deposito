-- Add quality-control fields to acta_items

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CondicionEmbalaje') THEN
    CREATE TYPE "CondicionEmbalaje" AS ENUM ('bueno', 'regular', 'malo');
  END IF;
END $$;

ALTER TABLE "acta_items"
ADD COLUMN IF NOT EXISTS "temperatura_transporte" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "condicion_embalaje" "CondicionEmbalaje",
ADD COLUMN IF NOT EXISTS "observaciones_calidad" TEXT,
ADD COLUMN IF NOT EXISTS "aprobado_calidad" BOOLEAN NOT NULL DEFAULT false;
