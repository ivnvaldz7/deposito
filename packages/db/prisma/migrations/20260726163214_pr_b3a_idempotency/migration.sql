-- CreateEnum
CREATE TYPE "platform"."IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED');

-- CreateTable
CREATE TABLE "platform"."idempotency_records" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "status" "platform"."IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_records_createdAt_idx" ON "platform"."idempotency_records"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actorId_scope_idempotencyKey_key" ON "platform"."idempotency_records"("actorId", "scope", "idempotencyKey");
