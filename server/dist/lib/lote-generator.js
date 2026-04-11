"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarLote = generarLote;
const prisma_1 = require("./prisma");
const PREFIJOS = {
    estuche: 'EST',
    etiqueta: 'ETQ',
    frasco: 'FRA',
};
/**
 * Genera el siguiente lote secuencial para una categoría que no sea droga.
 * Formato: "EST-0001", "ETQ-0002", "FRA-0003", etc.
 *
 * Nota: no usa una transacción de DB para reservar el número, por lo que en
 * alta concurrencia podría haber colisiones (aceptable para MVP).
 */
async function generarLote(categoria) {
    const prefijo = PREFIJOS[categoria];
    const ultimoItem = await prisma_1.prisma.actaItem.findFirst({
        where: {
            categoria,
            lote: { startsWith: `${prefijo}-` },
        },
        orderBy: { createdAt: 'desc' },
        select: { lote: true },
    });
    let siguienteNum = 1;
    if (ultimoItem?.lote) {
        const numStr = ultimoItem.lote.slice(prefijo.length + 1); // "EST-0007" → "0007"
        const num = parseInt(numStr, 10);
        if (!isNaN(num))
            siguienteNum = num + 1;
    }
    return `${prefijo}-${String(siguienteNum).padStart(4, '0')}`;
}
//# sourceMappingURL=lote-generator.js.map