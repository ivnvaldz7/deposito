const fs = require('fs');

let c = fs.readFileSync('apps/platform/server/src/routes/ale-bet/productos.ts', 'utf-8');

c = c.replace(
  /import { requireApp } from '\.\.\/\.\.\/middlewares\/require-app'/,
  "import { requireApp } from '../../middlewares/require-app'\nimport { requirePermission } from '../../middlewares/require-permission'"
);

c = c.replace(
  /router\.get\('\/', requireApp\('ale-bet'\), async \(req, res\) => {/g,
  "router.get('/', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.read'), async (req, res) => {"
);
c = c.replace(
  /router\.get\('\/', requireApp\('ale-bet'\), async \(_req, res\) => {/g,
  "router.get('/', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.read'), async (_req, res) => {"
);
c = c.replace(
  /router\.get\('\/search', requireApp\('ale-bet'\), async/g,
  "router.get('/search', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.read'), async"
);

c = c.replace(
  /router\.post\('\/', requireApp\('ale-bet', \['admin'\]\), async/g,
  "router.post('/', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.manage'), async"
);
c = c.replace(
  /router\.put\('\/:id', requireApp\('ale-bet', \['admin'\]\), async/g,
  "router.put('/:id', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.manage'), async"
);
c = c.replace(
  /router\.delete\('\/:id', requireApp\('ale-bet', \['admin'\]\), async/g,
  "router.delete('/:id', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.manage'), async"
);

c = c.replace(
  /router\.get\('\/:id\/lotes', requireApp\('ale-bet', \['admin', 'encargado'\]\), async/g,
  "router.get('/:id/lotes', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.read'), async"
);
c = c.replace(
  /router\.put\('\/:id\/lotes\/:loteId', requireApp\('ale-bet', \['admin', 'encargado'\]\), async/g,
  "router.put('/:id/lotes/:loteId', requireApp('ale-bet'), requirePermission('ale-bet', 'productos.manage'), async"
);
c = c.replace(
  /router\.post\('\/:id\/lotes', requireApp\('ale-bet', \['admin', 'encargado'\]\), async/g,
  "router.post('/:id/lotes', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.create'), async"
);
c = c.replace(
  /router\.get\('\/:id\/stock', requireApp\('ale-bet'\), async/g,
  "router.get('/:id/stock', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.read'), async"
);
c = c.replace(
  /router\.get\('\/:id\/lotes\/historial', requireApp\('ale-bet', \['admin', 'encargado'\]\), async/g,
  "router.get('/:id/lotes/historial', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.history.read'), async"
);
c = c.replace(
  /router\.post\('\/:id\/stock\/lotes', requireApp\('ale-bet', \['admin', 'encargado'\]\), async/g,
  "router.post('/:id/stock/lotes', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.create'), async"
);
c = c.replace(
  /router\.patch\('\/:id\/stock\/lotes\/:loteId\/ajuste', requireApp\('ale-bet', \['admin', 'encargado'\]\), async/g,
  "router.patch('/:id/stock/lotes/:loteId/ajuste', requireApp('ale-bet'), requirePermission('ale-bet', 'stock.lots.adjust'), async"
);

fs.writeFileSync('apps/platform/server/src/routes/ale-bet/productos.ts', c);
console.log('done')
