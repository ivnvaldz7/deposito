ALTER TABLE "ale_bet"."Producto" ADD COLUMN "prefijoLote" TEXT;
ALTER TABLE "ale_bet"."Producto" ADD CONSTRAINT "Producto_prefijoLote_format_check" CHECK ("prefijoLote" IS NULL OR "prefijoLote" ~ '^[A-Z]{1,12}$');

-- Sigla confirmada por el usuario para esta presentación concreta.
UPDATE "ale_bet"."Producto" SET "prefijoLote" = 'CB'
WHERE "sku" = 'LOG-FDA54C6A35491836'
  AND "nombre" = 'COMPLEJO B B12 B15 250 ML'
  AND "prefijoLote" IS NULL;
