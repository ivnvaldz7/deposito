ALTER TABLE deposito.inventario_drogas
  VALIDATE CONSTRAINT chk_inv_drogas_cantidad_no_negativa;

ALTER TABLE deposito.inventario_estuches
  VALIDATE CONSTRAINT chk_inv_estuches_cantidad_no_negativa;

ALTER TABLE deposito.inventario_etiquetas
  VALIDATE CONSTRAINT chk_inv_etiquetas_cantidad_no_negativa;

ALTER TABLE deposito.inventario_frascos
  VALIDATE CONSTRAINT chk_inv_frascos_cajas_no_negativa;

ALTER TABLE deposito.inventario_frascos
  VALIDATE CONSTRAINT chk_inv_frascos_upc_positiva;

ALTER TABLE deposito.inventario_frascos
  VALIDATE CONSTRAINT chk_inv_frascos_total_coherente;

ALTER TABLE deposito.movimientos
  VALIDATE CONSTRAINT chk_movimientos_cantidad_no_cero;
