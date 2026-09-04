DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "deposito"."productos"
    WHERE "categoria" = 'estuche'::"deposito"."Categoria"
      AND (
        "mercado" IS NULL
        OR cardinality("mercados_habilitados") <> 1
        OR "mercado" <> "mercados_habilitados"[1]
      )
  ) THEN
    RAISE EXCEPTION 'Preflight failed: Estuche requires one matching canonical market';
  END IF;
END $$;

ALTER TABLE "deposito"."productos"
  ADD CONSTRAINT "productos_estuche_canonical_market_check"
  CHECK (
    "categoria" <> 'estuche'::"deposito"."Categoria"
    OR (
      "mercado" IS NOT NULL
      AND cardinality("mercados_habilitados") = 1
      AND "mercado" = "mercados_habilitados"[1]
    )
  )
  NOT VALID;

ALTER TABLE "deposito"."productos"
  VALIDATE CONSTRAINT "productos_estuche_canonical_market_check";
