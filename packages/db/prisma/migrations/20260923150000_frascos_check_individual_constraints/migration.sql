-- Let the dedicated positive-UPC constraint identify invalid package sizes;
-- otherwise the derived box/total check masks that more specific violation.
ALTER TABLE deposito.inventario_frascos
  DROP CONSTRAINT chk_inv_frascos_total_coherente;

ALTER TABLE deposito.inventario_frascos
  ADD CONSTRAINT chk_inv_frascos_total_coherente
  CHECK (
    unidades_por_caja <= 0
    OR (
      total::bigint >= cantidad_cajas::bigint * unidades_por_caja::bigint
      AND total::bigint < (cantidad_cajas::bigint + 1) * unidades_por_caja::bigint
    )
  ) NOT VALID;

ALTER TABLE deposito.inventario_frascos
  VALIDATE CONSTRAINT chk_inv_frascos_total_coherente;
