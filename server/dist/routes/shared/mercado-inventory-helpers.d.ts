import { Mercado } from '@prisma/client';
import type { Router, Response } from 'express';
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
export type CrearMercadoInventoryData = z.infer<typeof crearMercadoInventorySchema>;
export type EditarMercadoInventoryData = z.infer<typeof editarMercadoInventorySchema>;
export type MercadoInventoryOrderBy = ReturnType<typeof getMercadoInventoryOrderBy>;
interface MercadoInventoryRecord {
    id: string;
    articulo: string;
    mercado: Mercado;
    cantidad: number;
}
interface MercadoInventoryOperations<TRecord extends MercadoInventoryRecord, TWhereInput> {
    buildWhere: (mercado?: Mercado) => TWhereInput;
    findMany: (args: {
        where: TWhereInput;
        orderBy: MercadoInventoryOrderBy;
    }) => Promise<TRecord[]>;
    findByComposite: (articulo: string, mercado: Mercado) => Promise<TRecord | null>;
    findById: (id: string) => Promise<TRecord | null>;
    findConflict: (articulo: string, mercado: Mercado, id: string) => Promise<TRecord | null>;
    create: (data: CrearMercadoInventoryData) => Promise<TRecord>;
    update: (id: string, data: Partial<CrearMercadoInventoryData>) => Promise<TRecord>;
    delete: (id: string) => Promise<void>;
}
interface MercadoInventoryRouteMessages {
    conflict: string;
    notFound: string;
}
interface RegisterMercadoInventoryRoutesOptions<TRecord extends MercadoInventoryRecord, TWhereInput> {
    router: Router;
    operations: MercadoInventoryOperations<TRecord, TWhereInput>;
    messages: MercadoInventoryRouteMessages;
}
export declare function parseCrearMercadoInventoryBody(body: unknown): z.SafeParseReturnType<{
    cantidad: number;
    articulo: string;
    mercado: import(".prisma/client").$Enums.Mercado;
}, {
    cantidad: number;
    articulo: string;
    mercado: import(".prisma/client").$Enums.Mercado;
}>;
export declare function parseEditarMercadoInventoryBody(body: unknown): z.SafeParseReturnType<{
    cantidad?: number | undefined;
    articulo?: string | undefined;
    mercado?: import(".prisma/client").$Enums.Mercado | undefined;
}, {
    cantidad?: number | undefined;
    articulo?: string | undefined;
    mercado?: import(".prisma/client").$Enums.Mercado | undefined;
}>;
export declare function sendInvalidMercadoInventoryBody(res: Response, error: z.ZodError): void;
export declare function hasMercadoInventoryConflict<TRecord extends MercadoInventoryRecord>(findByComposite: MercadoInventoryOperations<TRecord, unknown>['findByComposite'], articulo: string, mercado: Mercado): Promise<boolean>;
export declare function resolveMercadoInventoryUpdate<TRecord extends MercadoInventoryRecord>(operations: Pick<MercadoInventoryOperations<TRecord, unknown>, 'findById' | 'findConflict'>, id: string, data: EditarMercadoInventoryData): Promise<{
    existing: null;
    hasConflict: boolean;
} | {
    existing: TRecord;
    hasConflict: boolean;
}>;
export declare function buildMercadoInventoryUpdateData(data: EditarMercadoInventoryData): Partial<CrearMercadoInventoryData>;
export declare function registerMercadoInventoryRoutes<TRecord extends MercadoInventoryRecord, TWhereInput>({ router, operations, messages, }: RegisterMercadoInventoryRoutesOptions<TRecord, TWhereInput>): void;
export {};
//# sourceMappingURL=mercado-inventory-helpers.d.ts.map