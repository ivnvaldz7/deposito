-- Drug quantities are expressed in kilograms and may be fractional (for
-- example, 0.2 kg). Existing whole-number values are preserved exactly.
ALTER TABLE "deposito"."inventario_drogas"
  ALTER COLUMN "cantidad" TYPE DOUBLE PRECISION
  USING "cantidad"::DOUBLE PRECISION;

ALTER TABLE "deposito"."acta_items"
  ALTER COLUMN "cantidad_ingresada" TYPE DOUBLE PRECISION
  USING "cantidad_ingresada"::DOUBLE PRECISION,
  ALTER COLUMN "cantidad_distribuida" TYPE DOUBLE PRECISION
  USING "cantidad_distribuida"::DOUBLE PRECISION;

ALTER TABLE "deposito"."movimientos"
  ALTER COLUMN "cantidad" TYPE DOUBLE PRECISION
  USING "cantidad"::DOUBLE PRECISION;
