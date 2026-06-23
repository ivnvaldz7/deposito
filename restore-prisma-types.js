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

    // Restore Prisma types
    if (content.includes('const where: any = {}')) {
        if (file.includes('movimientos.ts')) {
            content = content.replace('const where: any = {}', 'const where: Prisma.MovimientoWhereInput = {}');
            changed = true;
        } else if (file.includes('productos.ts') || file.includes('mercado-inventory-helpers.ts')) {
            content = content.replace('const where: any = {}', 'const where: Prisma.DepositoProductoWhereInput = {}');
            changed = true;
        }
    }
    
    if (content.includes('const createdAtFilter: any = {}')) {
        content = content.replace('const createdAtFilter: any = {}', 'const createdAtFilter: Prisma.DateTimeFilter<"Movimiento"> = {}');
        changed = true;
    }

    if (file.includes('productos.ts')) {
        content = content.replace(/Prisma\.ProductoOrderByWithRelationInput/g, 'Prisma.DepositoProductoOrderByWithRelationInput');
        content = content.replace(/Prisma\.ProductoWhereUniqueInput/g, 'Prisma.DepositoProductoWhereUniqueInput');
        content = content.replace(/Prisma\.ProductoWhereInput/g, 'Prisma.DepositoProductoWhereInput');
    }

    if (changed) {
        fs.writeFileSync(file, content);
    }
});

console.log("Restored strict Prisma types.");
