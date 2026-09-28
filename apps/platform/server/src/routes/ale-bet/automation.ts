import { Router } from 'express'
import { getAppAccess, type JwtPayload } from '@platform/core'
import { platformDb as prisma } from '@platform/db'
import { z } from 'zod'
import { requirePermission } from '../../middlewares/require-permission'
import { acquireIdempotencyRecord, calculateFingerprint, completeIdempotencyRecord, getSingleIdempotencyKey, toPersistableResponseBody } from '../../utils/idempotency'
import { applyDraftEdit, AutomationConflictError, AutomationNotFoundError, confirmDraftInTransaction, getDraft, interpretAndPersistDraft } from './automation/automation-service'
import { StockConflictError } from './reservas-service'
import { syncStockProjectionAfterCommit, syncStockProjectionNow } from './stock-projection/direct-sync'

const createSchema = z.object({ originalText: z.string().trim().min(1).max(20_000) })
const editSchema = z.object({
  expectedVersion: z.number().int().positive(),
  clienteId: z.string().min(1).optional(),
  rememberClientAlias: z.boolean().optional(),
  line: z.object({
    lineId: z.string().min(1),
    action: z.enum(['DISCARD', 'RESTORE']).optional(),
    productId: z.string().min(1).optional(),
    cajas: z.number().int().nonnegative().optional(),
    unidades: z.number().int().nonnegative().optional(),
    mode: z.enum(['BOXES', 'UNITS', 'MIXED']).optional(),
    rememberAlias: z.boolean().optional(),
  }).optional(),
}).superRefine((value, context) => {
  const edits = Number(Boolean(value.clienteId)) + Number(Boolean(value.line))
  if (edits !== 1) context.addIssue({ code: z.ZodIssueCode.custom, message: 'La edición debe cambiar exactamente un cliente o una línea' })
})
const confirmSchema = z.object({ expectedVersion: z.number().int().positive() })

function isAutomationOperator(user: JwtPayload): boolean { return getAppAccess(user, 'ale-bet')?.rol === 'admin' }
function requireOperator(req: { user?: JwtPayload }, res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (req.user && isAutomationOperator(req.user)) return true
  res.status(403).json({ error: 'AUTOMATION-01 requiere un operador Admin de Ale-Bet' })
  return false
}
function errorResponse(error: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }): void {
  if (error instanceof AutomationNotFoundError) { res.status(404).json({ error: error.message }); return }
  if (error instanceof AutomationConflictError || error instanceof StockConflictError) { res.status(409).json({ error: error.message }); return }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status
    res.status(status).json({ error: (error as { message?: string }).message ?? 'Error de idempotencia' }); return
  }
  throw error
}

export type AutomationRouteDependencies = {
  syncStockProjectionNow?: () => Promise<unknown>
  logger?: Pick<Console, 'error'>
}

export function createAutomationRoutes(dependencies: AutomationRouteDependencies = {}): Router {
  const router = Router()
  const syncProjection = dependencies.syncStockProjectionNow ?? syncStockProjectionNow
  const logger = dependencies.logger ?? console

router.get('/aliases', requirePermission('ale-bet', 'pedidos.read'), async (req, res) => {
  if (!requireOperator(req, res)) return
  const [productAliases, clientAliases] = await Promise.all([
    prisma.productAlias.findMany({ orderBy: { aliasNormalized: 'asc' }, include: { producto: { select: { id: true, nombre: true } } } }),
    prisma.clientAlias.findMany({ orderBy: { aliasNormalized: 'asc' }, include: { cliente: { select: { id: true, nombre: true } } } }),
  ])
  res.json({ productAliases, clientAliases })
})

router.delete('/product-aliases/:id', requirePermission('ale-bet', 'pedidos.approve'), async (req, res) => {
  if (!requireOperator(req, res)) return
  const alias = await prisma.productAlias.findUnique({ where: { id: String(req.params.id) } })
  if (!alias) { res.status(404).json({ error: 'Equivalencia de producto no encontrada' }); return }
  await prisma.productAlias.delete({ where: { id: alias.id } })
  res.status(204).end()
})

router.delete('/client-aliases/:id', requirePermission('ale-bet', 'pedidos.approve'), async (req, res) => {
  if (!requireOperator(req, res)) return
  const alias = await prisma.clientAlias.findUnique({ where: { id: String(req.params.id) } })
  if (!alias) { res.status(404).json({ error: 'Equivalencia de cliente no encontrada' }); return }
  await prisma.clientAlias.delete({ where: { id: alias.id } })
  res.status(204).end()
})

router.post('/drafts', requirePermission('ale-bet', 'pedidos.approve'), async (req, res) => {
  if (!requireOperator(req, res)) return
  const input = createSchema.safeParse(req.body)
  if (!input.success) { res.status(400).json({ error: 'originalText es requerido' }); return }
  const draft = await interpretAndPersistDraft(input.data.originalText, (req.user as JwtPayload).sub)
  res.status(201).json(draft)
})

router.get('/drafts/:id', requirePermission('ale-bet', 'pedidos.read'), async (req, res) => {
  if (!requireOperator(req, res)) return
  try { res.json(await getDraft(String(req.params.id))) } catch (error) { errorResponse(error, res) }
})

router.put('/drafts/:id', requirePermission('ale-bet', 'pedidos.approve'), async (req, res) => {
  if (!requireOperator(req, res)) return
  const input = editSchema.safeParse(req.body)
  if (!input.success) { res.status(400).json({ error: 'Edición inválida', details: input.error.flatten() }); return }
  try { res.json(await applyDraftEdit(String(req.params.id), input.data.expectedVersion, input.data)) } catch (error) { errorResponse(error, res) }
})

router.post('/drafts/:id/confirm', requirePermission('ale-bet', 'pedidos.approve'), async (req, res) => {
  if (!requireOperator(req, res)) return
  const input = confirmSchema.safeParse(req.body)
  if (!input.success) { res.status(400).json({ error: 'expectedVersion es requerido' }); return }
  let key: string | undefined
  try { key = getSingleIdempotencyKey(req.rawHeaders) } catch (error) { errorResponse(error, res); return }
  if (!key) { res.status(400).json({ error: 'Idempotency-Key es requerido' }); return }
  const user = req.user as JwtPayload
  const draftId = String(req.params.id)
  try {
    const result = await prisma.$transaction(async (tx) => {
      const scope = 'ale-bet.automation.draft.confirm'
      // Serialize the domain transition before consulting/replaying the
      // idempotency record. A different key therefore cannot bypass the
      // CONFIRMED state after another operator has won the draft lock.
      await tx.$queryRaw`SELECT id FROM "ale_bet"."OrderInterpretationDraft" WHERE id = ${draftId} FOR UPDATE`
      const acquired = await acquireIdempotencyRecord(tx, user.sub, scope, key, calculateFingerprint(req.method, scope, draftId, input.data))
      if (acquired.type === 'REPLAY') return { body: acquired.body, replayed: true }
      const body = await confirmDraftInTransaction(tx, { draftId, expectedVersion: input.data.expectedVersion, actorId: user.sub })
      await completeIdempotencyRecord(tx, acquired.id, 200, toPersistableResponseBody(body))
      return { body, replayed: false }
    })
    await syncStockProjectionAfterCommit({ syncStockProjectionNow: syncProjection, logger })
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true')
    res.json(result.body)
  } catch (error) { errorResponse(error, res) }
})

  return router
}

export default createAutomationRoutes()
