-- MVP-01 MIGRATE: run only after the explicit CODE_LOAD deployment gate.
-- CODE_LOAD assigns codes through an authorized encargado action or catalog
-- import; codes are never generated from variante, nombre, derived IDs,
-- sequences, or fictitious values. No deletes or CONTRACT operations occur here.
-- La carga nunca usa variante, nombre, IDs derivados, secuencias ni valores ficticios.
-- Matrix after CODE_LOAD: activo=true + código válido → ACTIVO;
-- activo=true + sin código → PENDIENTE_REVISION; activo=false + código válido
-- → INACTIVO; activo=false + sin código → INACTIVO.
-- All preflight checks fail closed before changing data.
DO $$
BEGIN
  IF EXISTS (
    SELECT upper(btrim("codigo"))
    FROM "deposito"."productos"
    WHERE NULLIF(btrim("codigo"), '') IS NOT NULL
    GROUP BY upper(btrim("codigo")) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'MVP-01 abortado: códigos post-CODE_LOAD duplicados después de normalizar; corregir sin descartar registros.';
  END IF;

  IF EXISTS (
    SELECT "producto_id", "mercado" FROM "deposito"."inventario_estuches"
    WHERE "producto_id" IS NOT NULL GROUP BY "producto_id", "mercado" HAVING count(*) > 1
  ) OR EXISTS (
    SELECT "producto_id", "mercado" FROM "deposito"."inventario_etiquetas"
    WHERE "producto_id" IS NOT NULL GROUP BY "producto_id", "mercado" HAVING count(*) > 1
  ) OR EXISTS (
    SELECT "producto_id" FROM "deposito"."inventario_frascos"
    WHERE "producto_id" IS NOT NULL GROUP BY "producto_id" HAVING count(*) > 1
  ) OR EXISTS (
    SELECT "producto_id", "lote" FROM "deposito"."inventario_drogas"
    WHERE "producto_id" IS NOT NULL GROUP BY "producto_id", "lote" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'MVP-01 abortado: inventario histórico no vinculable de forma única; corregir sin borrar filas.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "deposito"."productos"
    WHERE "categoria" IN ('frasco', 'droga')
      AND cardinality("mercados_habilitados") > 0
  ) THEN
    RAISE EXCEPTION 'MVP-01 abortado: frascos o materia prima poseen mercados heredados incompatibles.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "deposito"."productos"
    WHERE "activo" = true
      AND "categoria" IN ('etiqueta', 'estuche')
      AND NULLIF(btrim("codigo"), '') IS NOT NULL
      AND cardinality("mercados_habilitados") = 0
  ) THEN
    RAISE EXCEPTION 'MVP-01 abortado: CODE_LOAD incompleto: etiquetas o estuches activos con código requieren mercados habilitados.';
  END IF;
END $$;

-- Create identity indexes only after preflight proves historical rows are unambiguous.
CREATE UNIQUE INDEX "inventario_estuches_producto_id_mercado_key"
  ON "deposito"."inventario_estuches"("producto_id", "mercado") WHERE "producto_id" IS NOT NULL;
CREATE UNIQUE INDEX "inventario_etiquetas_producto_id_mercado_key"
  ON "deposito"."inventario_etiquetas"("producto_id", "mercado") WHERE "producto_id" IS NOT NULL;
CREATE UNIQUE INDEX "inventario_frascos_producto_id_key"
  ON "deposito"."inventario_frascos"("producto_id") WHERE "producto_id" IS NOT NULL;
CREATE UNIQUE INDEX "inventario_drogas_producto_id_lote_key"
  ON "deposito"."inventario_drogas"("producto_id", "lote") WHERE "producto_id" IS NOT NULL;

UPDATE "deposito"."productos"
SET "codigo" = NULLIF(upper(btrim("codigo")), ''),
    "estado" = CASE
      WHEN "activo" = false THEN 'INACTIVO'::"deposito"."EstadoProductoCatalogo"
      WHEN NULLIF(btrim("codigo"), '') IS NULL THEN 'PENDIENTE_REVISION'::"deposito"."EstadoProductoCatalogo"
      ELSE 'ACTIVO'::"deposito"."EstadoProductoCatalogo"
    END,
    -- Keep the legacy compatibility field aligned with the new source of truth.
    -- A legacy active record without a valid code becomes pending and cannot be
    -- treated as operational by still-running pre-MVP application instances.
    "activo" = CASE
      WHEN "activo" = false THEN false
      WHEN NULLIF(btrim("codigo"), '') IS NULL THEN false
      ELSE true
    END;

-- New application versions dual-write state and activo until CONTRACT.
CREATE OR REPLACE FUNCTION "deposito".sync_producto_activo_estado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."codigo" := NULLIF(upper(btrim(NEW."codigo")), '');

  IF TG_OP = 'INSERT' THEN
    IF NEW."estado" IS NULL THEN
      IF NEW."activo" = true AND NEW."codigo" IS NULL THEN
        RAISE EXCEPTION 'No se puede activar un producto sin código válido';
      END IF;
      NEW."estado" := CASE
        WHEN NEW."activo" THEN 'ACTIVO'::"deposito"."EstadoProductoCatalogo"
        ELSE 'INACTIVO'::"deposito"."EstadoProductoCatalogo"
      END;
    END IF;
    NEW."activo" := (NEW."estado" = 'ACTIVO');
  ELSIF NEW."estado" IS DISTINCT FROM OLD."estado" THEN
    NEW."activo" := (NEW."estado" = 'ACTIVO');
  ELSIF NEW."activo" IS DISTINCT FROM OLD."activo" THEN
    IF NEW."activo" = true AND NEW."codigo" IS NULL THEN
      RAISE EXCEPTION 'No se puede activar un producto sin código válido';
    END IF;
    NEW."estado" := CASE
      WHEN NEW."activo" THEN 'ACTIVO'::"deposito"."EstadoProductoCatalogo"
      ELSE 'INACTIVO'::"deposito"."EstadoProductoCatalogo"
    END;
  END IF;

  IF NEW."estado" = 'ACTIVO' AND NEW."codigo" IS NULL THEN
    RAISE EXCEPTION 'No se puede activar un producto sin código válido';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER productos_sync_activo_estado
BEFORE INSERT OR UPDATE ON "deposito"."productos"
FOR EACH ROW EXECUTE FUNCTION "deposito".sync_producto_activo_estado();
