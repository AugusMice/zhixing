import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/auth/login.js';
import { TX_COOKIE } from '../api/auth/shared.js';

function response() { return { headers: {}, statusCode: 0, body: '', setHeader(k,v){this.headers[k]=v;}, end(v=''){this.body=v;} }; }

test('login starts a GitHub central-auth redirect with a CSRF state cookie', () => {
  const res = response();
  handler({ method: 'GET', url: '/api/auth/login' }, res);
  assert.equal(res.statusCode, 302);
  const location = new URL(res.headers.Location);
  assert.equal(location.origin, 'https://auth.wris.me');
  assert.equal(location.pathname, '/api/login');
  assert.equal(location.searchParams.get('provider'), 'github');
  assert.equal(location.searchParams.get('client_id'), 'zhixing');
  assert.match(location.searchParams.get('client_state'), /^[A-Za-z0-9_-]{32,128}$/);
  assert.match(res.headers['Set-Cookie'], new RegExp(`^${TX_COOKIE}=`));
  assert.match(res.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
});

test('login allows google provider and falls back to github on unknown provider', () => {
  const googleRes = response();
  handler({ method: 'GET', url: '/api/auth/login?provider=google' }, googleRes);
  assert.equal(new URL(googleRes.headers.Location).searchParams.get('provider'), 'google');

  const unknownRes = response();
  handler({ method: 'GET', url: '/api/auth/login?provider=evil' }, unknownRes);
  assert.equal(new URL(unknownRes.headers.Location).searchParams.get('provider'), 'github');
});
