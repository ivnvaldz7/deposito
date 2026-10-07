-- Catalog-only patch for the confirmed AMINOÁCIDOS presentation model.
-- It deliberately preserves the legacy GALLO product id/SKU and therefore all
-- related lots, balances and movements. It never touches inventory tables.
DO $$
DECLARE
  product_count INTEGER;
  legacy_name TEXT;
  legacy_sku TEXT;
BEGIN
  SELECT count(*) INTO product_count FROM "ale_bet"."Producto";

  -- A new database has no catalog yet; PROD-02A2 creates the complete 52-row
  -- catalog afterwards. Any populated database must be exactly the prepared
  -- 49-product catalog or this patch refuses to guess.
  IF product_count = 0 THEN
    RETURN;
  END IF;

  IF product_count <> 49 THEN
    RAISE EXCEPTION 'AMINO catalog patch requires 0 or 49 products, found %', product_count;
  END IF;

  SELECT "nombre", "sku"
  INTO legacy_name, legacy_sku
  FROM "ale_bet"."Producto"
  WHERE "id" = 'cmtx1uj0b0009v4oj442qiqsj';

  IF legacy_name IS DISTINCT FROM 'AMINOÁCIDOS 50 ML GALLO'
     OR legacy_sku IS DISTINCT FROM 'LOG-D8C1A70AF2FDD426' THEN
    RAISE EXCEPTION 'Legacy AMINOÁCIDOS 50 ML GALLO identity does not match the prepared catalog';
  END IF;

  UPDATE "ale_bet"."Producto"
  SET "nombre" = 'AMINOÁCIDOS 50 ML AVES', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = 'cmtx1uj0b0009v4oj442qiqsj'
    AND "nombre" = 'AMINOÁCIDOS 50 ML GALLO'
    AND "sku" = 'LOG-D8C1A70AF2FDD426';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not normalize legacy AMINOÁCIDOS 50 ML GALLO';
  END IF;

  INSERT INTO "ale_bet"."Producto" (
    "id", "nombre", "sku", "unidadesPorCaja", "activo", "createdAt", "updatedAt"
  ) VALUES
    ('cprodaminobase50ml0000001', 'AMINOÁCIDOS 50 ML', 'LOG-CD3520C476B6F5C6', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('cprodaminol1equino0000001', 'AMINOÁCIDOS 1 L EQUINO', 'LOG-7EA9922C837C111A', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('cprodaminol1cerdos0000001', 'AMINOÁCIDOS 1 L CERDOS', 'LOG-8CB0C424D18E1D65', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  IF (SELECT count(*) FROM "ale_bet"."Producto") <> 52 THEN
    RAISE EXCEPTION 'AMINO catalog patch did not produce exactly 52 products';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "ale_bet"."Producto"
    WHERE "id" = 'cmtx1uj0b0009v4oj442qiqsj'
      AND "nombre" = 'AMINOÁCIDOS 50 ML AVES'
      AND "sku" = 'LOG-D8C1A70AF2FDD426'
  ) THEN
    RAISE EXCEPTION 'Normalized AVES product postcondition failed';
  END IF;
END $$;
