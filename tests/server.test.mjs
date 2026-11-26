import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createZhixingServer, parseCliArgs } from '../server.mjs';
import { SESSION_COOKIE, signSession } from '../api/auth/shared.js';

process.env.ZHIXING_SESSION_SECRET ||= 'test-secret-at-least-32-characters-long';
process.env.ZHIXING_EXCHANGE_SECRET ||= 'zhixing-exchange-secret-at-least-32-characters-long';

let tmpDir;
let server;
let baseUrl;

before(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'zhixing-srv-'));
  mkdirSync(path.join(tmpDir, 'assets'), { recursive: true });
  writeFileSync(path.join(tmpDir, 'index.html'), '<!doctype html><html><body>zhixing</body></html>');
  writeFileSync(path.join(tmpDir, 'sw.js'), '/* sw */');
  writeFileSync(path.join(tmpDir, 'assets', 'app-123.js'), 'console.log("ok");'.repeat(100));

  server = createZhixingServer({ distDir: tmpDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(tmpDir, { recursive: true, force: true });
});

test('parseCliArgs parses port, host, dist, and env flags', () => {
  const parsed = parseCliArgs(['--host', '127.0.0.1', '-p', '8080', '--dist=./dist', '--env', '.env.prod']);
  assert.equal(parsed.host, '127.0.0.1');
  assert.equal(parsed.port, 8080);
  assert.equal(parsed.envFile, path.resolve('.env.prod'));
  assert.equal(parsed.distDir, path.resolve('./dist'));
});

test('GET /healthz returns service status without caching', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.origin, 'https://zhistar.aux.wris.me');
});

test('serves index.html with no-cache and hashed assets with immutable cache', async () => {
  const indexRes = await fetch(`${baseUrl}/`);
  assert.equal(indexRes.status, 200);
  assert.equal(indexRes.headers.get('cache-control'), 'no-cache');
  assert.match(await indexRes.text(), /zhixing/);

  const swRes = await fetch(`${baseUrl}/sw.js`);
  assert.equal(swRes.status, 200);
  assert.equal(swRes.headers.get('cache-control'), 'no-cache');

  const assetRes = await fetch(`${baseUrl}/assets/app-123.js`);
  assert.equal(assetRes.status, 200);
  assert.equal(assetRes.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('blocks path traversal and returns 404 for missing assets or unknown api routes', async () => {
  const traversal = await fetch(`${baseUrl}/..%2fpackage.json`);
  assert.equal(traversal.status, 403);

  const missingAsset = await fetch(`${baseUrl}/assets/missing.js`);
  assert.equal(missingAsset.status, 404);

  const missingApi = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(missingApi.status, 404);
  assert.equal((await missingApi.json()).error, 'not_found');
});

test('serves /api/auth/login, /api/auth/me, and /api/auth/logout over HTTP', async () => {
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, { redirect: 'manual' });
  assert.equal(loginRes.status, 302);
  assert.match(loginRes.headers.get('location'), /^https:\/\/auth\.wris\.me\/api\/login\?/);

  const token = signSession({ sub: 'github:42', provider: 'github', name: 'Star' });
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.user.sub, 'github:42');

  const deniedLogout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { origin: 'https://zhistar.aux.wstudio.work' },
  });
  assert.equal(deniedLogout.status, 403);

  const okLogout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { origin: 'https://zhistar.aux.wris.me' },
  });
  assert.equal(okLogout.status, 200);
  assert.equal((await okLogout.json()).ok, true);
});
