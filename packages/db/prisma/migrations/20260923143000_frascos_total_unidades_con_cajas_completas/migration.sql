-- total is the physical unit balance. cantidad_cajas is the number of complete
-- boxes, so a remainder of loose units is valid after a unit-based order.
ALTER TABLE deposito.inventario_frascos
  DROP CONSTRAINT chk_inv_frascos_total_coherente;

ALTER TABLE deposito.inventario_frascos
  ADD CONSTRAINT chk_inv_frascos_total_coherente
  CHECK (
    total::bigint >= cantidad_cajas::bigint * unidades_por_caja::bigint
    AND total::bigint < (cantidad_cajas::bigint + 1) * unidades_por_caja::bigint
  ) NOT VALID;

ALTER TABLE deposito.inventario_frascos
  VALIDATE CONSTRAINT chk_inv_frascos_total_coherente;
