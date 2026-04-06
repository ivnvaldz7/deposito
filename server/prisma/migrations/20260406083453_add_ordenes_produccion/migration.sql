-- CreateEnum
CREATE TYPE "Urgencia" AS ENUM ('normal', 'urgente');

-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('solicitada', 'aprobada', 'ejecutada', 'completada', 'rechazada');

-- CreateTable
CREATE TABLE "ordenes_produccion" (
    "id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "aprobado_por" TEXT,
    "categoria" "Categoria" NOT NULL,
    "producto_nombre" TEXT NOT NULL,
    "mercado" "Mercado",
    "cantidad" INTEGER NOT NULL,
    "urgencia" "Urgencia" NOT NULL DEFAULT 'normal',
    "estado" "EstadoOrden" NOT NULL DEFAULT 'solicitada',
    "motivo_rechazo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_produccion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
