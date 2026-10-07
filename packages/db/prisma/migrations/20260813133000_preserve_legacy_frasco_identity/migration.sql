DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "deposito"."productos"
    WHERE "mercado" IS NULL
    GROUP BY "nombre_completo", "categoria"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce legacy product identity: duplicate nombre_completo/categoria rows exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "deposito"."inventario_frascos"
    WHERE "producto_id" IS NULL
    GROUP BY "articulo"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce legacy Frasco identity: duplicate articulo rows exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "productos_nombre_categoria_legacy_key"
ON "deposito"."productos" ("nombre_completo", "categoria")
WHERE "mercado" IS NULL;

CREATE UNIQUE INDEX "inventario_frascos_articulo_legacy_key"
ON "deposito"."inventario_frascos" ("articulo")
WHERE "producto_id" IS NULL;
