import { Request, Response, Router } from 'express'
import { Mercado } from '@platform/db'
import { z } from 'zod'
import { requirePermission } from '../../middlewares/require-permission'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { PartidaError, PartidaProduccionService } from '../services/partida-produccion-service'

const router = Router()
const service = new PartidaProduccionService(prisma)
router.use(authenticate)
const itemSchema = z.object({ productoId: z.string().uuid(), cantidadSolicitada: z.number().positive(), mercado: z.nativeEnum(Mercado).optional() })
const createSchema = z.object({ notas: z.string().trim().max(2000).optional(), items: z.array(itemSchema).min(1) })
const ajustarSchema = z.object({ items: z.array(z.object({ id: z.string().uuid(), cantidadFinal: z.number().positive().nullable() })).min(1) })
const rechazarSchema = z.object({ motivoRechazo: z.string().trim().min(1).max(1000) })
function sendError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) { res.status(400).json({ message: 'Datos inválidos', errors: error.flatten() }); return }
  if (error instanceof PartidaError) { res.status(error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400).json({ message: error.message, code: error.code }); return }
  res.status(500).json({ message: 'Error interno del servidor' })
}
function isManager(req: Request) { return req.user?.apps?.deposito?.rol === 'encargado' }
router.get('/', requirePermission('deposito', 'partidas.read'), async (req, res) => { try { res.json(await service.list({ userId: req.depositoUser?.id, role: req.user?.apps?.deposito?.rol })) } catch (error) { sendError(res, error) } })
router.get('/:id', requirePermission('deposito', 'partidas.read'), async (req, res) => { try { const partida = await service.getById(String(req.params.id)); if (!partida) { res.status(404).json({ message: 'Solicitud no encontrada' }); return }; if (!isManager(req) && partida.solicitanteId !== req.depositoUser?.id) { res.status(403).json({ message: 'No tiene permiso para ver esta solicitud' }); return }; res.json(partida) } catch (error) { sendError(res, error) } })
router.post('/', requirePermission('deposito', 'partidas.create'), async (req, res) => { try { res.status(201).json(await service.create({ solicitanteId: req.depositoUser!.id, ...createSchema.parse(req.body) })) } catch (error) { sendError(res, error) } })
router.patch('/:id/items', requirePermission('deposito', 'partidas.manage'), async (req, res) => { if (!isManager(req)) { res.status(403).json({ message: 'Solo el encargado puede ajustar cantidades' }); return }; try { res.json(await service.ajustarCantidades(String(req.params.id), ajustarSchema.parse(req.body).items)) } catch (error) { sendError(res, error) } })
router.post('/:id/confirmar', requirePermission('deposito', 'partidas.confirm'), async (req, res) => { if (!isManager(req)) { res.status(403).json({ message: 'Solo el encargado puede confirmar' }); return }; try { res.json(await service.confirmar(String(req.params.id), req.depositoUser!.id)) } catch (error) { sendError(res, error) } })
router.post('/:id/rechazar', requirePermission('deposito', 'partidas.confirm'), async (req, res) => { if (!isManager(req)) { res.status(403).json({ message: 'Solo el encargado puede rechazar' }); return }; try { res.json(await service.rechazar(String(req.params.id), rechazarSchema.parse(req.body).motivoRechazo)) } catch (error) { sendError(res, error) } })
export default router
