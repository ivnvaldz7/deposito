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
    const categoria = typeof req.query['categoria'] === 'string' ? req.query['categoria'].trim() : undefined;
    const producto = typeof req.query['producto'] === 'string' ? req.query['producto'].trim() : undefined;
    return {
        desde,
        hasta,
        categoria: categoria || undefined,
        producto: producto || undefined,
    };
}
function buildMovimientoWhere(filters) {
    const where = {};
    const dateFilter = buildDateFilter(filters.desde, filters.hasta);
    if (dateFilter)
        where.createdAt = dateFilter;
    if (filters.categoria)
        where.categoria = filters.categoria;
    if (filters.producto) {
        where.productoNombre = { equals: filters.producto, mode: 'insensitive' };
    }
    return where;
}
async function loadMovimientos(where) {
    return prisma_1.prisma.movimiento.findMany({
        where,
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
    });
}
function buildResumen(movimientos) {
    let totalIngresos = 0;
    let totalEgresos = 0;
    const categoriaMap = {};
    const ingresadosMap = {};
    const solicitadosMap = {};
    for (const movimiento of movimientos) {
        if (movimiento.tipo === 'ingreso_acta') {
            totalIngresos += movimiento.cantidad;
            categoriaMap[movimiento.categoria] = (categoriaMap[movimiento.categoria] ?? 0) + movimiento.cantidad;
            ingresadosMap[movimiento.productoNombre] = (ingresadosMap[movimiento.productoNombre] ?? 0) + movimiento.cantidad;
            continue;
        }
        const cantidad = Math.abs(movimiento.cantidad);
        totalEgresos += cantidad;
        if (movimiento.tipo === 'egreso_orden') {
            solicitadosMap[movimiento.productoNombre] = (solicitadosMap[movimiento.productoNombre] ?? 0) + cantidad;
        }
    }
    return {
        totalIngresos,
        totalEgresos,
        balance: totalIngresos - totalEgresos,
        movimientosPeriodo: movimientos.length,
        ingresosPorCategoria: Object.entries(categoriaMap)
            .map(([categoria, total]) => ({ categoria, total }))
            .sort((a, b) => b.total - a.total),
        topProductosIngresados: Object.entries(ingresadosMap)
            .map(([productoNombre, total]) => ({ productoNombre, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10),
        topProductosSolicitados: Object.entries(solicitadosMap)
            .map(([productoNombre, total]) => ({ productoNombre, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10),
    };
}
function formatDateLabel(iso) {
    if (!iso)
        return 'Todo el período';
    return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}
function formatDateTime(iso) {
    return new Date(iso).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
function drawPdfHeader(doc, filters) {
    doc.roundedRect(40, 34, 515, 84, 6).fill('#00AE42');
    doc.fillColor('#003918').font('Helvetica-Bold').fontSize(11).text('Depósito', 58, 50);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('Reporte de Movimientos', 58, 66);
    doc.fillColor('#dcf6e5').font('Helvetica').fontSize(10).text('Resumen profesional del período y filtros aplicados', 58, 92);
    doc.fillColor('#bccbb8').font('Helvetica').fontSize(10);
    doc.text(`Rango: ${filters.desde ? formatDateLabel(filters.desde) : 'Inicio'} → ${filters.hasta ? formatDateLabel(filters.hasta) : 'Hoy'}`, 40, 132);
    doc.text(`Categoría: ${filters.categoria ?? 'Todas'}`, 40, 148);
    doc.text(`Producto: ${filters.producto ?? 'Todos'}`, 282, 148);
}
function drawTableHeader(doc, y) {
    const columns = [
        { label: 'Fecha', x: 40, width: 92, align: 'left' },
        { label: 'Tipo', x: 132, width: 92, align: 'left' },
        { label: 'Categoría', x: 224, width: 82, align: 'left' },
        { label: 'Producto', x: 306, width: 128, align: 'left' },
        { label: 'Cantidad', x: 434, width: 54, align: 'right' },
        { label: 'Usuario', x: 488, width: 67, align: 'left' },
    ];
    doc.rect(40, y, 515, 24).fill('#00AE42');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    for (const column of columns) {
        doc.text(column.label, column.x + 6, y + 8, {
            width: column.width - 12,
            align: column.align,
        });
    }
}
function drawPdfFooter(doc) {
    const footerY = 790;
    doc.moveTo(40, footerY).lineTo(555, footerY).lineWidth(0.6).strokeColor('#3d4a3c').stroke();
    doc.fillColor('#bccbb8').font('Helvetica').fontSize(9).text(`Generado por Depósito · ${new Date().toLocaleString('es-AR')}`, 40, footerY + 8, { align: 'center', width: 515 });
}
router.get('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado', 'observador'), async (req, res) => {
    const filters = parseQueryParams(req);
    try {
        const movimientos = await loadMovimientos(buildMovimientoWhere(filters));
        res.json(buildResumen(movimientos));
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
router.get('/exportar-pdf', auth_1.authenticate, (0, require_role_1.requireRole)('encargado', 'observador'), async (req, res) => {
    const filters = parseQueryParams(req);
    try {
        const movimientos = await loadMovimientos(buildMovimientoWhere(filters));
        const resumen = buildResumen(movimientos);
        const doc = new pdfkit_1.default({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="movimientos-${filters.desde ?? 'inicio'}-${filters.hasta ?? 'hoy'}.pdf"`);
        doc.pipe(res);
        drawPdfHeader(doc, filters);
        drawTableHeader(doc, 182);
        const tipoLabels = {
            ingreso_acta: 'Ingreso',
            egreso_orden: 'Egreso',
            ajuste_manual: 'Ajuste',
        };
        let rowY = 206;
        doc.fillColor('#101510').font('Helvetica').fontSize(8.5);
        for (const movimiento of movimientos) {
            if (rowY > 742) {
                drawPdfFooter(doc);
                doc.addPage();
                drawPdfHeader(doc, filters);
                drawTableHeader(doc, 182);
                rowY = 206;
            }
            doc.rect(40, rowY, 515, 26).lineWidth(0.4).strokeColor('#3d4a3c').stroke();
            doc.text(formatDateTime(movimiento.createdAt), 46, rowY + 7, { width: 80 });
            doc.text(tipoLabels[movimiento.tipo] ?? movimiento.tipo, 138, rowY + 7, { width: 80 });
            doc.text(movimiento.categoria, 230, rowY + 7, { width: 70 });
            doc.text(movimiento.productoNombre, 312, rowY + 7, { width: 116 });
            doc.text(String(movimiento.cantidad), 440, rowY + 7, { width: 42, align: 'right' });
            doc.text(movimiento.user.name, 494, rowY + 7, { width: 55 });
            rowY += 26;
        }
        if (movimientos.length === 0) {
            doc.roundedRect(40, rowY + 8, 515, 44, 4).fill('#181d18');
            doc.fillColor('#bccbb8').font('Helvetica').fontSize(10).text('No hay movimientos para los filtros seleccionados.', 40, rowY + 24, { align: 'center', width: 515 });
            rowY += 68;
        }
        rowY += 20;
        if (rowY > 706) {
            drawPdfFooter(doc);
            doc.addPage();
            drawPdfHeader(doc, filters);
            rowY = 184;
        }
        doc.fillColor('#e2ece0').font('Helvetica-Bold').fontSize(12).text('Totales del período', 40, rowY);
        rowY += 20;
        const totals = [
            { label: 'Total ingresos', value: resumen.totalIngresos, color: '#00AE42' },
            { label: 'Total egresos', value: resumen.totalEgresos, color: '#f44336' },
            { label: 'Balance', value: resumen.balance, color: resumen.balance >= 0 ? '#2196f3' : '#f44336' },
        ];
        let boxX = 40;
        for (const total of totals) {
            doc.roundedRect(boxX, rowY, 160, 56, 4).fill('#181d18');
            doc.fillColor('#bccbb8').font('Helvetica').fontSize(9).text(total.label, boxX + 12, rowY + 12);
            doc.fillColor(total.color).font('Helvetica-Bold').fontSize(16).text(total.value.toLocaleString(), boxX + 12, rowY + 30);
            boxX += 176;
        }
        drawPdfFooter(doc);
        doc.end();
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
exports.default = router;
//# sourceMappingURL=metricas.js.map