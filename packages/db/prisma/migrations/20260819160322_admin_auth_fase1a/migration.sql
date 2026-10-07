-- FASE 1A: admin auth foundation
-- Aditiva: sesiones persistentes, auditoría administrativa, mustChangePassword.

-- 1. Extender PlatformUser con flag de cambio de contraseña obligatorio.
ALTER TABLE "platform"."PlatformUser" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- 2. Sesiones/refresh tokens persistentes y revocables.
CREATE TABLE "platform"."Session" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "platform"."Session"("tokenHash");
CREATE INDEX "Session_platformUserId_idx" ON "platform"."Session"("platformUserId");
CREATE INDEX "Session_tokenHash_idx" ON "platform"."Session"("tokenHash");
CREATE INDEX "Session_expiresAt_idx" ON "platform"."Session"("expiresAt");

ALTER TABLE "platform"."Session" ADD CONSTRAINT "Session_platformUserId_fkey"
    FOREIGN KEY ("platformUserId") REFERENCES "platform"."PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Auditoría administrativa.
CREATE TABLE "platform"."PlatformAuditoria" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "targetUserId" TEXT,
    "action" TEXT NOT NULL,
    "app" "platform"."AppId",
    "previous" JSONB,
    "next" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditoria_targetUserId_createdAt_idx" ON "platform"."PlatformAuditoria"("targetUserId", "createdAt");
CREATE INDEX "PlatformAuditoria_action_createdAt_idx" ON "platform"."PlatformAuditoria"("action", "createdAt");
CREATE INDEX "PlatformAuditoria_actorId_createdAt_idx" ON "platform"."PlatformAuditoria"("actorId", "createdAt");
