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
      results.push(file);
    }
  });
  return results;
}
const files = walk('apps/platform/client/src/modules/deposito');
let changed = 0;
files.forEach(f => {
  if (!f.endsWith('.ts') && !f.endsWith('.tsx')) return;
  let content = fs.readFileSync(f, 'utf8');
  const orig = content;
  content = content.replace(/from '\.\.\/\.\.\/lib/g, "from '../lib");
  content = content.replace(/from '\.\.\/\.\.\/components/g, "from '../components");
  if (content !== orig) {
    fs.writeFileSync(f, content);
    changed++;
  }
});
console.log(`Fixed ${changed} files.`);
