import { Categoria } from '@prisma/client';
type CategoriaConLoteAuto = Exclude<Categoria, 'droga'>;
/**
 * Genera el siguiente lote secuencial para una categoría que no sea droga.
 * Formato: "EST-0001", "ETQ-0002", "FRA-0003", etc.
 *
 * Nota: no usa una transacción de DB para reservar el número, por lo que en
 * alta concurrencia podría haber colisiones (aceptable para MVP).
 */
export declare function generarLote(categoria: CategoriaConLoteAuto): Promise<string>;
export {};
//# sourceMappingURL=lote-generator.d.ts.map