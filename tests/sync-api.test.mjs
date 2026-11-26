import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createZhixingServer } from '../server.mjs';
import { SESSION_COOKIE, signSession } from '../api/auth/shared.js';

process.env.ZHIXING_SESSION_SECRET ||= 'test-secret-at-least-32-characters-long';
process.env.ZHIXING_EXCHANGE_SECRET ||= 'zhixing-exchange-secret-at-least-32-characters-long';
process.env.ZHIXING_SYNC_SECRET ||= 'zhixing-sync-secret-at-least-32-characters-long';

let tmpDir;
let server;
let baseUrl;
let mockWorker;
let workerState;

before(async () => {
  workerState = {
    lastMethod: null,
    lastUserId: null,
    lastAuth: null,
    row: null,
  };

  mockWorker = http.createServer(async (req, res) => {
    workerState.lastMethod = req.method;
    workerState.lastAuth = req.headers.authorization;
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'GET') {
      workerState.lastUserId = url.searchParams.get('userId');
      res.setHeader('content-type', 'application/json');
      if (!workerState.row) {
        res.end(JSON.stringify({ exists: false, revision: 0, updatedAt: 0, snapshot: null }));
      } else {
        res.end(JSON.stringify({ exists: true, ...workerState.row }));
      }
      return;
    }
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      workerState.lastUserId = body.userId;
      if (workerState.row && body.baseRevision !== workerState.row.revision) {
        res.statusCode = 409;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ conflict: true, ...workerState.row }));
        return;
      }
      const nextRev = (workerState.row?.revision || 0) + 1;
      workerState.row = {
        revision: nextRev,
        updatedAt: body.updatedAt,
        snapshot: body.snapshot,
      };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, revision: nextRev, updatedAt: body.updatedAt }));
      return;
    }
    res.statusCode = 405;
    res.end();
  });

  await new Promise((resolve) => mockWorker.listen(0, '127.0.0.1', resolve));
  const workerPort = mockWorker.address().port;
  process.env.WRIS_SYNC_URL = `http://127.0.0.1:${workerPort}/zhixing/sync`;

  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'zhixing-sync-srv-'));
  mkdirSync(path.join(tmpDir, 'assets'), { recursive: true });
  writeFileSync(path.join(tmpDir, 'index.html'), '<!doctype html><html><body>zhixing</body></html>');

  server = createZhixingServer({ distDir: tmpDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => mockWorker.close(resolve));
  rmSync(tmpDir, { recursive: true, force: true });
});

test('/api/sync rejects unauthenticated and cross-origin PUT requests', async () => {
  const unauth = await fetch(`${baseUrl}/api/sync`);
  assert.equal(unauth.status, 401);

  const token = signSession({ sub: 'github:42', provider: 'github', name: 'Star' });
  const badOrigin = await fetch(`${baseUrl}/api/sync`, {
    method: 'PUT',
    headers: {
      cookie: `${SESSION_COOKIE}=${token}`,
      origin: 'https://evil.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ baseRevision: 0, updatedAt: 1000, snapshot: { schemaVersion: 1 } }),
  });
  assert.equal(badOrigin.status, 403);
});

test('/api/sync proxies GET, PUT, and 409 conflict with verified session user', async () => {
  const token = signSession({ sub: 'github:42', provider: 'github', name: 'Star' });
  const headers = {
    cookie: `${SESSION_COOKIE}=${token}`,
    origin: 'https://zhistar.aux.wris.me',
    'content-type': 'application/json',
  };

  const emptyGet = await fetch(`${baseUrl}/api/sync`, { headers: { cookie: headers.cookie } });
  assert.equal(emptyGet.status, 200);
  assert.equal((await emptyGet.json()).exists, false);
  assert.equal(workerState.lastUserId, 'github:42');
  assert.equal(workerState.lastAuth, `Bearer ${process.env.ZHIXING_SYNC_SECRET}`);

  const put1 = await fetch(`${baseUrl}/api/sync`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      baseRevision: 0,
      updatedAt: 1000,
      snapshot: { schemaVersion: 1, appData: { cards: {} } },
    }),
  });
  assert.equal(put1.status, 200);
  assert.equal((await put1.json()).revision, 1);

  const stalePut = await fetch(`${baseUrl}/api/sync`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      baseRevision: 0,
      updatedAt: 2000,
      snapshot: { schemaVersion: 1, appData: { cards: { q1: {} } } },
    }),
  });
  assert.equal(stalePut.status, 409);
  const conflict = await stalePut.json();
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.revision, 1);
});
