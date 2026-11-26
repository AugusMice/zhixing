import { SESSION_COOKIE, clearCookie, getAppOrigin, json } from './shared.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const origin = req.headers?.origin;
  if (origin && origin !== getAppOrigin()) return json(res, 403, { error: 'invalid_origin' });
  res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
  return json(res, 200, { ok: true });
}
