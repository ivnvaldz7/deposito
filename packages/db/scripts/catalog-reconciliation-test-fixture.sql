-- CI-only precondition for the historical reconciliation migration.
DO $$
DECLARE product_count INTEGER;
BEGIN
  SELECT count(*) INTO product_count FROM "ale_bet"."Producto";
  IF product_count NOT IN (0, 43) THEN
    RAISE EXCEPTION 'CI catalog fixture requires 0 or 43 products before reconciliation, found %', product_count;
  END IF;
  IF product_count = 0 THEN
    INSERT INTO "ale_bet"."Producto" ("id", "nombre", "sku", "unidadesPorCaja", "activo", "createdAt", "updatedAt")
    SELECT 'ci-pre-reconciliation-' || lpad(series::text, 2, '0'), 'CI PRE-RECONCILIATION ' || lpad(series::text, 2, '0'), 'CI-PRE-RECONCILIATION-' || lpad(series::text, 2, '0'), 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM generate_series(1, 43) AS series;
  END IF;
END $$;
