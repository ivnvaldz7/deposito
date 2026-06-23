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

    // 1. Remove @ts-nocheck
    if (content.startsWith('// @ts-nocheck\n')) {
        content = content.replace('// @ts-nocheck\n', '');
        changed = true;
    }

    // 2. Fix req.user -> req.depositoUser to avoid Express.Request.user conflicts
    if (content.includes('req.user')) {
        content = content.replace(/req\.user/g, 'req.depositoUser');
        changed = true;
    }
    
    // We also need to fix req.depositoUser in auth.ts when we assign it
    // Wait, the script will do this.

    // 3. Fix Prisma.Producto -> Prisma.DepositoProducto types
    // Earlier we replaced Prisma.ProductoWhereInput with any. We should revert that or just fix what's there.
    // My previous script replaced 'any' for Prisma.* things. Let's restore them properly.
    // Wait, I replaced Prisma.ProductoWhereInput with 'any' only if it existed, but wait, I didn't commit it to git, I just ran the script.
    
    if (changed) {
        fs.writeFileSync(file, content);
    }
});

console.log("Removed ts-nocheck and renamed req.user to req.depositoUser.");
