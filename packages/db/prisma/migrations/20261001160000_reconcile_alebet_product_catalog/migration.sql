-- Recovery for local catalogs created before the complete 52-product manifest.
-- This is additive: it never updates or deletes existing products, lots,
-- balances, movements, reservations, or orders.
INSERT INTO "ale_bet"."Producto" ("id", "nombre", "sku", "unidadesPorCaja", "activo", "createdAt", "updatedAt") VALUES
  ('cprodaminol1equino0000001', 'AMINOÁCIDOS 1 L EQUINO', 'LOG-7EA9922C837C111A', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cprodaminol1cerdos0000001', 'AMINOÁCIDOS 1 L CERDOS', 'LOG-8CB0C424D18E1D65', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cprodaminobase50ml0000001', 'AMINOÁCIDOS 50 ML', 'LOG-CD3520C476B6F5C6', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmtx1uj0b000bv4ojii6vi6t8', 'AMINOÁCIDOS INYECTABLE 100 ML', 'LOG-8C72F5F068509011', 24, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmtx1uj0b000cv4ojvlf1796h', 'AMINOÁCIDOS INYECTABLE 250 ML', 'LOG-1597B9ADE3FAAADE', 24, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmtx1uj0b000kv4ojahkig0z8', 'COMPLEJO B HIERRO 100 ML', 'LOG-5E595022AB9E0F7D', 24, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmtx1uj0b000lv4ojvyr9787s', 'COMPLEJO B HIERRO 25 ML', 'LOG-EC1E9164D8079ACF', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmtx1uj0c000xv4ojjnggfzk1', 'OLIFAMISOL 500 ML', 'LOG-AA988464DE79A11F', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmtx1uj0c0015v4ojiyfwzbi5', 'SUPERCOMPLEJO B 1 L', 'LOG-56398B81D5B27106', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM "ale_bet"."Producto") <> 52 THEN
    RAISE EXCEPTION 'Catalog reconciliation requires exactly 52 products after completion, found %', (SELECT count(*) FROM "ale_bet"."Producto");
  END IF;
END $$;

-- Restore the presentation choices from the canonical catalog.  The relation
-- is configuration only; it does not move or change any stock.
WITH definitions(source_name, target_name, label, tipo, orden) AS (
  VALUES
    ('ENERGIZANTE 250 ML', 'ENERGIZANTE 250 ML', 'Normal', 'SAME_PRODUCT', 10),
    ('ENERGIZANTE 250 ML', 'ENERGIZANTE 250 ML VACAS', 'Vacas', 'PRESENTATION', 20),
    ('AMINOÁCIDOS 50 ML', 'AMINOÁCIDOS 50 ML AVES', 'Aves', 'PRESENTATION', 10),
    ('AMINOÁCIDOS 50 ML', 'AMINOÁCIDOS 50 ML MASCOTA', 'Mascota', 'PRESENTATION', 20),
    ('AMINOÁCIDOS 1 L', 'AMINOÁCIDOS 1 L AVES', 'Aves', 'PRESENTATION', 10),
    ('AMINOÁCIDOS 1 L', 'AMINOÁCIDOS 1 L EQUINO', 'Equino', 'PRESENTATION', 20),
    ('AMINOÁCIDOS 1 L', 'AMINOÁCIDOS 1 L CERDOS', 'Cerdos', 'PRESENTATION', 30),
    ('COMPLEJO B HIERRO 25 ML', 'COMPLEJO B HIERRO EQUINOS 25 ML', 'Equino', 'PRESENTATION', 10),
    ('COMPLEJO B HIERRO 25 ML', 'COMPLEJO B HIERRO CERDOS 25 ML', 'Cerdos', 'PRESENTATION', 20),
    ('COMPLEJO B HIERRO 100 ML', 'COMPLEJO B HIERRO EQUINOS 100 ML', 'Equino', 'PRESENTATION', 10),
    ('COMPLEJO B HIERRO 100 ML', 'COMPLEJO B HIERRO CERDOS 100 ML', 'Cerdos', 'PRESENTATION', 20),
    ('SUPERCOMPLEJO B 1 L', 'SUPERCOMPLEJO B 1 L', 'Normal', 'SAME_PRODUCT', 10),
    ('SUPERCOMPLEJO B 1 L', 'SUPERCOMPLEJO B 1 L EQUINOS', 'Equino', 'PRESENTATION', 20),
    ('SUPERCOMPLEJO B 1 L', 'SUPERCOMPLEJO B 1 L AVES', 'Aves', 'PRESENTATION', 30)
)
INSERT INTO "ale_bet"."ProductoTransferRule" ("id", "sourceProductId", "targetProductId", "label", "tipo", "activo", "orden", "createdAt", "updatedAt")
SELECT
  'recovery-rule-' || md5(definitions.source_name || ':' || definitions.target_name || ':' || definitions.label),
  source_product."id", target_product."id", definitions.label,
  definitions.tipo::"ale_bet"."TipoReglaTransferenciaProducto", true, definitions.orden,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM definitions
JOIN "ale_bet"."Producto" AS source_product ON source_product."nombre" = definitions.source_name
JOIN "ale_bet"."Producto" AS target_product ON target_product."nombre" = definitions.target_name
ON CONFLICT ("sourceProductId", "targetProductId", "label") DO UPDATE
SET "tipo" = EXCLUDED."tipo", "activo" = true, "orden" = EXCLUDED."orden", "updatedAt" = CURRENT_TIMESTAMP;
