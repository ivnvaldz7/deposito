-- Add the canonical market dimension without recreating products or dependent rows.
ALTER TABLE "deposito"."productos"
  ADD COLUMN "mercado" "deposito"."Mercado";

-- Preserve the explicitly persisted market for every existing single-market Estuche.
UPDATE "deposito"."productos"
SET "mercado" = "mercados_habilitados"[1]
WHERE "categoria" = 'estuche'::"deposito"."Categoria"
  AND "mercado" IS NULL
  AND cardinality("mercados_habilitados") = 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "deposito"."productos"
    WHERE "categoria" = 'estuche'::"deposito"."Categoria"
      AND "mercado" IS NULL
  ) THEN
    RAISE EXCEPTION 'Preflight failed: every Estuche must have a market';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "deposito"."productos"
    GROUP BY "nombre_completo", "categoria", "mercado"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Preflight failed: duplicate product identity (name, category, market)';
  END IF;
END $$;

DROP INDEX "deposito"."productos_nombre_completo_categoria_key";

CREATE UNIQUE INDEX "productos_nombre_completo_categoria_mercado_key"
  ON "deposito"."productos"("nombre_completo", "categoria", "mercado");

-- Preserve the prior identity rule for categories whose market is intentionally absent.
CREATE UNIQUE INDEX "productos_nombre_completo_categoria_without_mercado_key"
  ON "deposito"."productos"("nombre_completo", "categoria")
  WHERE "mercado" IS NULL;
