-- El saldo físico de frascos se representa explícitamente como:
-- cajas completas + unidades sueltas = total. La migración conserva el total
-- existente y hace visible el resto que antes estaba implícito.
ALTER TABLE deposito.inventario_frascos
  ADD COLUMN unidades_sueltas INTEGER NOT NULL DEFAULT 0;

UPDATE deposito.inventario_frascos
SET unidades_sueltas = total - (cantidad_cajas * unidades_por_caja);

ALTER TABLE deposito.inventario_frascos
  DROP CONSTRAINT chk_inv_frascos_total_coherente;

ALTER TABLE deposito.inventario_frascos
  ADD CONSTRAINT chk_inv_frascos_total_coherente
  CHECK (
    unidades_por_caja > 0
    AND cantidad_cajas >= 0
    AND unidades_sueltas >= 0
    AND unidades_sueltas < unidades_por_caja
    AND total::bigint = cantidad_cajas::bigint * unidades_por_caja::bigint + unidades_sueltas::bigint
  );

-- contenido nominal: sólo se completa cuando el nombre declara sin ambigüedad
-- una medida. Los productos sin medida declarada permanecen en NULL para que el
-- operador los complete, sin inventar información de catálogo.
WITH contenido_detectado AS (
  SELECT
    id,
    replace(capturas[1], ',', '.')::numeric AS volumen,
    capturas[3] AS unidad
  FROM deposito.productos
  CROSS JOIN LATERAL regexp_match(
    upper(nombre_completo),
    '([0-9]+([.,][0-9]+)?)[[:space:]]*(ML|L|GR)([^A-Z]|$)'
  ) AS capturas
  WHERE categoria = 'frasco'
    AND volumen IS NULL
)
UPDATE deposito.productos AS producto
SET volumen = contenido_detectado.volumen,
    unidad = contenido_detectado.unidad
FROM contenido_detectado
WHERE producto.id = contenido_detectado.id;
