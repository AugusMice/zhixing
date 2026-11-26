import { TX_COOKIE, cookie, getAuthOrigin, getClientId, json, makeState, parseQuery } from './shared.js';

const ALLOWED_PROVIDERS = new Set(['github', 'google']);

export default function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const query = parseQuery(req);
  const requested = typeof query.provider === 'string' ? query.provider.trim().toLowerCase() : '';
  const fallback = String(process.env.ZHIXING_DEFAULT_PROVIDER || 'github').trim().toLowerCase();
  const provider = ALLOWED_PROVIDERS.has(requested)
    ? requested
    : (ALLOWED_PROVIDERS.has(fallback) ? fallback : 'github');

  const state = makeState();
  const url = new URL('/api/login', getAuthOrigin());
  url.searchParams.set('provider', provider);
  url.searchParams.set('client_id', getClientId());
  url.searchParams.set('client_state', state);
  res.setHeader('Set-Cookie', cookie(TX_COOKIE, state, 600));
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}
