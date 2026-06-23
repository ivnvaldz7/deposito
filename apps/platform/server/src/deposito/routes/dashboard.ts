import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'

const router = Router()

// GET /api/dashboard/stats — resumen general
router.get('/stats', authenticate, async (_req: Request, res: Response): Promise<void> => {
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
      stockBajo,
      stockBajoEstuches,
      stockBajoEtiquetas,
      stockBajoFrascos,
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
        where: { cantidad: { lt: 10, gt: 0 } },
        orderBy: [{ cantidad: 'asc' }, { nombre: 'asc' }],
        select: { id: true, nombre: true, lote: true, cantidad: true },
      }),
      prisma.inventarioEstuche.findMany({
        where: { cantidad: { lt: 100 } },
        orderBy: [{ cantidad: 'asc' }, { mercado: 'asc' }, { articulo: 'asc' }],
        select: { id: true, articulo: true, mercado: true, cantidad: true },
      }),
      prisma.inventarioEtiqueta.findMany({
        where: { cantidad: { lt: 100 } },
        orderBy: [{ cantidad: 'asc' }, { mercado: 'asc' }, { articulo: 'asc' }],
        select: { id: true, articulo: true, mercado: true, cantidad: true },
      }),
      prisma.inventarioFrasco.findMany({
        where: { cantidadCajas: { lt: 5 } },
        orderBy: [{ cantidadCajas: 'asc' }, { articulo: 'asc' }],
        select: {
          id: true,
          articulo: true,
          cantidadCajas: true,
          unidadesPorCaja: true,
          total: true,
        },
      }),
      prisma.inventarioDroga.findMany({
        where: {
          vencimiento: { lte: porVencerLimit },
          cantidad: { gt: 0 },
        },
        orderBy: { vencimiento: 'asc' },
        select: { id: true, nombre: true, lote: true, vencimiento: true, cantidad: true },
      }),
    ])

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
