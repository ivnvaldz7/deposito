-- Correct the Venezuelan label volume unit. This is nomenclature only: product
-- identities, quantities, codes, stock and audit timestamps are preserved.
-- `CM3` remains the canonical machine value for unidad; displayed names use cm³.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM deposito.productos AS original
    JOIN deposito.productos AS corrected
      ON corrected.id <> original.id
      AND corrected.categoria = original.categoria
      AND corrected.mercado IS NOT DISTINCT FROM original.mercado
      AND corrected.nombre_completo = regexp_replace(original.nombre_completo, 'DM(3|³)', 'cm³', 'gi')
    WHERE original.categoria = 'etiqueta'
      AND original.nombre_completo ~* 'DM(3|³)'
  ) THEN
    RAISE EXCEPTION 'No se puede renombrar etiquetas DM3: el nombre cm³ corregido ya existe en el catálogo.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM deposito.inventario_etiquetas AS original
    JOIN deposito.inventario_etiquetas AS corrected
      ON corrected.id <> original.id
      AND corrected.mercado = original.mercado
      AND corrected.articulo = regexp_replace(original.articulo, 'DM(3|³)', 'cm³', 'gi')
    WHERE original.articulo ~* 'DM(3|³)'
  ) THEN
    RAISE EXCEPTION 'No se puede renombrar etiquetas DM3: el artículo cm³ corregido ya existe en inventario.';
  END IF;
END $$;

UPDATE deposito.productos
SET
  unidad = CASE WHEN unidad ~* '^DM(3|³)$' THEN 'CM3' ELSE unidad END,
  nombre_base = regexp_replace(nombre_base, 'DM(3|³)', 'cm³', 'gi'),
  nombre_completo = regexp_replace(nombre_completo, 'DM(3|³)', 'cm³', 'gi'),
  updated_at = CURRENT_TIMESTAMP
WHERE categoria = 'etiqueta'
  AND (unidad ~* 'DM(3|³)' OR nombre_base ~* 'DM(3|³)' OR nombre_completo ~* 'DM(3|³)');

UPDATE deposito.inventario_etiquetas
SET articulo = regexp_replace(articulo, 'DM(3|³)', 'cm³', 'gi')
WHERE articulo ~* 'DM(3|³)';

UPDATE deposito.acta_items
SET producto_nombre = regexp_replace(producto_nombre, 'DM(3|³)', 'cm³', 'gi')
WHERE categoria = 'etiqueta'
  AND producto_nombre ~* 'DM(3|³)';

UPDATE deposito.movimientos
SET producto_nombre = regexp_replace(producto_nombre, 'DM(3|³)', 'cm³', 'gi')
WHERE categoria = 'etiqueta'
  AND producto_nombre ~* 'DM(3|³)';

UPDATE deposito.ordenes_produccion
SET producto_nombre = regexp_replace(producto_nombre, 'DM(3|³)', 'cm³', 'gi'),
  updated_at = CURRENT_TIMESTAMP
WHERE categoria = 'etiqueta'
  AND producto_nombre ~* 'DM(3|³)';

UPDATE deposito.zerox_movimientos
SET nombre_producto = regexp_replace(nombre_producto, 'DM(3|³)', 'cm³', 'gi')
WHERE nombre_producto ~* 'DM(3|³)';

UPDATE deposito.insumos_pendientes
SET articulo = regexp_replace(articulo, 'DM(3|³)', 'cm³', 'gi'),
  updated_at = CURRENT_TIMESTAMP
WHERE articulo ~* 'DM(3|³)';
