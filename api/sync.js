import {
  SESSION_COOKIE,
  getAppOrigin,
  getSyncUrl,
  json,
  parseCookies,
  secret,
  verifySession,
} from './auth/shared.js';

const MAX_BODY_BYTES = 8 * 1024 * 1024 + 8192;

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const declared = Number(req.headers?.['content-length'] || 0);
  if (declared > MAX_BODY_BYTES) {
    const err = new Error('payload_too_large');
    err.status = 413;
    throw err;
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      const err = new Error('payload_too_large');
      err.status = 413;
      throw err;
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('invalid_json');
    err.status = 400;
    throw err;
  }
}

function getSyncSecret() {
  try {
    return secret('ZHIXING_SYNC_SECRET');
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return json(res, 405, { error: 'method_not_allowed' });
  }

  if (req.method === 'PUT') {
    const origin = req.headers?.origin;
    if (origin && origin !== getAppOrigin()) {
      return json(res, 403, { error: 'invalid_origin' });
    }
  }

  const token = parseCookies(req)[SESSION_COOKIE];
  const user = token ? verifySession(token) : null;
  if (!user) {
    return json(res, 401, { error: 'unauthenticated' });
  }

  const syncSecret = getSyncSecret();
  if (!syncSecret) {
    return json(res, 503, { error: 'sync_not_configured' });
  }

  if (req.method === 'GET') {
    try {
      const target = `${getSyncUrl()}?userId=${encodeURIComponent(user.sub)}`;
      const upstream = await fetch(target, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${syncSecret}`,
        },
        signal: AbortSignal.timeout(12000),
      });
      const payload = await upstream.json().catch(() => null);
      if (!payload) {
        return json(res, 502, { error: 'sync_upstream_invalid' });
      }
      return json(res, upstream.status, payload);
    } catch {
      return json(res, 502, { error: 'sync_upstream_unreachable' });
    }
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const status = err?.status || 400;
    return json(res, status, { error: err?.message || 'invalid_request' });
  }

  const { baseRevision, updatedAt, snapshot } = body || {};
  if (
    !Number.isInteger(baseRevision) ||
    baseRevision < 0 ||
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot)
  ) {
    return json(res, 400, { error: 'invalid_sync_payload' });
  }

  try {
    const upstream = await fetch(getSyncUrl(), {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({
        userId: user.sub,
        baseRevision,
        updatedAt,
        snapshot,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await upstream.json().catch(() => null);
    if (!payload) {
      return json(res, 502, { error: 'sync_upstream_invalid' });
    }
    return json(res, upstream.status, payload);
  } catch {
    return json(res, 502, { error: 'sync_upstream_unreachable' });
  }
}
