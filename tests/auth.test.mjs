import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/auth/me.js';
import logout from '../api/auth/logout.js';
import { SESSION_COOKIE, signSession, verifySession } from '../api/auth/shared.js';

process.env.ZHIXING_SESSION_SECRET ||= 'test-secret-at-least-32-characters-long';

function response() {
  return { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k] = v; }, end(v = '') { this.body = v; } };
}

test('知星本地 session 签发并验证用户 sub', () => {
  const token = signSession({ sub: 'github:123', provider: 'github', name: 'Test' });
  assert.deepEqual(verifySession(token), { sub: 'github:123', provider: 'github', name: 'Test', login: undefined, avatar: undefined });
  assert.equal(verifySession(token + 'x'), null);
});

test('当前用户 endpoint 只返回有效 session 用户', () => {
  const token = signSession({ sub: 'google:abc', provider: 'google' });
  const res = response();
  handler({ method: 'GET', headers: { cookie: `${SESSION_COOKIE}=${token}` } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).user.sub, 'google:abc');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('退出清除 host-only session cookie 且拒绝跨站来源', () => {
  const denied = response();
  logout({ method: 'POST', headers: { origin: 'https://evil.example' } }, denied);
  assert.equal(denied.statusCode, 403);
  const ok = response();
  logout({ method: 'POST', headers: { origin: 'https://zhistar.aux.wris.me' } }, ok);
  assert.match(ok.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(ok.headers['Set-Cookie'], /Domain=/);
});
