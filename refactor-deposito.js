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

const srcDir = path.join(__dirname, 'apps/deposito/server/src');
const files = walk(srcDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // Replace @prisma/client with @platform/db
    if (content.includes('@prisma/client')) {
        content = content.replace(/@prisma\/client/g, '@platform/db');
        changed = true;
    }

    // Replace Producto with DepositoProducto
    if (/\bProducto\b/.test(content)) {
        content = content.replace(/\bProducto\b/g, 'DepositoProducto');
        changed = true;
    }

    // Replace TipoMovimiento with DepositoTipoMovimiento
    if (/\bTipoMovimiento\b/.test(content)) {
        content = content.replace(/\bTipoMovimiento\b/g, 'DepositoTipoMovimiento');
        changed = true;
    }
    
    // Replace User with DepositoUser if we need it? No, User doesn't collide.
    
    if (changed) {
        fs.writeFileSync(file, content);
    }
});

console.log("Refactored depsito/server/src successfully.");
