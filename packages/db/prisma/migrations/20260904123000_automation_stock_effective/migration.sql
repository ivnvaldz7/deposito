-- Automation confirmations are stock-effective operations. Existing orders
-- remain MANUAL so their reservation/Armador workflow is unchanged.

CREATE TYPE "ale_bet"."OrigenPedido" AS ENUM ('MANUAL', 'AUTOMATION');

ALTER TABLE "ale_bet"."Pedido"
  ADD COLUMN "origen" "ale_bet"."OrigenPedido" NOT NULL DEFAULT 'MANUAL',
  ALTER COLUMN "vendedorId" DROP NOT NULL;
