-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateEnum
CREATE TYPE "platform"."AppId" AS ENUM ('deposito', 'ale_bet');

-- CreateTable
CREATE TABLE "platform"."PlatformUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."AppAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "app" "platform"."AppId" NOT NULL,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_email_key" ON "platform"."PlatformUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AppAccess_userId_app_key" ON "platform"."AppAccess"("userId", "app");

-- AddForeignKey
ALTER TABLE "platform"."AppAccess" ADD CONSTRAINT "AppAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "platform"."PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
