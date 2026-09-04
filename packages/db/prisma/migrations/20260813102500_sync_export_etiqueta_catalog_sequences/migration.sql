WITH market_prefixes (mercado, prefix) AS (
    VALUES
        ('colombia'::"deposito"."Mercado", 'IGETCO'),
        ('bolivia'::"deposito"."Mercado", 'IGETBO'),
        ('paraguay'::"deposito"."Mercado", 'IGETPY'),
        ('mexico'::"deposito"."Mercado", 'IGETMX'),
        ('ecuador'::"deposito"."Mercado", 'IGETEC')
), canonical_maxima AS (
    SELECT
        market_prefixes.mercado,
        COALESCE(MAX(RIGHT(productos.codigo, 3)::INTEGER), 0) AS ultimo
    FROM market_prefixes
    LEFT JOIN "deposito"."productos" AS productos
        ON productos.mercado = market_prefixes.mercado
       AND productos.categoria = 'etiqueta'
       AND productos.codigo ~ ('^' || market_prefixes.prefix || '[0-9]{3}$')
    GROUP BY market_prefixes.mercado
)
INSERT INTO "deposito"."secuencias_codigo_etiqueta" ("mercado", "ultimo")
SELECT mercado, ultimo FROM canonical_maxima
ON CONFLICT ("mercado") DO UPDATE
SET "ultimo" = GREATEST("secuencias_codigo_etiqueta"."ultimo", EXCLUDED."ultimo");
