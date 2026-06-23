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

    // Remove `Request` from auth imports
    if (content.match(/import\s+\{\s*([^}]*?)Request([^}]*?)\}\s+from\s+['"](?:\.\.\/)+middleware\/auth['"]/)) {
        content = content.replace(/import\s+\{\s*([^}]*?)Request([^}]*?)\}\s+from\s+['"](?:\.\.\/)+middleware\/auth['"]/g, (match, p1, p2) => {
            let newInside = (p1 + p2).replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
            if (newInside === '') {
                return '';
            } else {
                return `import { ${newInside} } from '../middleware/auth'`;
            }
        });
        changed = true;
    }

    // Same for './auth' (in middleware/require-role.ts)
    if (content.match(/import\s+\{\s*([^}]*?)Request([^}]*?)\}\s+from\s+['"]\.\/auth['"]/)) {
        content = content.replace(/import\s+\{\s*([^}]*?)Request([^}]*?)\}\s+from\s+['"]\.\/auth['"]/g, (match, p1, p2) => {
            let newInside = (p1 + p2).replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
            if (newInside === '') {
                return '';
            } else {
                return `import { ${newInside} } from './auth'`;
            }
        });
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
    }
});

console.log("Fixed Request imports from auth.");
