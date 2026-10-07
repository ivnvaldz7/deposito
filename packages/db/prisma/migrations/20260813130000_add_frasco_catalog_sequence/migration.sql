CREATE TABLE "deposito"."secuencias_codigo_frasco" (
    "id" TEXT NOT NULL DEFAULT 'canonical',
    "ultimo" INTEGER NOT NULL DEFAULT 62,
    CONSTRAINT "secuencias_codigo_frasco_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "secuencias_codigo_frasco_singleton" CHECK ("id" = 'canonical'),
    CONSTRAINT "secuencias_codigo_frasco_nonnegative" CHECK ("ultimo" >= 62)
);

-- Canonical and legacy Frasco rows must coexist temporarily. Product identity
-- is now producto_id; articulo remains a compatibility display field.
DROP INDEX IF EXISTS "deposito"."inventario_frascos_articulo_key";

INSERT INTO "deposito"."secuencias_codigo_frasco" ("id", "ultimo")
SELECT
    'canonical',
    GREATEST(
        62,
        COALESCE(MAX(RIGHT("codigo", 3)::INTEGER) FILTER (WHERE "codigo" ~ '^ENV[0-9]{3}$'), 0)
    )
FROM "deposito"."productos"
ON CONFLICT ("id") DO UPDATE
SET "ultimo" = GREATEST("secuencias_codigo_frasco"."ultimo", EXCLUDED."ultimo");
