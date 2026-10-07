-- Preserve existing integer values while allowing fractional drug quantities.
ALTER TABLE "deposito"."ordenes_produccion"
  ALTER COLUMN "cantidad" TYPE DOUBLE PRECISION
  USING "cantidad"::DOUBLE PRECISION;
