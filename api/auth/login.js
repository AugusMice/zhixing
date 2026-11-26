import { AUTH_ORIGIN, CLIENT_ID, TX_COOKIE, cookie, json, makeState } from './shared.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const state = makeState();
  const url = new URL('/api/login', AUTH_ORIGIN);
  url.searchParams.set('provider', 'github');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('client_state', state);
  res.setHeader('Set-Cookie', cookie(TX_COOKIE, state, 600));
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}
