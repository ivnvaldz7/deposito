"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pdfkit_1 = __importDefault(require("pdfkit"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const router = (0, express_1.Router)();
// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildDateFilter(desde, hasta) {
    const f = {};
    if (desde)
        f.gte = new Date(desde + 'T00:00:00.000Z');
    if (hasta)
        f.lte = new Date(hasta + 'T23:59:59.999Z');
    return f.gte ?? f.lte ? f : undefined;
}
function parseQueryParams(req) {
    const desde = typeof req.query['desde'] === 'string' ? req.query['desde'] : undefined;
    const hasta = typeof req.query['hasta'] === 'string' ? req.query['hasta'] : undefined;
    const categoria = typeof req.query['categoria'] === 'string' ? req.query['categoria'] : undefined;
    return { desde, hasta, categoria };
}
// ─── GET /api/metricas ────────────────────────────────────────────────────────
router.get('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado', 'observador'), async (req, res) => {
    const { desde, hasta, categoria } = parseQueryParams(req);
    const dateFilter = buildDateFilter(desde, hasta);
    const where = {};
    if (dateFilter)
        where.createdAt = dateFilter;
    if (categoria)
        where.categoria = categoria;
    try {
        const movimientos = await prisma_1.prisma.movimiento.findMany({
            where,
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: 'asc' },
        });
        let totalIngresos = 0;
        let totalEgresos = 0;
        const categoriaMap = {};
        const ingresadosMap = {};
        const solicitadosMap = {};
        for (const m of movimientos) {
            if (m.tipo === 'ingreso_acta') {
                totalIngresos += m.cantidad;
                categoriaMap[m.categoria] = (categoriaMap[m.categoria] ?? 0) + m.cantidad;
                ingresadosMap[m.productoNombre] = (ingresadosMap[m.productoNombre] ?? 0) + m.cantidad;
            }
            else if (m.tipo === 'egreso_orden') {
                totalEgresos += m.cantidad;
                solicitadosMap[m.productoNombre] = (solicitadosMap[m.productoNombre] ?? 0) + m.cantidad;
            }
            else if (m.tipo === 'ajuste_manual') {
                // ajustes manuales suman o restan según signo, pero se registran siempre positivos
                // Se tratan como egresos en el balance
                totalEgresos += m.cantidad;
            }
        }
        const ingresosPorCategoria = Object.entries(categoriaMap)
            .map(([cat, total]) => ({ categoria: cat, total }))
            .sort((a, b) => b.total - a.total);
        const topProductosIngresados = Object.entries(ingresadosMap)
            .map(([productoNombre, total]) => ({ productoNombre, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
        const topProductosSolicitados = Object.entries(solicitadosMap)
            .map(([productoNombre, total]) => ({ productoNombre, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
        res.json({
            totalIngresos,
            totalEgresos,
            balance: totalIngresos - totalEgresos,
            movimientosPeriodo: movimientos.length,
            ingresosPorCategoria,
            topProductosIngresados,
            topProductosSolicitados,
        });
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── GET /api/metricas/exportar-pdf ───────────────────────────────────────────
router.get('/exportar-pdf', auth_1.authenticate, (0, require_role_1.requireRole)('encargado', 'observador'), async (req, res) => {
    const { desde, hasta, categoria } = parseQueryParams(req);
    const dateFilter = buildDateFilter(desde, hasta);
    const where = {};
    if (dateFilter)
        where.createdAt = dateFilter;
    if (categoria)
        where.categoria = categoria;
    try {
        const movimientos = await prisma_1.prisma.movimiento.findMany({
            where,
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
        });
        let totalIngresos = 0;
        let totalEgresos = 0;
        for (const m of movimientos) {
            if (m.tipo === 'ingreso_acta')
                totalIngresos += m.cantidad;
            else
                totalEgresos += m.cantidad;
        }
        const doc = new pdfkit_1.default({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="metricas-${desde ?? 'inicio'}-${hasta ?? 'hoy'}.pdf"`);
        doc.pipe(res);
        // ── Title ─────────────────────────────────────────────────────────────────
        doc.fontSize(18).font('Helvetica-Bold').text('Reporte de Métricas', { align: 'center' });
        doc.moveDown(0.4);
        const rangoLabel = desde && hasta
            ? `${desde} → ${hasta}`
            : desde
                ? `Desde ${desde}`
                : hasta
                    ? `Hasta ${hasta}`
                    : 'Todo el período';
        doc.fontSize(11).font('Helvetica').text(`Período: ${rangoLabel}`, { align: 'center' });
        if (categoria) {
            doc.text(`Categoría: ${categoria}`, { align: 'center' });
        }
        doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, { align: 'center' });
        doc.moveDown(1);
        // ── Summary ───────────────────────────────────────────────────────────────
        doc.fontSize(13).font('Helvetica-Bold').text('Resumen');
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica');
        doc.text(`Total ingresos:   ${totalIngresos.toLocaleString()} uds`);
        doc.text(`Total egresos:    ${totalEgresos.toLocaleString()} uds`);
        doc.text(`Balance:          ${(totalIngresos - totalEgresos).toLocaleString()} uds`);
        doc.text(`Movimientos:      ${movimientos.length}`);
        doc.moveDown(1);
        // ── Table header ──────────────────────────────────────────────────────────
        doc.fontSize(13).font('Helvetica-Bold').text('Movimientos');
        doc.moveDown(0.4);
        const colX = { fecha: 40, tipo: 130, producto: 220, cantidad: 390, usuario: 450 };
        const rowH = 18;
        // Header row
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Fecha', colX.fecha, doc.y, { continued: true, width: 85 });
        doc.text('Tipo', colX.tipo, doc.y, { continued: true, width: 85 });
        doc.text('Producto', colX.producto, doc.y, { continued: true, width: 165 });
        doc.text('Cant.', colX.cantidad, doc.y, { continued: true, width: 55 });
        doc.text('Usuario', colX.usuario, doc.y, { width: 100 });
        const headerY = doc.y;
        doc.moveTo(40, headerY).lineTo(555, headerY).lineWidth(0.5).stroke();
        doc.moveDown(0.3);
        // Data rows
        doc.fontSize(8).font('Helvetica');
        const TIPO_LABELS = {
            ingreso_acta: 'Ingreso acta',
            egreso_orden: 'Egreso orden',
            ajuste_manual: 'Ajuste manual',
        };
        for (const m of movimientos) {
            if (doc.y > 760) {
                doc.addPage();
                doc.y = 40;
            }
            const y = doc.y;
            const fecha = new Date(m.createdAt).toLocaleDateString('es-AR');
            const tipo = TIPO_LABELS[m.tipo] ?? m.tipo;
            doc.text(fecha, colX.fecha, y, { continued: true, width: 85 });
            doc.text(tipo, colX.tipo, y, { continued: true, width: 85 });
            doc.text(m.productoNombre, colX.producto, y, { continued: true, width: 165 });
            doc.text(String(m.cantidad), colX.cantidad, y, { continued: true, width: 55 });
            doc.text(m.user.name, colX.usuario, y, { width: 100 });
            doc.moveDown(rowH / doc.currentLineHeight() - 1);
        }
        if (movimientos.length === 0) {
            doc.text('Sin movimientos en este período.');
        }
        doc.end();
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
exports.default = router;
//# sourceMappingURL=metricas.js.map