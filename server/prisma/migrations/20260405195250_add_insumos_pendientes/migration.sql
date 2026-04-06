-- CreateEnum
CREATE TYPE "EstadoPendiente" AS ENUM ('en_esterilizacion', 'recibido');

-- CreateTable
CREATE TABLE "insumos_pendientes" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'frasco',
    "articulo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "destino" TEXT NOT NULL,
    "estado" "EstadoPendiente" NOT NULL DEFAULT 'en_esterilizacion',
    "fecha_envio" DATE NOT NULL,
    "fecha_retorno_estimada" DATE,
    "fecha_recibido" DATE,
    "notas" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insumos_pendientes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "insumos_pendientes" ADD CONSTRAINT "insumos_pendientes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
