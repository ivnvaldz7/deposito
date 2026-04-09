-- CreateEnum
CREATE TYPE "RefTipo" AS ENUM ('acta_item', 'orden');

-- DropForeignKey
ALTER TABLE "movimientos" DROP CONSTRAINT "movimientos_referencia_id_fkey";

-- AlterTable
ALTER TABLE "movimientos" ADD COLUMN     "referencia_tipo" "RefTipo";
