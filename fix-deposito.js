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

const srcDir = path.join(__dirname, 'apps/platform/server/src/deposito');
const files = walk(srcDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    const regexProducto = /(prisma|tx)\.producto\b/g;
    if (regexProducto.test(content)) {
        content = content.replace(regexProducto, '$1.depositoProducto');
        changed = true;
    }

    const regexTipoMov = /(prisma|tx)\.tipoMovimiento\b/g;
    if (regexTipoMov.test(content)) {
        content = content.replace(regexTipoMov, '$1.depositoTipoMovimiento');
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
    }
});

console.log("Fixed lowercase delegates.");
