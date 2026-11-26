import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/auth/callback.js';
import { SESSION_COOKIE, TX_COOKIE, signSession } from '../api/auth/shared.js';

process.env.ZHIXING_SESSION_SECRET ||= 'test-secret-at-least-32-characters-long';
process.env.ZHIXING_EXCHANGE_SECRET ||= 'zhixing-exchange-secret-at-least-32-characters-long';

function req(code, state, cookieState = state) {
  return { method: 'GET', query: { code, state }, headers: { cookie: `${TX_COOKIE}=${cookieState}` } };
}
function res() {
  return { headers: {}, statusCode: 0, body: '', setHeader(k,v){this.headers[k]=v;}, end(v=''){this.body=v;} };
}

test('callback refuses mismatched state', async () => {
  const result = res();
  await handler(req('test-code', 'state-1', 'state-2'), result);
  assert.equal(result.statusCode, 400);
  assert.equal(result.headers['Referrer-Policy'], 'no-referrer');
});

test('callback sets host-only session after code exchange', async () => {
  const original = globalThis.fetch;
  const verified = (await import('../api/auth/shared.js')).verifySession;
  const token = signSession({ sub: 'github:user-1', provider: 'github' });
  const expectedUser = verified(token);
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ user: expectedUser }));
  try {
    const result = res();
    await handler(req('one-time-code', 'state-12345678901234567890123456789012'), result);
    assert.equal(result.statusCode, 302);
    assert.equal(result.headers.Location, '/#/settings');
    assert.match(result.headers['Set-Cookie'][1], new RegExp(`^${SESSION_COOKIE}=`));
    assert.match(result.headers['Set-Cookie'][1], /HttpOnly; Secure; SameSite=Lax/);
    assert.doesNotMatch(result.headers['Set-Cookie'][1], /Domain=/);
  } finally { fetchMock.mock.restore(); globalThis.fetch = original; }
});

test('callback works with raw Node req.url query string and sends new redirectUri', async () => {
  const original = globalThis.fetch;
  const token = signSession({ sub: 'google:user-2', provider: 'google' });
  const expectedUser = (await import('../api/auth/shared.js')).verifySession(token);
  let capturedBody = null;
  let capturedUrl = null;
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    return Response.json({ user: expectedUser });
  });
  try {
    const state = 'node-http-state-12345678901234567890';
    const result = res();
    await handler({ method: 'GET', url: `/api/auth/callback?code=raw-code&state=${state}`, headers: { cookie: `${TX_COOKIE}=${state}` } }, result);
    assert.equal(result.statusCode, 302);
    assert.equal(capturedUrl, 'https://auth.wris.me/api/bridge/exchange');
    assert.equal(capturedBody.redirectUri, 'https://zhistar.aux.wris.me/api/auth/callback');
  } finally { fetchMock.mock.restore(); globalThis.fetch = original; }
});
