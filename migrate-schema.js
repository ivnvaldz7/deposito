const fs = require('fs');
const path = require('path');

const dbSchemaPath = path.join(__dirname, 'packages/db/prisma/schema.prisma');
const depositoSchemaPath = path.join(__dirname, 'apps/deposito/server/prisma/schema.prisma');

let dbSchema = fs.readFileSync(dbSchemaPath, 'utf8');
let depSchema = fs.readFileSync(depositoSchemaPath, 'utf8');

// Update schemas array
dbSchema = dbSchema.replace('schemas  = ["platform", "ale_bet"]', 'schemas  = ["platform", "ale_bet", "deposito"]');

// Strip generator and datasource
depSchema = depSchema.replace(/generator client \{[\s\S]*?\}/, '');
depSchema = depSchema.replace(/datasource db \{[\s\S]*?\}/, '');

// Rename models to avoid conflicts
// We use regex with word boundaries to ensure we only replace the exact model/enum names
depSchema = depSchema.replace(/\bProducto\b/g, 'DepositoProducto');
depSchema = depSchema.replace(/\bTipoMovimiento\b/g, 'DepositoTipoMovimiento');

// Add @@schema("deposito") to all models and enums
// A model looks like: model Name { ... }
// An enum looks like: enum Name { ... }
depSchema = depSchema.replace(/(model\s+\w+\s*\{)([\s\S]*?)(\})/g, (match, p1, p2, p3) => {
    return p1 + p2 + '\n  @@schema("deposito")\n' + p3;
});

depSchema = depSchema.replace(/(enum\s+\w+\s*\{)([\s\S]*?)(\})/g, (match, p1, p2, p3) => {
    return p1 + p2 + '\n  @@schema("deposito")\n' + p3;
});

// Append the modified deposito schema to the main db schema
fs.writeFileSync(dbSchemaPath, dbSchema + '\n// ─── Deposito schema ────────────────────────────────────────────────────────\n' + depSchema);

console.log("Schema migrated successfully.");
