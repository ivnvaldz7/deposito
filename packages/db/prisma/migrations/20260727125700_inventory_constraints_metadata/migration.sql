DO $$ 
BEGIN
  -- 1. Preflight validations
  IF EXISTS (SELECT 1 FROM deposito.inventario_drogas WHERE cantidad < 0) THEN
    RAISE EXCEPTION 'Abortando: filas con cantidad negativa en inventario_drogas. Corregir manualmente.';
  END IF;

  IF EXISTS (SELECT 1 FROM deposito.inventario_estuches WHERE cantidad < 0) THEN
    RAISE EXCEPTION 'Abortando: filas con cantidad negativa en inventario_estuches. Corregir manualmente.';
  END IF;

  IF EXISTS (SELECT 1 FROM deposito.inventario_etiquetas WHERE cantidad < 0) THEN
    RAISE EXCEPTION 'Abortando: filas con cantidad negativa en inventario_etiquetas. Corregir manualmente.';
  END IF;

  IF EXISTS (SELECT 1 FROM deposito.inventario_frascos WHERE cantidad_cajas < 0) THEN
    RAISE EXCEPTION 'Abortando: filas con cantidad_cajas negativa en inventario_frascos. Corregir manualmente.';
  END IF;

  IF EXISTS (SELECT 1 FROM deposito.inventario_frascos WHERE unidades_por_caja <= 0) THEN
    RAISE EXCEPTION 'Abortando: filas con unidades_por_caja <= 0 en inventario_frascos. Corregir manualmente.';
  END IF;

  IF EXISTS (SELECT 1 FROM deposito.inventario_frascos WHERE total::bigint <> cantidad_cajas::bigint * unidades_por_caja::bigint) THEN
    RAISE EXCEPTION 'Abortando: filas con incoherencia entre cajas, upc y total en inventario_frascos. Corregir manualmente.';
  END IF;

  IF EXISTS (SELECT 1 FROM deposito.movimientos WHERE cantidad = 0) THEN
    RAISE EXCEPTION 'Abortando: filas con cantidad 0 en movimientos. Corregir manualmente.';
  END IF;
END $$;

-- 2. Metadata definitions (NOT VALID)
ALTER TABLE deposito.inventario_drogas
  ADD CONSTRAINT chk_inv_drogas_cantidad_no_negativa CHECK (cantidad >= 0) NOT VALID;

ALTER TABLE deposito.inventario_estuches
  ADD CONSTRAINT chk_inv_estuches_cantidad_no_negativa CHECK (cantidad >= 0) NOT VALID;

ALTER TABLE deposito.inventario_etiquetas
  ADD CONSTRAINT chk_inv_etiquetas_cantidad_no_negativa CHECK (cantidad >= 0) NOT VALID;

ALTER TABLE deposito.inventario_frascos
  ADD CONSTRAINT chk_inv_frascos_cajas_no_negativa CHECK (cantidad_cajas >= 0) NOT VALID;

ALTER TABLE deposito.inventario_frascos
  ADD CONSTRAINT chk_inv_frascos_upc_positiva CHECK (unidades_por_caja > 0) NOT VALID;

ALTER TABLE deposito.inventario_frascos
  ADD CONSTRAINT chk_inv_frascos_total_coherente CHECK (total::bigint = cantidad_cajas::bigint * unidades_por_caja::bigint) NOT VALID;

ALTER TABLE deposito.movimientos
  ADD CONSTRAINT chk_movimientos_cantidad_no_cero CHECK (cantidad <> 0) NOT VALID;
