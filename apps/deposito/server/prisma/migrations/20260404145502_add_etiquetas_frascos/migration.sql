-- CreateTable
CREATE TABLE "inventario_etiquetas" (
    "id" TEXT NOT NULL,
    "articulo" TEXT NOT NULL,
    "mercado" "Mercado" NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_frascos" (
    "id" TEXT NOT NULL,
    "articulo" TEXT NOT NULL,
    "unidades_por_caja" INTEGER NOT NULL,
    "cantidad_cajas" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_frascos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventario_etiquetas_articulo_mercado_key" ON "inventario_etiquetas"("articulo", "mercado");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_frascos_articulo_key" ON "inventario_frascos"("articulo");
