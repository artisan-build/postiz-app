require('./environment.cjs');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

process.chdir(path.join(__dirname, '..'));
const children = [];
let stopping = false;
let server;

async function stop(code) {
  if (stopping) return;
  stopping = true;
  server?.close();
  // Drain the application before stopping the workflow service it depends on.
  for (const child of [...children].reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(15000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  process.exit(code);
}

function start(name, command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.push(child);
  child.once('error', () => {
    console.error(`${name} could not start`);
    void stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} exited (${signal || code})`);
      void stop(1);
    }
  });
}

async function waitFor(check, name) {
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      if (await check()) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`${name} did not become ready`);
}

async function boot() {
  for (const key of [
    'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'MAIN_URL',
    'RESEND_API_KEY', 'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME',
    ...(process.env.STORAGE_PROVIDER === 'cloudflare' ? ['CLOUDFLARE_BUCKET_URL'] : []),
  ]) {
    if (!process.env[key]) throw new Error(`${key} is required`);
  }
  start('Temporal', '.cloud/bin/temporal-server', [
    '--root', process.cwd(), '--config', '.cloud', '--env', 'temporal',
    '--allow-no-auth', 'start',
  ]);
  const { Connection } = require('@temporalio/client');
  let connection;
  await waitFor(async () => {
    connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS,
      connectTimeout: '2s',
    });
    return true;
  }, 'Temporal');
  try {
    await connection.workflowService.describeNamespace({ namespace: 'default' });
  } catch (error) {
    if (error.code !== 5) throw error;
    await connection.workflowService.registerNamespace({
      namespace: 'default', workflowExecutionRetentionPeriod: { seconds: 604800 },
    });
  } finally {
    await connection.close();
  }
  await waitFor(() => {
    execFileSync('.cloud/bin/temporal', [
      '--command-timeout', '2s', 'operator', 'search-attribute', 'list',
    ], { stdio: 'ignore' });
    return true;
  }, 'Temporal namespace');

  const ready = async (url) => (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  start('Backend', process.execPath, ['--experimental-require-module', 'dist/apps/backend/src/main.js'], {
    cwd: path.resolve('apps/backend'), env: { ...process.env, PORT: '3001' },
  });
  await waitFor(() => ready('http://127.0.0.1:3001/auth/can-register'), 'Backend');
  start('Orchestrator', process.execPath, ['--experimental-require-module', 'dist/apps/orchestrator/src/main.js'], {
    cwd: path.resolve('apps/orchestrator'),
  });
  await waitFor(() => ready('http://127.0.0.1:3002/health/status'), 'Orchestrator');
  start('Frontend', process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '-p', '4200', '-H', '127.0.0.1'], {
    cwd: path.resolve('apps/frontend'),
  });
  await waitFor(() => ready('http://127.0.0.1:4200/auth/login'), 'Frontend');

  // Claim the instance through Postiz's own API before exposing public traffic.
  const registration = await (await fetch('http://127.0.0.1:3001/auth/can-register')).json();
  if (process.env.DISABLE_REGISTRATION === 'true' && registration.register) {
    if (!process.env.POSTIZ_OWNER_EMAIL || !process.env.POSTIZ_OWNER_PASSWORD) {
      throw new Error('POSTIZ_OWNER_EMAIL and POSTIZ_OWNER_PASSWORD are required for first boot');
    }
    const response = await fetch('http://127.0.0.1:3001/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'LOCAL', company: 'Postiz',
        email: process.env.POSTIZ_OWNER_EMAIL, password: process.env.POSTIZ_OWNER_PASSWORD,
      }),
    });
    if (!response.ok) throw new Error(`Owner registration failed (${response.status})`);
    console.log('Owner registered; follow the Postiz activation email before logging in');
  }

  server = http.createServer((req, res) => {
    const api = req.url.startsWith('/api/');
    const upstream = http.request({
      hostname: '127.0.0.1', port: api ? 3001 : 4200,
      path: api ? req.url.slice(4) : req.url, method: req.method,
      headers: req.headers,
    }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
      res.on('close', () => response.destroy());
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
  server.on('error', (error) => {
    console.error(error.message);
    void stop(1);
  });
  server.listen(Number(process.env.PORT || 3000), '::', () => console.log('Postiz Cloud ready'));
}

process.once('SIGTERM', () => void stop(0));
process.once('SIGINT', () => void stop(0));
boot().catch((error) => {
  console.error(error.message);
  void stop(1);
});
