ALTER TYPE "deposito"."OrigenProductoCatalogo" ADD VALUE IF NOT EXISTS 'IMPORTACION_INICIAL_ESTUCHES';
ALTER TYPE "deposito"."DepositoTipoMovimiento" ADD VALUE IF NOT EXISTS 'stock_inicial';

ALTER TABLE "deposito"."movimientos"
  ADD COLUMN IF NOT EXISTS "producto_id" TEXT,
  ADD COLUMN IF NOT EXISTS "fecha_efectiva" DATE,
  ADD COLUMN IF NOT EXISTS "importacion_inicial_estuche_item_id" TEXT;

CREATE TABLE "deposito"."secuencias_codigo_estuche" (
  "mercado" "deposito"."Mercado" PRIMARY KEY,
  "ultimo" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "secuencias_codigo_estuche_ultimo_nonnegative" CHECK ("ultimo" >= 0)
);

INSERT INTO "deposito"."secuencias_codigo_estuche" ("mercado", "ultimo")
SELECT seed."mercado", COALESCE(MAX((substring(producto."codigo" FROM seed."pattern"))::INTEGER), 0)
FROM (
  VALUES
    ('argentina'::"deposito"."Mercado", '^IGES([0-9]{3})$'),
    ('colombia'::"deposito"."Mercado", '^IGESCO([0-9]{3})$'),
    ('bolivia'::"deposito"."Mercado", '^IGESBO([0-9]{3})$'),
    ('ecuador'::"deposito"."Mercado", '^IGESEC([0-9]{3})$'),
    ('paraguay'::"deposito"."Mercado", '^IGESPY([0-9]{3})$'),
    ('VENEZUELA'::"deposito"."Mercado", '^IGESVN([0-9]{3})$'),
    ('mexico'::"deposito"."Mercado", '^IGESMX([0-9]{3})$')
) AS seed("mercado", "pattern")
LEFT JOIN "deposito"."productos" AS producto ON producto."codigo" ~ seed."pattern"
GROUP BY seed."mercado"
ON CONFLICT ("mercado") DO UPDATE SET "ultimo" = GREATEST("deposito"."secuencias_codigo_estuche"."ultimo", EXCLUDED."ultimo");

CREATE TABLE "deposito"."importaciones_iniciales_estuche" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "idempotency_key" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "effective_date" DATE NOT NULL,
  "result" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "importaciones_iniciales_estuche_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "importaciones_iniciales_estuche_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "importaciones_iniciales_estuche_checksum_key" UNIQUE ("checksum"),
  CONSTRAINT "importaciones_iniciales_estuche_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "deposito"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "deposito"."importaciones_iniciales_estuche_idempotency_keys" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "idempotency_key" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "importaciones_iniciales_estuche_idempotency_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "importaciones_iniciales_estuche_idempotency_keys_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "importaciones_iniciales_estuche_idempotency_keys_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "deposito"."importaciones_iniciales_estuche"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "importaciones_iniciales_estuche_idempotency_keys_batch_id_idx"
  ON "deposito"."importaciones_iniciales_estuche_idempotency_keys"("batch_id");

CREATE TABLE "deposito"."importaciones_iniciales_estuche_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "batch_id" TEXT NOT NULL,
  "producto_id" TEXT NOT NULL,
  "inventario_estuche_id" TEXT NOT NULL,
  "mercado" "deposito"."Mercado" NOT NULL,
  "codigo" TEXT NOT NULL,
  "source_row" INTEGER NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "importaciones_iniciales_estuche_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "importaciones_iniciales_estuche_items_producto_id_key" UNIQUE ("producto_id"),
  CONSTRAINT "importaciones_iniciales_estuche_items_inventario_estuche_id_key" UNIQUE ("inventario_estuche_id"),
  CONSTRAINT "importaciones_iniciales_estuche_items_batch_id_source_row_key" UNIQUE ("batch_id", "source_row"),
  CONSTRAINT "importaciones_iniciales_estuche_items_cantidad_nonnegative" CHECK ("cantidad" >= 0),
  CONSTRAINT "importaciones_iniciales_estuche_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "deposito"."importaciones_iniciales_estuche"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "importaciones_iniciales_estuche_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "importaciones_iniciales_estuche_items_inventario_estuche_id_fkey" FOREIGN KEY ("inventario_estuche_id") REFERENCES "deposito"."inventario_estuches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "deposito"."movimientos"
  ADD CONSTRAINT "movimientos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "movimientos_importacion_inicial_estuche_item_id_fkey" FOREIGN KEY ("importacion_inicial_estuche_item_id") REFERENCES "deposito"."importaciones_iniciales_estuche_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "movimientos_importacion_inicial_estuche_item_id_key" UNIQUE ("importacion_inicial_estuche_item_id");
CREATE INDEX "movimientos_producto_id_idx" ON "deposito"."movimientos"("producto_id");

CREATE OR REPLACE FUNCTION "deposito".guard_producto_codigo_con_historial()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."codigo" IS DISTINCT FROM OLD."codigo" AND (
    EXISTS (SELECT 1 FROM "deposito"."inventario_estuches" WHERE "producto_id" = OLD.id)
    OR EXISTS (SELECT 1 FROM "deposito"."movimientos" WHERE "producto_id" = OLD.id)
  ) THEN
    RAISE EXCEPTION 'No se puede editar el código de un producto con historial de stock';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "productos_guard_codigo_con_historial"
BEFORE UPDATE OF "codigo" ON "deposito"."productos"
FOR EACH ROW EXECUTE FUNCTION "deposito".guard_producto_codigo_con_historial();
