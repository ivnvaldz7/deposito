-- AlterTable
ALTER TABLE "acta_items" ADD COLUMN     "producto_id" TEXT;

-- AlterTable
ALTER TABLE "inventario_drogas" ADD COLUMN     "producto_id" TEXT;

-- AlterTable
ALTER TABLE "inventario_estuches" ADD COLUMN     "producto_id" TEXT;

-- AlterTable
ALTER TABLE "inventario_etiquetas" ADD COLUMN     "producto_id" TEXT;

-- AlterTable
ALTER TABLE "inventario_frascos" ADD COLUMN     "producto_id" TEXT;

-- AlterTable
ALTER TABLE "ordenes_produccion" ADD COLUMN     "producto_id" TEXT;

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "nombre_base" TEXT NOT NULL,
    "volumen" DECIMAL(10,3),
    "unidad" TEXT,
    "variante" TEXT,
    "categoria" "Categoria" NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "productos_nombre_completo_categoria_key" ON "productos"("nombre_completo", "categoria");

-- CreateIndex
CREATE INDEX "acta_items_producto_id_idx" ON "acta_items"("producto_id");

-- CreateIndex
CREATE INDEX "inventario_drogas_producto_id_idx" ON "inventario_drogas"("producto_id");

-- CreateIndex
CREATE INDEX "inventario_drogas_producto_id_lote_idx" ON "inventario_drogas"("producto_id", "lote");

-- CreateIndex
CREATE INDEX "inventario_estuches_producto_id_idx" ON "inventario_estuches"("producto_id");

-- CreateIndex
CREATE INDEX "inventario_estuches_producto_id_mercado_idx" ON "inventario_estuches"("producto_id", "mercado");

-- CreateIndex
CREATE INDEX "inventario_etiquetas_producto_id_idx" ON "inventario_etiquetas"("producto_id");

-- CreateIndex
CREATE INDEX "inventario_etiquetas_producto_id_mercado_idx" ON "inventario_etiquetas"("producto_id", "mercado");

-- CreateIndex
CREATE INDEX "inventario_frascos_producto_id_idx" ON "inventario_frascos"("producto_id");

-- CreateIndex
CREATE INDEX "ordenes_produccion_producto_id_idx" ON "ordenes_produccion"("producto_id");

-- AddForeignKey
ALTER TABLE "acta_items" ADD CONSTRAINT "acta_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_drogas" ADD CONSTRAINT "inventario_drogas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_estuches" ADD CONSTRAINT "inventario_estuches_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_etiquetas" ADD CONSTRAINT "inventario_etiquetas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_frascos" ADD CONSTRAINT "inventario_frascos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
