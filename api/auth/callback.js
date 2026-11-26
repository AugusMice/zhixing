import { AUTH_ORIGIN, CLIENT_ID, REDIRECT_URI, SESSION_COOKIE, TX_COOKIE, clearCookie, json, parseCookies, secret, signSession } from './shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const query = req.query || {};
  const code = typeof query.code === 'string' ? query.code : '';
  const state = typeof query.state === 'string' ? query.state : '';
  const cookies = parseCookies(req);
  const txCookie = cookies[TX_COOKIE];
  if (!code || !state || !txCookie || !safeEqual(state, txCookie)) {
    res.setHeader('Set-Cookie', clearCookie(TX_COOKIE));
    res.setHeader('Referrer-Policy', 'no-referrer');
    return json(res, 400, { error: 'invalid_login_state' });
  }
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    const response = await fetch(`${AUTH_ORIGIN}/api/bridge/exchange`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret('ZHIXING_EXCHANGE_SECRET')}`,
        cookie: `${TX_COOKIE}=${txCookie}`,
      },
      body: JSON.stringify({ code, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Authorization code was rejected');
    const user = (await response.json()).user;
    if (!user || typeof user.sub !== 'string' || !/^(github|google):[^\s]{1,200}$/.test(user.sub)) throw new Error('Invalid user response');
    const session = signSession({
      sub: user.sub,
      provider: String(user.provider || '').slice(0, 30),
      name: String(user.name || '').slice(0, 200),
      login: String(user.login || '').slice(0, 200),
      avatar: typeof user.avatar === 'string' ? user.avatar.slice(0, 1000) : null,
    });
    res.setHeader('Set-Cookie', [clearCookie(TX_COOKIE), `__Host-zx_session=${session}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`]);
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 302;
    res.setHeader('Location', '/#/settings');
    res.end();
  } catch {
    res.setHeader('Set-Cookie', clearCookie(TX_COOKIE));
    return json(res, 401, { error: 'login_exchange_failed' });
  }
}

function safeEqual(a, b) {
  if (a.length !== b.length || !/^[A-Za-z0-9_-]+$/.test(a) || !/^[A-Za-z0-9_-]+$/.test(b)) return false;
  return a === b;
}
