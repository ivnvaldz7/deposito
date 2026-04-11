"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_PRODUCT_ALIASES = void 0;
exports.normalizeProductName = normalizeProductName;
exports.resolveCanonicalProductName = resolveCanonicalProductName;
exports.buildProductoLookupKey = buildProductoLookupKey;
function normalizeProductName(value) {
    return value.trim().toUpperCase().replace(/\s+/g, ' ');
}
exports.LEGACY_PRODUCT_ALIASES = {
    [normalizeProductName('AMANTINA PREMIUM 500 ML NR')]: normalizeProductName('AMANTINA PREMIUM 500 ML'),
};
function resolveCanonicalProductName(value) {
    const normalized = normalizeProductName(value);
    return exports.LEGACY_PRODUCT_ALIASES[normalized] ?? normalized;
}
function buildProductoLookupKey(categoria, nombre) {
    return `${categoria}::${resolveCanonicalProductName(nombre)}`;
}
//# sourceMappingURL=producto-catalogo.js.map