const fs = require('fs');
const glob = require('glob');
const files = glob.sync('src/**/*.test.ts');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes("vi.mock('@platform/core'")) {
    if (!content.includes('APP_SLUG_BY_ID')) {
      const insertStr = `
    APP_SLUG_BY_ID: { deposito: 'deposito', ale_bet: 'ale-bet', portal: 'portal', admin: 'admin' },
    getAppAccess: (user, slug) => user && user.apps ? user.apps[slug] : undefined,
    `;

      if (content.includes('verifyAccessToken: (')) {
        content = content.replace('verifyAccessToken: (', insertStr + 'verifyAccessToken: (');
      } else if (content.includes('getUserByEmail: ')) {
        content = content.replace('getUserByEmail: ', insertStr + 'getUserByEmail: ');
      } else if (content.includes('requireApp: ')) {
        content = content.replace('requireApp: ', insertStr + 'requireApp: ');
      } else {
        console.log('Could not find injection point for', file);
      }
      
      fs.writeFileSync(file, content);
      console.log('Patched', file);
    }
  }
}
