INSERT INTO "deposito"."secuencias_codigo_etiqueta" ("mercado", "ultimo")
VALUES
    ('colombia', 0),
    ('bolivia', 0),
    ('paraguay', 0),
    ('mexico', 0),
    ('ecuador', 0)
ON CONFLICT ("mercado") DO NOTHING;
