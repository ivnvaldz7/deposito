-- La categoría auxiliar no se segmenta por mercado. Actualiza la restricción
-- introducida antes de que existiera material_empaque.
ALTER TABLE "deposito"."productos"
  DROP CONSTRAINT "productos_mercados_habilitados_categoria_check";

ALTER TABLE "deposito"."productos"
  ADD CONSTRAINT "productos_mercados_habilitados_categoria_check"
  CHECK (
    ("categoria" IN ('etiqueta', 'estuche') AND (
      "estado" IS DISTINCT FROM 'ACTIVO'::"deposito"."EstadoProductoCatalogo"
      OR cardinality("mercados_habilitados") > 0
    ))
    OR ("categoria" IN ('frasco', 'droga', 'material_empaque') AND cardinality("mercados_habilitados") = 0)
  );
