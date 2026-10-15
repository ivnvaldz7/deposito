-- Una orden conserva la cantidad solicitada y acumula lo ya entregado.
-- Así se puede descontar el stock disponible sin perder el saldo pendiente.
ALTER TABLE "deposito"."ordenes_produccion"
  ADD COLUMN "cantidad_entregada" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Las órdenes históricas que ya estaban cerradas fueron entregadas por completo.
UPDATE "deposito"."ordenes_produccion"
SET "cantidad_entregada" = "cantidad"
WHERE "estado" IN ('aprobada', 'ejecutada', 'completada');
