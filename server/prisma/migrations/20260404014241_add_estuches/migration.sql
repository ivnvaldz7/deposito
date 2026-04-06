-- CreateEnum
CREATE TYPE "Mercado" AS ENUM ('argentina', 'colombia', 'mexico', 'ecuador', 'bolivia', 'paraguay', 'no_exportable');

-- AlterTable
ALTER TABLE "acta_items" ADD COLUMN     "mercado" "Mercado";

-- CreateTable
CREATE TABLE "inventario_estuches" (
    "id" TEXT NOT NULL,
    "articulo" TEXT NOT NULL,
    "mercado" "Mercado" NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_estuches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventario_estuches_articulo_mercado_key" ON "inventario_estuches"("articulo", "mercado");
