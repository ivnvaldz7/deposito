ALTER TABLE "ale_bet"."Producto" ALTER COLUMN "stockMinimo" DROP DEFAULT;
ALTER TABLE "ale_bet"."Producto" ALTER COLUMN "stockMinimo" DROP NOT NULL;
ALTER TABLE "deposito"."productos" ADD COLUMN "stock_minimo" INTEGER;
