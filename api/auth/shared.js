import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const DEFAULT_APP_ORIGIN = 'https://zhistar.aux.wris.me';
export const AUTH_ORIGIN = 'https://auth.wris.me';
export const REDIRECT_URI = `${DEFAULT_APP_ORIGIN}/api/auth/callback`;
export const CLIENT_ID = 'zhixing';
export const TX_COOKIE = '__Host-zx_auth_tx';
export const SESSION_COOKIE = '__Host-zx_session';
export const SESSION_TTL = 7 * 24 * 60 * 60;

function trimSlash(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function getAppOrigin() {
  return trimSlash(process.env.ZHIXING_ORIGIN || process.env.APP_ORIGIN) || DEFAULT_APP_ORIGIN;
}

export function getAuthOrigin() {
  return trimSlash(process.env.WRIS_AUTH_ORIGIN) || AUTH_ORIGIN;
}

export function getBridgeUrl() {
  return trimSlash(process.env.WRIS_BRIDGE_URL) || `${getAuthOrigin()}/api/bridge`;
}

export function getSyncUrl() {
  return trimSlash(process.env.WRIS_SYNC_URL) || 'https://api.wris.me/zhixing/sync';
}

export function getRedirectUri() {
  return String(process.env.ZHIXING_REDIRECT_URI || '').trim() || `${getAppOrigin()}/api/auth/callback`;
}

export function getClientId() {
  return String(process.env.ZHIXING_CLIENT_ID || '').trim() || CLIENT_ID;
}

export function parseQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

export function secret(name) {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return value;
}

export function makeState() {
  return randomBytes(32).toString('base64url');
}

export function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name) {
  return cookie(name, '', 0);
}

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter(([key]) => key));
}

export function signSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ ...user, iss: 'zhixing', aud: 'zhixing-web', iat: now, exp: now + SESSION_TTL }));
  const body = `${header}.${payload}`;
  return `${body}.${createHmac('sha256', secret('ZHIXING_SESSION_SECRET')).update(body).digest('base64url')}`;
}

export function verifySession(token) {
  if (typeof token !== 'string') return null;
  const [header, payload, signature, extra] = token.split('.');
  if (!header || !payload || !signature || extra) return null;
  let expected;
  try { expected = createHmac('sha256', secret('ZHIXING_SESSION_SECRET')).update(`${header}.${payload}`).digest(); }
  catch { return null; }
  const supplied = Buffer.from(signature, 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const h = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (h.alg !== 'HS256' || claims.iss !== 'zhixing' || claims.aud !== 'zhixing-web' ||
        typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000) ||
        typeof claims.sub !== 'string' || !/^(github|google):[^\s]{1,200}$/.test(claims.sub)) return null;
    return { sub: claims.sub, provider: claims.provider, name: claims.name, login: claims.login, avatar: claims.avatar };
  } catch { return null; }
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function b64(value) {
  return Buffer.from(value).toString('base64url');
}
