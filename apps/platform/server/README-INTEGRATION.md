# Pruebas de Integración (Concurrencia)

Este directorio contiene las pruebas de integración utilizando una base de datos PostgreSQL dedicada para reproducir fallos de concurrencia e idempotencia.

## Requisitos Previos

1. Base de datos `deposito_test` creada en PostgreSQL local (puerto `5433`).
2. Las variables de entorno configuradas.

## Configuración y Variables de Entorno

El framework inyecta de forma segura la URL de prueba antes de que los adaptadores se conecten a la base. Asegúrate de tener estas variables:

```env
# En .env o inyectadas por CI
TEST_DB_ADMIN_URL=postgresql://<usuario>:<contraseña>@localhost:5432/postgres
DATABASE_URL_TEST=postgresql://<usuario>:<contraseña>@localhost:5432/deposito_test
ALLOW_TEST_DB_RESET=true
```

El script de tests validará la URL y `create-test-db.js` utilizará la conexión de admin para inicializar la base de test.

## Cómo Ejecutar

Para correr la suite completa de integración, que inicializa la DB en blanco y sincroniza procesos con semáforos, ejecutar:

```bash
cd apps/platform/server
npm run test:integration
```

Este comando:
1. Revisa que el entorno no apunte a la base productiva.
2. Crea de ser necesario la estructura con prisma en la base `deposito_test`.
3. Levanta los runners de vitest en `singleThread` mode para no colisionar en la DB.
4. Trunca las tablas antes de cada test.
5. Emula peticiones concurrentes a través de `SyncBarrier` implementado sobre `pg_advisory_lock` y triggers.

## Resultados Esperados

Actualmente los tests de concurrencia (A, B, C y D) están marcados con `it.fails` ya que el código productivo permite los TOCTOU y Lost Updates. Esto es intencional hasta que se implemente el **PR-B** con los resguardos transaccionales.
