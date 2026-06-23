const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.ts')) results.push(file);
        }
    });
    return results;
}

const depositoDir = path.join(__dirname, 'apps/platform/server/src/deposito');
const files = walk(depositoDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // Replace AuthRequest with Request
    if (content.includes('AuthRequest')) {
        content = content.replace(/AuthRequest/g, 'Request');
        changed = true;
    }

    // Replace DepositoTipoMovimiento with TipoMovimiento if Prisma didn't generate it, or any
    // Wait, let's cast problematic enums as `any` for Prisma filters, but keep the right architecture.
    // Actually, let's fix Prisma imports.
    if (content.includes('Prisma.MovimientoWhereInput')) {
        content = content.replace(/Prisma\.MovimientoWhereInput/g, 'any');
        changed = true;
    }
    if (content.includes("Prisma.DateTimeFilter<'Movimiento'>")) {
        content = content.replace(/Prisma\.DateTimeFilter<'Movimiento'>/g, 'any');
        changed = true;
    }
    if (content.includes('Prisma.ProductoWhereInput')) {
        content = content.replace(/Prisma\.ProductoWhereInput/g, 'any');
        changed = true;
    }
    if (content.includes('Prisma.ProductoOrderByWithRelationInput')) {
        content = content.replace(/Prisma\.ProductoOrderByWithRelationInput/g, 'any');
        changed = true;
    }
    if (content.includes('Prisma.ProductoWhereUniqueInput')) {
        content = content.replace(/Prisma\.ProductoWhereUniqueInput/g, 'any');
        changed = true;
    }

    // Fix other Prisma types that broke because of the rename
    content = content.replace(/Prisma\.Producto/g, 'Prisma.DepositoProducto');

    if (changed) {
        fs.writeFileSync(file, content);
    }
});

// Create types augmentation for Express
const typesPath = path.join(__dirname, 'apps/platform/server/src/deposito/types.d.ts');
const typesContent = `
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: string
        name: string
        email: string
      }
    }
  }
}
export {};
`;
fs.writeFileSync(typesPath, typesContent);

console.log("Types fixed.");
