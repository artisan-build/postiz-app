const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

function load(env) {
  return JSON.parse(execFileSync(process.execPath, ['-e', `
    require('./.cloud/environment.cjs');
    process.stdout.write(JSON.stringify(process.env));
  `], { cwd: require('node:path').join(__dirname, '..'), env, encoding: 'utf8' }));
}

test('Temporal can use its certificate hostname without changing Postiz database settings', () => {
  const database = 'postgresql://app%2Bname:p%40ss%3Aword@alias.example:6543/postiz?sslmode=require&serverVersion=17';
  const env = load({ DATABASE_URL: database, TEMPORAL_PG_HOST: 'canonical.example',
    TEMPORAL_PG_DATABASE: 'history', TEMPORAL_PG_VISIBILITY_DATABASE: 'visibility' });
  assert.equal(env.TEMPORAL_PG_HOST, 'canonical.example');
  assert.equal(env.TEMPORAL_PG_DATABASE, 'history');
  assert.equal(env.TEMPORAL_PG_VISIBILITY_DATABASE, 'visibility');
  assert.equal(new URL(env.DATABASE_URL).hostname, 'alias.example');
  assert.equal(new URL(env.DATABASE_URL).searchParams.has('serverVersion'), false);
  assert.equal(env.TEMPORAL_PG_USER, 'app+name');
  assert.equal(env.TEMPORAL_PG_PASSWORD, 'p@ss:word');
  assert.equal(env.TEMPORAL_PG_PORT, '6543');
  assert.equal(env.TEMPORAL_PG_TLS, 'true');
  const local = load({ DATABASE_URL: 'postgresql://app:pw@127.0.0.1/postiz?sslmode=disable' });
  assert.equal(local.TEMPORAL_PG_HOST, '127.0.0.1');
  assert.equal(local.TEMPORAL_PG_TLS, 'false');
  assert.equal(local.TEMPORAL_PG_DATABASE, 'temporal');
  assert.equal(local.TEMPORAL_PG_VISIBILITY_DATABASE, 'temporal_visibility');
});

test('Cloud resource settings preserve regional R2 endpoints and explicit public URLs', () => {
  const env = load({ APP_URL: 'https://postiz.example', AWS_BUCKET: 'bucket-73',
    AWS_ENDPOINT_URL: 'https://bucket-73.account.eu.r2.cloudflarestorage.com',
    AWS_ACCESS_KEY_ID: 'test-key', AWS_SECRET_ACCESS_KEY: 'test-secret',
    CLOUDFLARE_BUCKET_URL: 'https://media.example', MAIL_FROM_ADDRESS: 'postiz@example.com' });
  assert.equal(env.NEXT_PUBLIC_BACKEND_URL, 'https://postiz.example/api');
  assert.equal(env.CLOUDFLARE_ENDPOINT, 'https://account.eu.r2.cloudflarestorage.com');
  assert.equal(env.CLOUDFLARE_BUCKET_URL, 'https://media.example');
  assert.equal(env.EMAIL_FROM_ADDRESS, 'postiz@example.com');
});

test('missing optional mappings do not create literal undefined environment values', () => {
  const env = load({});
  assert.equal(env.MAIN_URL, undefined);
  assert.equal(env.EMAIL_FROM_ADDRESS, undefined);
  assert.equal(env.EMAIL_FROM_NAME, undefined);
});
