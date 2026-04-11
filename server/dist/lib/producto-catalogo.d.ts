import type { Categoria } from '@prisma/client';
export declare function normalizeProductName(value: string): string;
export declare const LEGACY_PRODUCT_ALIASES: Record<string, string>;
export declare function resolveCanonicalProductName(value: string): string;
export declare function buildProductoLookupKey(categoria: Categoria, nombre: string): string;
//# sourceMappingURL=producto-catalogo.d.ts.map