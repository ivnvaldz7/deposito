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
  const cetri = await client.query(`
    SELECT id, nombre, activo, "unidadesPorCaja"
    FROM "ale_bet"."Producto"
    WHERE nombre = 'CETRI-AMON 1 L'
  `)
  const cetriId = cetri.rows[0]?.id
  const lots = cetriId ? await client.query(`
    SELECT l.id, l.numero, l.activo, l.cajas, l.sueltos, l."fechaProduccion", l."fechaVencimiento",
           s.id AS "saldoId", s.cantidad AS "saldoCantidad", u.codigo AS "ubicacion"
    FROM "ale_bet"."Lote" l
    LEFT JOIN "ale_bet"."SaldoStock" s ON s."loteId" = l.id
    LEFT JOIN "ale_bet"."UbicacionStock" u ON u.id = s."ubicacionId"
    WHERE l."productoId" = $1
    ORDER BY l."createdAt", l.id, u.codigo
  `, [cetriId]) : { rows: [] }
  const reservations = cetriId ? await client.query(`
    SELECT r.id, r.cantidad, r.estado, r."createdAt", r."consumedAt", r."releasedAt",
           l.numero AS "loteNumero", u.codigo AS "ubicacion", i.id AS "itemPedidoId", i.cantidad AS "itemCantidad",
           pe.id AS "pedidoId", pe.numero AS "pedidoNumero", pe.origen, pe.estado AS "pedidoEstado", pe."createdAt" AS "pedidoCreatedAt"
    FROM "ale_bet"."ReservaStock" r
    JOIN "ale_bet"."Lote" l ON l.id = r."loteId"
    JOIN "ale_bet"."UbicacionStock" u ON u.id = r."ubicacionId"
    LEFT JOIN "ale_bet"."ItemPedido" i ON i.id = r."itemPedidoId"
    LEFT JOIN "ale_bet"."Pedido" pe ON pe.id = r."pedidoId"
    WHERE l."productoId" = $1
    ORDER BY r."createdAt", r.id
  `, [cetriId]) : { rows: [] }
  const movements = cetriId ? await client.query(`
    SELECT m.id, m.cantidad, m.tipo, m.referencia, m."createdAt", l.numero AS "loteNumero",
           pe.id AS "pedidoId", pe.numero AS "pedidoNumero", pe.origen, pe.estado AS "pedidoEstado"
    FROM "ale_bet"."MovimientoStock" m
    LEFT JOIN "ale_bet"."Lote" l ON l.id = m."loteId"
    LEFT JOIN "ale_bet"."Pedido" pe ON pe.id = m."pedidoId"
    WHERE m."productoId" = $1
    ORDER BY m."createdAt", m.id
  `, [cetriId]) : { rows: [] }
  const automationOrders = cetriId ? await client.query(`
    SELECT pe.id AS "pedidoId", pe.numero, pe."createdAt", pe.origen, pe.estado,
           i.id AS "itemPedidoId", i.cantidad, d.id AS "draftId", d."originalText"
    FROM "ale_bet"."Pedido" pe
    JOIN "ale_bet"."ItemPedido" i ON i."pedidoId" = pe.id
    LEFT JOIN "ale_bet"."OrderInterpretationDraft" d ON d."pedidoId" = pe.id
    WHERE i."productoId" = $1 AND pe.origen = 'AUTOMATION'
    ORDER BY pe."createdAt", i.id
  `, [cetriId]) : { rows: [] }
  console.log(JSON.stringify({ catalog: catalog.rows, aliases: aliases.rows, cetri: { product: cetri.rows, lots: lots.rows, reservations: reservations.rows, movements: movements.rows, automationOrders: automationOrders.rows } }, null, 2))
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(() => client.end())
