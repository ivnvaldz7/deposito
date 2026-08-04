-- ALEBET-01 rollout: EXPAND -> PREFLIGHT -> BACKFILL -> SWITCH.
-- No CONTRACT step is included: legacy operational data is retained and this
-- migration intentionally never fabricates lot allocation or stock reservations.

-- PREFLIGHT. The legacy implementation deducted stock when an order was taken
-- and persisted no allocation by lot. APROBADO orders also have no reservation
-- lineage. Switching either state without operator drainage would corrupt the
-- physical-vs-reserved invariant, so fail closed before applying any DDL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ale_bet"."Pedido"
    WHERE "estado" IN ('APROBADO', 'EN_ARMADO')
  ) THEN
    RAISE EXCEPTION
      'ALEBET-01 preflight blocked: drain legacy APROBADO and EN_ARMADO pedidos before switch; reservations cannot be reconstructed safely';
  END IF;
END $$;

-- BACKFILL/SWITCH. PostgreSQL enum renames preserve all historical rows.
ALTER TYPE "ale_bet"."EstadoPedido" RENAME VALUE 'PENDIENTE' TO 'BORRADOR';
ALTER TYPE "ale_bet"."EstadoPedido" RENAME VALUE 'COMPLETADO' TO 'DESPACHADO';
ALTER TYPE "ale_bet"."EstadoPedido" ADD VALUE 'PREPARADO' BEFORE 'DESPACHADO';

CREATE TYPE "ale_bet"."EstadoCliente" AS ENUM ('PENDIENTE_CLIENTE', 'VALIDADO');
CREATE TYPE "ale_bet"."EstadoReserva" AS ENUM ('ACTIVA', 'LIBERADA', 'CONSUMIDA');
CREATE TYPE "ale_bet"."EstadoRemito" AS ENUM ('VIGENTE', 'INVALIDADO');

ALTER TABLE "ale_bet"."Cliente"
  ADD COLUMN "localidad" TEXT,
  ADD COLUMN "provincia" TEXT,
  ADD COLUMN "referencia" TEXT,
  ADD COLUMN "cuit" TEXT,
  ADD COLUMN "condicionIva" TEXT,
  ADD COLUMN "condicionVenta" TEXT,
  ADD COLUMN "estado" "ale_bet"."EstadoCliente" NOT NULL DEFAULT 'VALIDADO',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ale_bet"."Pedido"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cancelacionSolicitadaAt" TIMESTAMP(3),
  ADD COLUMN "cancelacionSolicitadaPor" TEXT,
  ADD COLUMN "motivoCancelacion" TEXT,
  ADD COLUMN "aprobadoAt" TIMESTAMP(3),
  ADD COLUMN "preparadoAt" TIMESTAMP(3),
  ADD COLUMN "despachadoAt" TIMESTAMP(3),
  ADD COLUMN "canceladoAt" TIMESTAMP(3);

ALTER TABLE "ale_bet"."MovimientoStock"
  ADD COLUMN "pedidoId" TEXT,
  ADD COLUMN "loteId" TEXT,
  ADD COLUMN "reservaId" TEXT;

CREATE TABLE "ale_bet"."ReservaStock" (
  "id" TEXT NOT NULL,
  "pedidoId" TEXT NOT NULL,
  "itemPedidoId" TEXT NOT NULL,
  "loteId" TEXT NOT NULL,
  "cantidad" INTEGER NOT NULL CHECK ("cantidad" > 0),
  "estado" "ale_bet"."EstadoReserva" NOT NULL DEFAULT 'ACTIVA',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "ReservaStock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReservaStock_itemPedidoId_loteId_key" UNIQUE ("itemPedidoId", "loteId"),
  CONSTRAINT "ReservaStock_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "ale_bet"."Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReservaStock_itemPedidoId_fkey" FOREIGN KEY ("itemPedidoId") REFERENCES "ale_bet"."ItemPedido"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReservaStock_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "ale_bet"."Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReservaStock_loteId_estado_idx" ON "ale_bet"."ReservaStock"("loteId", "estado");
CREATE INDEX "ReservaStock_pedidoId_estado_idx" ON "ale_bet"."ReservaStock"("pedidoId", "estado");

CREATE TABLE "ale_bet"."PedidoAuditoria" (
  "id" TEXT NOT NULL,
  "pedidoId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "accion" TEXT NOT NULL,
  "motivo" TEXT,
  "anterior" JSONB,
  "nuevo" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PedidoAuditoria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PedidoAuditoria_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "ale_bet"."Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PedidoAuditoria_pedidoId_createdAt_idx" ON "ale_bet"."PedidoAuditoria"("pedidoId", "createdAt");

CREATE TABLE "ale_bet"."Transportista" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "direccion" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Transportista_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Transportista_nombre_direccion_key" ON "ale_bet"."Transportista"("nombre", "direccion");

CREATE TABLE "ale_bet"."Remito" (
  "id" TEXT NOT NULL,
  "pedidoId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transportistaId" TEXT,
  "transporteNombre" TEXT NOT NULL,
  "transporteDireccion" TEXT NOT NULL,
  "clienteSnapshot" JSONB NOT NULL,
  "transporteSnapshot" JSONB NOT NULL,
  "itemsSnapshot" JSONB NOT NULL,
  "estado" "ale_bet"."EstadoRemito" NOT NULL DEFAULT 'VIGENTE',
  "invalidadoAt" TIMESTAMP(3),
  "invalidadoPor" TEXT,
  "motivoInvalidacion" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Remito_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Remito_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "ale_bet"."Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Remito_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "ale_bet"."Transportista"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Remito_numero_key" ON "ale_bet"."Remito"("numero");
CREATE INDEX "Remito_pedidoId_estado_idx" ON "ale_bet"."Remito"("pedidoId", "estado");
