-- ALEBET unidades por caja: EXPAND -> controlled backfill -> guard -> CONTRACT.
--
-- The source map below is derived from the verified Ale-Bet MOVIMIENTOS CSV.
-- Exact product-name matches are the only automatic backfill. Unknown products stop
-- the migration: no production row receives an invented default.

ALTER TABLE "ale_bet"."Producto"
  ADD COLUMN "unidadesPorCaja" INTEGER;

WITH csv_source(nombre, unidades_por_caja) AS (
  VALUES
    ('AMANTINA 250 ML', 15),
    ('AMANTINA 500 ML', 20),
    ('AMANTINA PREMIUM 100 ML', 30),
    ('AMANTINA PREMIUM 250 ML', 24),
    ('AMANTINA PREMIUM 500 ML', 20),
    ('AMINOÁCIDOS 1 L', 12),
    ('AMINOÁCIDOS 1 L AVES', 12),
    ('AMINOÁCIDOS 20 ML', 15),
    ('AMINOÁCIDOS 5 L', 4),
    ('AMINOÁCIDOS 50 ML GALLO', 40),
    ('AMINOÁCIDOS 50 ML MASCOTA', 40),
    ('ANTITÉRMICO 1 L', 12),
    ('CALCITROVIT 500 ML', 20),
    ('CETRI-AMON 1 L', 12),
    ('CETRI-AMON 5 L', 4),
    ('COMPLEJO B B12 B15 100 ML', 24),
    ('COMPLEJO B B12 B15 20 ML', 12),
    ('COMPLEJO B B12 B15 250 ML', 24),
    ('COMPLEJO B HIERRO CERDOS 100 ML', 24),
    ('COMPLEJO B HIERRO CERDOS 25 ML', 20),
    ('COMPLEJO B HIERRO EQUINO 25 ML', 20),
    ('COMPLEJO B HIERRO EQUINOS 100 ML', 24),
    ('ENERGIZANTE 100 ML', 24),
    ('ENERGIZANTE 25 ML', 20),
    ('ENERGIZANTE 250 ML', 24),
    ('ENERGIZANTE 250 ML VACAS', 24),
    ('ENERGIZANTE 500 ML', 20),
    ('IVERSAN 500 ML', 20),
    ('JERINGA ATP 35 GR', 24),
    ('OLIVITASAN 100 ML', 40),
    ('OLIVITASAN 25 ML', 20),
    ('OLIVITASAN 300 ML', 24),
    ('OLIVITASAN 500 ML', 20),
    ('OLIVITASAN PLUS 250 ML', 24),
    ('OLIVITASAN PLUS 50 ML', 40),
    ('OLIVITASAN PLUS 500 ML', 20),
    ('SUPERCOMPLEJO B 1 L AVES', 12),
    ('SUPERCOMPLEJO B 1 L EQUINO', 12),
    ('TILCOSAN 100 ML', 24),
    ('TILCOSAN 250 ML', 24),
    ('VITAMINA B1 100 ML', 24),
    ('VITAMINA B12 100 ML', 24),
    ('VITAMINA B12 50 ML', 30)
)
UPDATE "ale_bet"."Producto" AS producto
SET "unidadesPorCaja" = csv_source.unidades_por_caja
FROM csv_source
WHERE producto.nombre = csv_source.nombre;

DO $$
DECLARE
  missing_products TEXT;
BEGIN
  SELECT string_agg(nombre, ', ' ORDER BY nombre)
  INTO missing_products
  FROM "ale_bet"."Producto"
  WHERE "unidadesPorCaja" IS NULL;

  IF missing_products IS NOT NULL THEN
    RAISE EXCEPTION
      'ALEBET unidades por caja backfill blocked: explicit value required for products: %',
      missing_products;
  END IF;
END $$;

-- Existing Lote rows were persisted under the legacy fixed 15-unit presentation.
-- Preserve their absolute physical stock, then canonicalize them for each product's
-- verified presentation. This is not a new default and never writes 15 as a value.
UPDATE "ale_bet"."Lote" AS lote
SET
  cajas = (lote.cajas * 15 + lote.sueltos) / producto."unidadesPorCaja",
  sueltos = (lote.cajas * 15 + lote.sueltos) % producto."unidadesPorCaja"
FROM "ale_bet"."Producto" AS producto
WHERE producto.id = lote."productoId";

ALTER TABLE "ale_bet"."Producto"
  ADD CONSTRAINT "Producto_unidadesPorCaja_positive"
  CHECK ("unidadesPorCaja" > 0),
  ALTER COLUMN "unidadesPorCaja" SET NOT NULL;

CREATE OR REPLACE FUNCTION "ale_bet".validate_lote_sueltos()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_units INTEGER;
BEGIN
  SELECT "unidadesPorCaja" INTO product_units
  FROM "ale_bet"."Producto"
  WHERE id = NEW."productoId";

  IF product_units IS NULL OR product_units <= 0 THEN
    RAISE EXCEPTION 'Producto % has no valid unidadesPorCaja', NEW."productoId";
  END IF;

  IF NEW.sueltos < 0 OR NEW.sueltos >= product_units THEN
    RAISE EXCEPTION 'Lote sueltos (%) must be between 0 and % for producto %', NEW.sueltos, product_units - 1, NEW."productoId";
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Lote_validate_sueltos"
BEFORE INSERT OR UPDATE OF "productoId", sueltos ON "ale_bet"."Lote"
FOR EACH ROW EXECUTE FUNCTION "ale_bet".validate_lote_sueltos();
