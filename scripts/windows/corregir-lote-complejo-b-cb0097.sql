-- Corrección autorizada: conserva el identificador del lote y sus relaciones.
BEGIN;
DO $$
DECLARE
  producto_id text := 'cmtx1uj0b000jv4oj9edlbnee';
  lote_id text := 'cmvqojb030002t4ojdo0ys55o';
BEGIN
  PERFORM 1 FROM "ale_bet"."Producto"
    WHERE id = producto_id AND sku = 'LOG-FDA54C6A35491836'
      AND nombre = 'COMPLEJO B B12 B15 250 ML' AND "prefijoLote" = 'CB'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto o sigla inesperados'; END IF;
  PERFORM 1 FROM "ale_bet"."Lote" WHERE id = lote_id AND "productoId" = producto_id AND numero = 'CO0097' AND "derivedFromLoteId" IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El lote original cambió o ya no existe'; END IF;
  IF EXISTS (SELECT 1 FROM "ale_bet"."Lote" WHERE "derivedFromLoteId" = lote_id) THEN
    RAISE EXCEPTION 'El lote tiene presentaciones derivadas; revisar trazabilidad';
  END IF;
  IF EXISTS (SELECT 1 FROM "ale_bet"."Lote" WHERE "productoId" = producto_id AND numero = 'CB0097') THEN
    RAISE EXCEPTION 'Ya existe CB0097 para este producto';
  END IF;
  UPDATE "ale_bet"."Lote" SET numero = 'CB0097' WHERE id = lote_id;
  INSERT INTO "platform"."PlatformAuditoria" (id, action, app, previous, next, "createdAt")
    VALUES (md5(random()::text || clock_timestamp()::text), 'LOTE_NUMERO_CORREGIDO', 'ale_bet',
      jsonb_build_object('productoId', producto_id, 'loteId', lote_id, 'numero', 'CO0097'),
      jsonb_build_object('productoId', producto_id, 'loteId', lote_id, 'numero', 'CB0097'), now());
END $$;
COMMIT;
