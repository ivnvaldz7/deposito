-- Los mínimos de frascos se ingresaban como cantidad de cajas. Desde esta
-- migración se expresan en unidades, por lo que se conserva el umbral real
-- multiplicándolo una única vez por las unidades que contiene cada caja.
UPDATE "deposito"."productos" AS producto
SET "stock_minimo" = producto."stock_minimo" * COALESCE(
  (
    SELECT inventario."unidades_por_caja"
    FROM "deposito"."inventario_frascos" AS inventario
    WHERE inventario."producto_id" = producto."id"
  ),
  producto."presentacion",
  1
)
WHERE producto."categoria" = 'frasco'
  AND producto."stock_minimo" IS NOT NULL;
