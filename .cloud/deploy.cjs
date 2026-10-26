require('./environment.cjs');
const { execFileSync } = require('node:child_process');

async function deploy() {
  // Provision dedicated databases on the attached PostgreSQL cluster first.
  for (const [database, schema] of [
    [process.env.TEMPORAL_PG_DATABASE, 'postgresql/v12/temporal'],
    [process.env.TEMPORAL_PG_VISIBILITY_DATABASE, 'postgresql/v12/visibility'],
  ]) {
    const env = {
      ...process.env,
      SQL_PLUGIN: 'postgres12',
      SQL_HOST: process.env.TEMPORAL_PG_HOST,
      SQL_PORT: process.env.TEMPORAL_PG_PORT,
      SQL_USER: process.env.TEMPORAL_PG_USER,
      SQL_PASSWORD: process.env.TEMPORAL_PG_PASSWORD,
      SQL_DATABASE: database,
      SQL_TLS: process.env.TEMPORAL_PG_TLS,
    };
    // setup-schema preserves versions newer than 0.0; never use --overwrite.
    execFileSync('.cloud/bin/temporal-sql-tool', ['setup-schema', '--version', '0.0'], { env, stdio: 'inherit' });
    execFileSync('.cloud/bin/temporal-sql-tool', ['update-schema', '--schema-name', schema], { env, stdio: 'inherit' });
  }
  execFileSync('pnpm', ['run', 'prisma-db-push'], { stdio: 'inherit' });
}

deploy().catch(() => {
  console.error('Database initialization failed; deployment cancelled.');
  process.exitCode = 1;
});
