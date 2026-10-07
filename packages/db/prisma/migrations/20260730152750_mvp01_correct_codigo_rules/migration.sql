-- MVP-01 CORRECT: category-aware codigo rules.
-- Replaces the global "ACTIVO requires codigo" rule with category-specific rules:
--   etiqueta/estuche: ACTIVO requires codigo (IGET/IGES prefix)
--   frasco/droga: ACTIVO allows null codigo
-- Also fixes existing frasco/droga rows that were incorrectly set to PENDIENTE_REVISION.
-- The trigger replacement MUST run BEFORE the backfill UPDATE: the previous global
-- trigger (installed by 20260730111100) raises for ANY ACTIVO row with codigo NULL
-- regardless of category, so backfilling frasco/droga to ACTIVO before replacing it
-- would abort the migration on any legacy database with matching rows.

-- Replace the compatibility trigger with category-aware rules.
CREATE OR REPLACE FUNCTION "deposito".sync_producto_activo_estado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."codigo" := NULLIF(upper(btrim(NEW."codigo")), '');

  IF TG_OP = 'INSERT' THEN
    IF NEW."estado" IS NULL THEN
      IF NEW."activo" = true AND NEW."codigo" IS NULL AND NEW."categoria" IN ('etiqueta', 'estuche') THEN
        RAISE EXCEPTION 'No se puede activar una etiqueta o estuche sin código válido';
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
    IF NEW."activo" = true AND NEW."codigo" IS NULL AND NEW."categoria" IN ('etiqueta', 'estuche') THEN
      RAISE EXCEPTION 'No se puede activar una etiqueta o estuche sin código válido';
    END IF;
    NEW."estado" := CASE
      WHEN NEW."activo" THEN 'ACTIVO'::"deposito"."EstadoProductoCatalogo"
      ELSE 'INACTIVO'::"deposito"."EstadoProductoCatalogo"
    END;
  END IF;

  IF NEW."estado" = 'ACTIVO' AND NEW."codigo" IS NULL AND NEW."categoria" IN ('etiqueta', 'estuche') THEN
    RAISE EXCEPTION 'No se puede activar una etiqueta o estuche sin código válido';
  END IF;
  RETURN NEW;
END $$;

-- Fix existing frasco/droga rows incorrectly set to PENDIENTE_REVISION without codigo.
-- Runs AFTER the trigger replacement so the category-aware trigger (which permits
-- frasco/droga ACTIVO without codigo) governs this UPDATE.
UPDATE "deposito"."productos"
SET "estado" = 'ACTIVO'::"deposito"."EstadoProductoCatalogo",
    "activo" = true
WHERE "categoria" IN ('frasco', 'droga')
  AND "estado" = 'PENDIENTE_REVISION'
  AND "codigo" IS NULL
  AND "activo" = false
  AND "origen" = 'MIGRACION'::"deposito"."OrigenProductoCatalogo";
