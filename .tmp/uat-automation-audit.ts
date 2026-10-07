import 'dotenv/config'
import { Client } from 'pg'

const url = new URL(process.env.PLATFORM_DATABASE_URL ?? '')
url.pathname = '/platform_test'
const client = new Client({ connectionString: url.toString() })

async function main() {
  await client.connect()
  const catalog = await client.query(`
    SELECT id, nombre, activo, "unidadesPorCaja"
    FROM "ale_bet"."Producto"
    WHERE nombre = ANY($1)
    ORDER BY nombre
  `, [[
    'COMPLEJO B B12 B15 100 ML',
    'COMPLEJO B B12 B15 250 ML',
    'CETRI-AMON 1 L',
    'OLIVITASAN PLUS 500 ML',
  ]])
  const aliases = await client.query(`
    SELECT a.id, a.alias, a."aliasNormalized", a."productId", p.nombre
    FROM "ale_bet"."ProductAlias" a
    JOIN "ale_bet"."Producto" p ON p.id = a."productId"
    WHERE lower(a.alias) ~ '(b12|b15|250|100|cetri|plus)'
       OR lower(a."aliasNormalized") ~ '(b12|b15|250|100|cetri|plus)'
    ORDER BY p.nombre, a.alias
  `)
  console.log(JSON.stringify({ catalog: catalog.rows, aliases: aliases.rows }, null, 2))
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1 })
  .finally(() => client.end())
