-- AUTOMATION-01 aliases. Additive schema-only migration.

CREATE TABLE "ale_bet"."ProductAlias" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ale_bet"."ClientAlias" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductAlias_aliasNormalized_key" ON "ale_bet"."ProductAlias"("aliasNormalized");
CREATE INDEX "ProductAlias_aliasNormalized_idx" ON "ale_bet"."ProductAlias"("aliasNormalized");
CREATE UNIQUE INDEX "ClientAlias_aliasNormalized_key" ON "ale_bet"."ClientAlias"("aliasNormalized");
CREATE INDEX "ClientAlias_aliasNormalized_idx" ON "ale_bet"."ClientAlias"("aliasNormalized");

ALTER TABLE "ale_bet"."ProductAlias"
    ADD CONSTRAINT "ProductAlias_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "ale_bet"."Producto"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ale_bet"."ClientAlias"
    ADD CONSTRAINT "ClientAlias_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "ale_bet"."Cliente"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
