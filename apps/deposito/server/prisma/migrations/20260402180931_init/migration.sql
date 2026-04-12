-- CreateEnum
CREATE TYPE "Role" AS ENUM ('encargado', 'observador', 'solicitante');

-- CreateEnum
CREATE TYPE "EstadoActa" AS ENUM ('pendiente', 'parcial', 'completada');

-- CreateEnum
CREATE TYPE "Categoria" AS ENUM ('droga', 'estuche', 'etiqueta', 'frasco');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ingreso_acta', 'egreso_orden', 'ajuste_manual');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'observador',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actas" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "created_by" TEXT NOT NULL,
    "estado" "EstadoActa" NOT NULL DEFAULT 'pendiente',
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acta_items" (
    "id" TEXT NOT NULL,
    "acta_id" TEXT NOT NULL,
    "categoria" "Categoria" NOT NULL,
    "producto_nombre" TEXT NOT NULL,
    "lote" TEXT NOT NULL,
    "cantidad_ingresada" INTEGER NOT NULL,
    "cantidad_distribuida" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acta_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_drogas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_drogas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "categoria" "Categoria" NOT NULL,
    "producto_nombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "referencia_id" TEXT,
    "justificacion" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_drogas_nombre_key" ON "inventario_drogas"("nombre");

-- AddForeignKey
ALTER TABLE "actas" ADD CONSTRAINT "actas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_items" ADD CONSTRAINT "acta_items_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "actas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_referencia_id_fkey" FOREIGN KEY ("referencia_id") REFERENCES "acta_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
