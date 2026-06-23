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

    // We replaced AuthRequest with Request, but we might not have imported Request from express
    if (content.includes('req: Request')) {
        // If it doesn't import Request from express
        if (!content.match(/import\s+.*\{[^}]*Request[^}]*\}\s+from\s+['"]express['"]/)) {
            // Check if it imports anything from express
            const expressImportMatch = content.match(/import\s+.*\{([^}]*)\}\s+from\s+['"]express['"]/);
            if (expressImportMatch) {
                // add Request to the existing import
                const newImport = `import { Request, ${expressImportMatch[1]} } from 'express'`;
                content = content.replace(expressImportMatch[0], newImport);
            } else {
                // add new import
                content = `import { Request, Response, NextFunction } from 'express'\n` + content;
            }
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(file, content);
    }
});

console.log("Fixed express Request imports.");
