const fs = require('fs');
let c = fs.readFileSync('apps/platform/server/src/deposito/routes/productos.ts', 'utf-8');

c = c.replace(
  /import { requireRole } from '\.\.\/middleware\/require-role'/,
  "import { requireRole } from '../middleware/require-role'\nimport { requirePermission } from '../../middlewares/require-permission'"
);

c = c.replace(
  /router\.get\('\/', authenticate, async \(req, res\): Promise<void> => {/g,
  "router.get('/', authenticate, requirePermission('deposito', 'productos_catalogo.read'), async (req, res): Promise<void> => {"
);
c = c.replace(
  /router\.get\('\/:id', authenticate, async \(req, res\): Promise<void> => {/g,
  "router.get('/:id', authenticate, requirePermission('deposito', 'productos_catalogo.read'), async (req, res): Promise<void> => {"
);

c = c.replace(
  /router\.post\('\/', authenticate, requireRole\('encargado'\), async \(req, res\): Promise<void> => {/g,
  "router.post('/', authenticate, requirePermission('deposito', 'productos_catalogo.manage'), async (req, res): Promise<void> => {"
);

c = c.replace(
  /router\.patch\('\/:id', authenticate, requireRole\('encargado'\), async \(req, res\): Promise<void> => {/g,
  "router.patch('/:id', authenticate, requirePermission('deposito', 'productos_catalogo.manage'), async (req, res): Promise<void> => {"
);

c = c.replace(
  /router\.post\('\/:id\/activar', authenticate, requireRole\('encargado'\), async \(req, res\): Promise<void> => {/g,
  "router.post('/:id/activar', authenticate, requirePermission('deposito', 'productos_catalogo.manage'), async (req, res): Promise<void> => {"
);

c = c.replace(
  /router\.post\('\/:id\/reactivar', authenticate, requireRole\('encargado'\), async \(req, res\): Promise<void> => {/g,
  "router.post('/:id/reactivar', authenticate, requirePermission('deposito', 'productos_catalogo.manage'), async (req, res): Promise<void> => {"
);

c = c.replace(
  /router\.post\('\/:id\/desactivar', authenticate, requireRole\('encargado'\), async \(req, res\): Promise<void> => {/g,
  "router.post('/:id/desactivar', authenticate, requirePermission('deposito', 'productos_catalogo.manage'), async (req, res): Promise<void> => {"
);

c = c.replace(
  /router\.delete\('\/:id', authenticate, requireRole\('encargado'\), async \(req, res\): Promise<void> => {/g,
  "router.delete('/:id', authenticate, requirePermission('deposito', 'productos_catalogo.manage'), async (req, res): Promise<void> => {"
);

c = c.replace(
  /router\.post\('\/importaciones\/dry-run', authenticate, requireRole\('encargado'\), upload\.single\('archivo'\), async \(req, res\): Promise<void> => {/g,
  "router.post('/importaciones/dry-run', authenticate, requirePermission('deposito', 'productos_catalogo.import'), upload.single('archivo'), async (req, res): Promise<void> => {"
);

c = c.replace(
  /router\.post\('\/importaciones\/confirmar', authenticate, requireRole\('encargado'\), upload\.single\('archivo'\), async \(req, res\): Promise<void> => {/g,
  "router.post('/importaciones/confirmar', authenticate, requirePermission('deposito', 'productos_catalogo.import'), upload.single('archivo'), async (req, res): Promise<void> => {"
);

fs.writeFileSync('apps/platform/server/src/deposito/routes/productos.ts', c);
console.log('done')
