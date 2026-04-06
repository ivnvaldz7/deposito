import { Mercado } from '@prisma/client';
import { z } from 'zod';
export declare const MERCADOS_VALIDOS: [Mercado, ...Mercado[]];
export declare const crearMercadoInventorySchema: z.ZodObject<{
    articulo: z.ZodString;
    mercado: z.ZodEnum<[import(".prisma/client").$Enums.Mercado, ...import(".prisma/client").$Enums.Mercado[]]>;
    cantidad: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    cantidad: number;
    articulo: string;
    mercado: import(".prisma/client").$Enums.Mercado;
}, {
    cantidad: number;
    articulo: string;
    mercado: import(".prisma/client").$Enums.Mercado;
}>;
export declare const editarMercadoInventorySchema: z.ZodEffects<z.ZodObject<{
    articulo: z.ZodOptional<z.ZodString>;
    mercado: z.ZodOptional<z.ZodEnum<[import(".prisma/client").$Enums.Mercado, ...import(".prisma/client").$Enums.Mercado[]]>>;
    cantidad: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    cantidad?: number | undefined;
    articulo?: string | undefined;
    mercado?: import(".prisma/client").$Enums.Mercado | undefined;
}, {
    cantidad?: number | undefined;
    articulo?: string | undefined;
    mercado?: import(".prisma/client").$Enums.Mercado | undefined;
}>, {
    cantidad?: number | undefined;
    articulo?: string | undefined;
    mercado?: import(".prisma/client").$Enums.Mercado | undefined;
}, {
    cantidad?: number | undefined;
    articulo?: string | undefined;
    mercado?: import(".prisma/client").$Enums.Mercado | undefined;
}>;
export declare function resolveMercadoQuery(mercado: unknown): Mercado | undefined;
export declare function getMercadoInventoryOrderBy(): ({
    mercado: "asc";
    articulo?: undefined;
} | {
    articulo: "asc";
    mercado?: undefined;
})[];
//# sourceMappingURL=mercado-inventory-helpers.d.ts.map