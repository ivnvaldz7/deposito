CREATE TABLE "deposito"."secuencias_codigo_etiqueta" (
    "mercado" "deposito"."Mercado" NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "secuencias_codigo_etiqueta_pkey" PRIMARY KEY ("mercado")
);

INSERT INTO "deposito"."secuencias_codigo_etiqueta" ("mercado", "ultimo")
VALUES ('argentina', 0);
