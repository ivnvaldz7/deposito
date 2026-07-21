-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ale_bet";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "deposito";

-- CreateEnum
CREATE TYPE "ale_bet"."EstadoPedido" AS ENUM ('PENDIENTE', 'APROBADO', 'EN_ARMADO', 'COMPLETADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ale_bet"."TipoMovimiento" AS ENUM ('ENTRADA_MANUAL', 'SALIDA_PEDIDO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "deposito"."Role" AS ENUM ('encargado', 'observador', 'solicitante');

-- CreateEnum
CREATE TYPE "deposito"."EstadoActa" AS ENUM ('pendiente', 'parcial', 'completada');

-- CreateEnum
CREATE TYPE "deposito"."Categoria" AS ENUM ('droga', 'estuche', 'etiqueta', 'frasco');

-- CreateEnum
CREATE TYPE "deposito"."Mercado" AS ENUM ('argentina', 'colombia', 'mexico', 'ecuador', 'bolivia', 'paraguay', 'no_exportable');

-- CreateEnum
CREATE TYPE "deposito"."CondicionEmbalaje" AS ENUM ('bueno', 'regular', 'malo');

-- CreateEnum
CREATE TYPE "deposito"."RefTipo" AS ENUM ('acta_item', 'orden');

-- CreateEnum
CREATE TYPE "deposito"."DepositoTipoMovimiento" AS ENUM ('ingreso_acta', 'egreso_orden', 'ajuste_manual');

-- CreateEnum
CREATE TYPE "deposito"."EstadoPendiente" AS ENUM ('en_esterilizacion', 'recibido');

-- CreateEnum
CREATE TYPE "deposito"."Urgencia" AS ENUM ('normal', 'urgente');

-- CreateEnum
CREATE TYPE "deposito"."EstadoOrden" AS ENUM ('solicitada', 'aprobada', 'ejecutada', 'completada', 'rechazada');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "platform"."AppId" ADD VALUE 'portal';
ALTER TYPE "platform"."AppId" ADD VALUE 'admin';

-- AlterTable
ALTER TABLE "platform"."PlatformUser" ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "platform"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "app" "platform"."AppId" NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ale_bet"."Producto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "stockMinimo" INTEGER NOT NULL DEFAULT 100,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ale_bet"."Lote" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cajas" INTEGER NOT NULL DEFAULT 0,
    "sueltos" INTEGER NOT NULL DEFAULT 0,
    "fechaProduccion" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ale_bet"."Cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ale_bet"."Pedido" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "armadorId" TEXT,
    "estado" "ale_bet"."EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ale_bet"."ItemPedido" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ale_bet"."MovimientoStock" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "tipo" "ale_bet"."TipoMovimiento" NOT NULL,
    "referencia" TEXT,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "deposito"."Role" NOT NULL DEFAULT 'observador',
    "platform_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."actas" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "created_by" TEXT NOT NULL,
    "estado" "deposito"."EstadoActa" NOT NULL DEFAULT 'pendiente',
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."acta_items" (
    "id" TEXT NOT NULL,
    "acta_id" TEXT NOT NULL,
    "producto_id" TEXT,
    "categoria" "deposito"."Categoria" NOT NULL,
    "producto_nombre" TEXT NOT NULL,
    "lote" TEXT NOT NULL,
    "vencimiento" DATE,
    "temperatura_transporte" TEXT,
    "condicion_embalaje" "deposito"."CondicionEmbalaje",
    "observaciones_calidad" TEXT,
    "aprobado_calidad" BOOLEAN NOT NULL DEFAULT false,
    "cantidad_ingresada" INTEGER NOT NULL,
    "cantidad_distribuida" INTEGER NOT NULL DEFAULT 0,
    "mercado" "deposito"."Mercado",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acta_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."inventario_drogas" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT,
    "nombre" TEXT NOT NULL,
    "lote" TEXT,
    "vencimiento" DATE,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_drogas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."inventario_estuches" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT,
    "articulo" TEXT NOT NULL,
    "mercado" "deposito"."Mercado" NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_estuches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."inventario_etiquetas" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT,
    "articulo" TEXT NOT NULL,
    "mercado" "deposito"."Mercado" NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."inventario_frascos" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT,
    "articulo" TEXT NOT NULL,
    "unidades_por_caja" INTEGER NOT NULL,
    "cantidad_cajas" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_frascos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."movimientos" (
    "id" TEXT NOT NULL,
    "tipo" "deposito"."DepositoTipoMovimiento" NOT NULL,
    "categoria" "deposito"."Categoria" NOT NULL,
    "producto_nombre" TEXT NOT NULL,
    "lote" TEXT,
    "cantidad" INTEGER NOT NULL,
    "referencia_id" TEXT,
    "referencia_tipo" "deposito"."RefTipo",
    "justificacion" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."insumos_pendientes" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'frasco',
    "articulo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "destino" TEXT NOT NULL,
    "estado" "deposito"."EstadoPendiente" NOT NULL DEFAULT 'en_esterilizacion',
    "fecha_envio" DATE NOT NULL,
    "fecha_retorno_estimada" DATE,
    "fecha_recibido" DATE,
    "notas" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insumos_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."ordenes_produccion" (
    "id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "aprobado_por" TEXT,
    "producto_id" TEXT,
    "categoria" "deposito"."Categoria" NOT NULL,
    "producto_nombre" TEXT NOT NULL,
    "mercado" "deposito"."Mercado",
    "cantidad" INTEGER NOT NULL,
    "urgencia" "deposito"."Urgencia" NOT NULL DEFAULT 'normal',
    "estado" "deposito"."EstadoOrden" NOT NULL DEFAULT 'solicitada',
    "motivo_rechazo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_produccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposito"."productos" (
    "id" TEXT NOT NULL,
    "nombre_base" TEXT NOT NULL,
    "volumen" DECIMAL(10,3),
    "unidad" TEXT,
    "variante" TEXT,
    "categoria" "deposito"."Categoria" NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_leida_createdAt_idx" ON "platform"."Notification"("userId", "leida", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_sku_key" ON "ale_bet"."Producto"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Lote_numero_productoId_key" ON "ale_bet"."Lote"("numero", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_nombre_key" ON "ale_bet"."Cliente"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_numero_key" ON "ale_bet"."Pedido"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "deposito"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_platform_user_id_key" ON "deposito"."users"("platform_user_id");

-- CreateIndex
CREATE INDEX "acta_items_producto_id_idx" ON "deposito"."acta_items"("producto_id");

-- CreateIndex
CREATE INDEX "inventario_drogas_producto_id_idx" ON "deposito"."inventario_drogas"("producto_id");

-- CreateIndex
CREATE INDEX "inventario_drogas_producto_id_lote_idx" ON "deposito"."inventario_drogas"("producto_id", "lote");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_drogas_nombre_lote_key" ON "deposito"."inventario_drogas"("nombre", "lote");

-- CreateIndex
CREATE INDEX "inventario_estuches_producto_id_idx" ON "deposito"."inventario_estuches"("producto_id");

-- CreateIndex
CREATE INDEX "inventario_estuches_producto_id_mercado_idx" ON "deposito"."inventario_estuches"("producto_id", "mercado");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_estuches_articulo_mercado_key" ON "deposito"."inventario_estuches"("articulo", "mercado");

-- CreateIndex
CREATE INDEX "inventario_etiquetas_producto_id_idx" ON "deposito"."inventario_etiquetas"("producto_id");

-- CreateIndex
CREATE INDEX "inventario_etiquetas_producto_id_mercado_idx" ON "deposito"."inventario_etiquetas"("producto_id", "mercado");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_etiquetas_articulo_mercado_key" ON "deposito"."inventario_etiquetas"("articulo", "mercado");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_frascos_articulo_key" ON "deposito"."inventario_frascos"("articulo");

-- CreateIndex
CREATE INDEX "inventario_frascos_producto_id_idx" ON "deposito"."inventario_frascos"("producto_id");

-- CreateIndex
CREATE INDEX "ordenes_produccion_producto_id_idx" ON "deposito"."ordenes_produccion"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "productos_nombre_completo_categoria_key" ON "deposito"."productos"("nombre_completo", "categoria");

-- AddForeignKey
ALTER TABLE "ale_bet"."Lote" ADD CONSTRAINT "Lote_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ale_bet"."Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ale_bet"."Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ale_bet"."Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ale_bet"."ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "ale_bet"."Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ale_bet"."ItemPedido" ADD CONSTRAINT "ItemPedido_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ale_bet"."Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."actas" ADD CONSTRAINT "actas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "deposito"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."acta_items" ADD CONSTRAINT "acta_items_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "deposito"."actas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."acta_items" ADD CONSTRAINT "acta_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."inventario_drogas" ADD CONSTRAINT "inventario_drogas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."inventario_estuches" ADD CONSTRAINT "inventario_estuches_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."inventario_etiquetas" ADD CONSTRAINT "inventario_etiquetas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."inventario_frascos" ADD CONSTRAINT "inventario_frascos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."movimientos" ADD CONSTRAINT "movimientos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "deposito"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."insumos_pendientes" ADD CONSTRAINT "insumos_pendientes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "deposito"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "deposito"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "deposito"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposito"."ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "deposito"."productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
