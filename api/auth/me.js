import { SESSION_COOKIE, json, parseCookies, verifySession } from './shared.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const token = parseCookies(req)[SESSION_COOKIE];
  const user = token ? verifySession(token) : null;
  if (!user) return json(res, 200, { user: null });
  return json(res, 200, { user });
}
