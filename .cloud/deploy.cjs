require('./environment.cjs');
const { execFileSync } = require('node:child_process');

async function deploy() {
  // Provision both PostgreSQL schemas before deployment; Temporal owns their DDL.
  for (const [namespace, schema] of [
    ['temporal', 'postgresql/v12/temporal'],
    ['temporal_visibility', 'postgresql/v12/visibility'],
  ]) {
    const env = {
      ...process.env,
      SQL_PLUGIN: 'postgres12',
      SQL_HOST: process.env.TEMPORAL_PG_HOST,
      SQL_PORT: process.env.TEMPORAL_PG_PORT,
      SQL_USER: process.env.TEMPORAL_PG_USER,
      SQL_PASSWORD: process.env.TEMPORAL_PG_PASSWORD,
      SQL_DATABASE: process.env.TEMPORAL_PG_DATABASE,
      SQL_TLS: process.env.TEMPORAL_PG_TLS,
      SQL_CONNECT_ATTRIBUTES: `search_path=${namespace}`,
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
