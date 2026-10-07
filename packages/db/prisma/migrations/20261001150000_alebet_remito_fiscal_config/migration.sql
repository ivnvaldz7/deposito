ALTER TABLE "ale_bet"."Cliente"
  ADD COLUMN "transportistaPredeterminadoId" TEXT;

ALTER TABLE "ale_bet"."Remito"
  ADD COLUMN "caiSnapshot" JSONB;

ALTER TABLE "ale_bet"."Cliente"
  ADD CONSTRAINT "Cliente_transportistaPredeterminadoId_fkey"
  FOREIGN KEY ("transportistaPredeterminadoId") REFERENCES "ale_bet"."Transportista"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Cliente_transportistaPredeterminadoId_idx"
  ON "ale_bet"."Cliente"("transportistaPredeterminadoId");

CREATE TABLE "ale_bet"."ConfiguracionRemito" (
  "id" TEXT NOT NULL,
  "puntoVenta" TEXT NOT NULL,
  "proximoCorrelativo" INTEGER,
  "numeracionInicializadaAt" TIMESTAMP(3),
  "cai" TEXT NOT NULL,
  "caiVencimiento" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfiguracionRemito_pkey" PRIMARY KEY ("id")
);
