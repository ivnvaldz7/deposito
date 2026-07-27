const { Client } = require('pg');

async function createTestDb() {
  const adminUrl = process.env.TEST_DB_ADMIN_URL;
  if (!adminUrl) {
    console.error('Abortando: La variable TEST_DB_ADMIN_URL no está definida.');
    process.exit(1);
  }

  if (adminUrl === process.env.DATABASE_URL) {
    console.error('Abortando: TEST_DB_ADMIN_URL no puede ser igual a DATABASE_URL productiva.');
    process.exit(1);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(adminUrl);
  } catch (err) {
    console.error('Abortando: TEST_DB_ADMIN_URL no es una URL válida.');
    process.exit(1);
  }

  const host = parsedUrl.hostname;
  const port = parsedUrl.port;
  const dbName = parsedUrl.pathname.slice(1);

  console.log(`Intentando conectar a ${host}:${port}/${dbName}...`);

  const client = new Client({
    connectionString: adminUrl
  });

  try {
    await client.connect();
    await client.query('CREATE DATABASE deposito_test');
    console.log('Database deposito_test created');
  } catch (err) {
    if (err.code === '42P04') {
      console.log('Database deposito_test already exists');
    } else {
      console.error('Error creating database:', err.message);
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

createTestDb();
