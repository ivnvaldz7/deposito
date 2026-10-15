CREATE TABLE "deposito"."zerox_movimientos" (
    "id" TEXT NOT NULL,
    "clave_operacion" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "nombre_producto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "saldo_resultante" INTEGER NOT NULL,
    "fecha_movimiento" DATE NOT NULL,
    "registrado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" TEXT NOT NULL,
    "observacion" TEXT,
    CONSTRAINT "zerox_movimientos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "zerox_movimientos_categoria_check" CHECK ("categoria" IN ('frasco', 'tapa')),
    CONSTRAINT "zerox_movimientos_cantidad_check" CHECK ("cantidad" > 0),
    CONSTRAINT "zerox_movimientos_saldo_check" CHECK ("saldo_resultante" >= 0),
    CONSTRAINT "zerox_movimientos_delta_check" CHECK (("tipo" = 'ingreso' AND "delta" = "cantidad") OR ("tipo" = 'salida' AND "delta" = -"cantidad"))
);

CREATE INDEX "zerox_movimientos_producto_id_registrado_at_idx" ON "deposito"."zerox_movimientos"("producto_id", "registrado_at");
CREATE UNIQUE INDEX "zerox_movimientos_clave_operacion_key" ON "deposito"."zerox_movimientos"("clave_operacion");
CREATE INDEX "zerox_movimientos_fecha_movimiento_registrado_at_idx" ON "deposito"."zerox_movimientos"("fecha_movimiento", "registrado_at");
ALTER TABLE "deposito"."zerox_movimientos" ADD CONSTRAINT "zerox_movimientos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deposito"."zerox_movimientos" ADD CONSTRAINT "zerox_movimientos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "deposito"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
