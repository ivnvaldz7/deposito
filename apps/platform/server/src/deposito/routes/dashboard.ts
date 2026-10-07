import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../../middlewares/require-permission'
import { isStockBajo } from '../lib/stock-status'

const router = Router()

// GET /api/dashboard/stats — resumen general
router.get('/stats', authenticate, requirePermission('deposito', 'dashboard.read'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const porVencerLimit = new Date()
    porVencerLimit.setDate(porVencerLimit.getDate() + 30)
    porVencerLimit.setUTCHours(23, 59, 59, 999)

    const [
      totalDrogas,
      drogasEnStock,
      drogasSinStock,
      totalEstuches,
      estuchesSinStock,
      totalEtiquetas,
      etiquetasSinStock,
      totalFrascos,
      frascosSinStock,
      movimientosHoy,
      ultimosMovimientos,
      stockBajoCandidates,
      stockBajoEstuchesCandidates,
      stockBajoEtiquetasCandidates,
      stockBajoFrascosCandidates,
      porVencer,
    ] = await Promise.all([
      prisma.inventarioDroga.count(),
      prisma.inventarioDroga.count({ where: { cantidad: { gt: 0 } } }),
      prisma.inventarioDroga.count({ where: { cantidad: 0 } }),
      prisma.inventarioEstuche.count(),
      prisma.inventarioEstuche.count({ where: { cantidad: 0 } }),
      prisma.inventarioEtiqueta.count(),
      prisma.inventarioEtiqueta.count({ where: { cantidad: 0 } }),
      prisma.inventarioFrasco.count(),
      prisma.inventarioFrasco.count({ where: { cantidadCajas: 0 } }),
      prisma.movimiento.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.movimiento.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      }),
      prisma.inventarioDroga.findMany({
        where: {},
        orderBy: [{ cantidad: 'asc' }, { nombre: 'asc' }],
        select: { id: true, nombre: true, lote: true, cantidad: true, producto: { select: { stockMinimo: true } } },
      }),
      prisma.inventarioEstuche.findMany({
        where: {},
        orderBy: [{ cantidad: 'asc' }, { mercado: 'asc' }, { articulo: 'asc' }],
        select: { id: true, articulo: true, mercado: true, cantidad: true, producto: { select: { stockMinimo: true } } },
      }),
      prisma.inventarioEtiqueta.findMany({
        where: {},
        orderBy: [{ cantidad: 'asc' }, { mercado: 'asc' }, { articulo: 'asc' }],
        select: { id: true, articulo: true, mercado: true, cantidad: true, producto: { select: { stockMinimo: true } } },
      }),
      prisma.inventarioFrasco.findMany({
        where: {},
        orderBy: [{ cantidadCajas: 'asc' }, { articulo: 'asc' }],
        select: {
          id: true,
          articulo: true,
          cantidadCajas: true,
          unidadesPorCaja: true,
          total: true,
          producto: { select: { stockMinimo: true } },
        },
      }),
      prisma.inventarioDroga.findMany({
        where: {
          vencimiento: { gte: todayStart, lte: porVencerLimit },
          cantidad: { gt: 0 },
        },
        orderBy: { vencimiento: 'asc' },
        select: { id: true, nombre: true, lote: true, vencimiento: true, cantidad: true },
      }),
    ])

    const stockBajo = stockBajoCandidates.filter((item) => isStockBajo(item.cantidad, item.producto?.stockMinimo))
    const stockBajoEstuches = stockBajoEstuchesCandidates.filter((item) => isStockBajo(item.cantidad, item.producto?.stockMinimo))
    const stockBajoEtiquetas = stockBajoEtiquetasCandidates.filter((item) => isStockBajo(item.cantidad, item.producto?.stockMinimo))
    const stockBajoFrascos = stockBajoFrascosCandidates.filter((item) => isStockBajo(item.cantidadCajas, item.producto?.stockMinimo))

    res.json({
      totalDrogas,
      drogasEnStock,
      drogasSinStock,
      totalEstuches,
      estuchesSinStock,
      totalEtiquetas,
      etiquetasSinStock,
      totalFrascos,
      frascosSinStock,
      movimientosHoy,
      ultimosMovimientos,
      stockBajo,
      stockBajoEstuches,
      stockBajoEtiquetas,
      stockBajoFrascos,
      porVencer,
    })
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' })
  }
})

export default router
