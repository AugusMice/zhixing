# 知星 wris.me 登录（Vercel 部署）

本阶段只建立账号身份，不同步学习进度；学习记录仍保存在设备 IndexedDB。

## 知星 Vercel 环境变量

- `ZHIXING_SESSION_SECRET`：至少 32 字符随机 secret，用于签发知星 HttpOnly 会话。
- `ZHIXING_EXCHANGE_SECRET`：至少 32 字符随机 secret，Vercel -> wris-auth 的兑换代理密钥。
- `WRIS_BRIDGE_URL=https://auth.wris.me/api/bridge`

仅配在 Vercel 服务端，不要使用 `VITE_` 前缀。可用 `openssl rand -base64 32` 生成随机值。

## wris-auth Vercel 环境变量

- `WRIS_BRIDGE_SECRET`：至少 32 字符随机 secret，auth -> Worker 的创建码调用密钥。
- `ZHIXING_EXCHANGE_SECRET`：另一个独立的至少 32 字符随机 secret，Vercel -> auth 兑换代理密钥。
- `WRIS_BRIDGE_URL=https://api.wris.me/auth/bridge`
- `ZHIXING_REDIRECT_URI=https://zhistar.aux.wstudio.work/api/auth/callback`

完成后重新部署 wris-auth。

## wris-data Cloudflare Worker

- 设置独立随机 `AUTH_BRIDGE_SECRET`（不能和 wris-auth/Vercel 的值复用）。
- 在 Image2Story 的 `worker/` 目录执行 `npx wrangler d1 execute wris-data --file=schema.sql --remote`，创建 `auth_bridge_codes` 表。
- 部署 Worker，并确认自定义域 `api.wris.me` 在线。

授权码只存 SHA-256 摘要、有效 60 秒，绑定固定 client、callback 与 state；兑换时用 D1 条件更新原子标记已消费，重复兑换失败。

## 生产域与安全边界

回调固定为 `https://zhistar.aux.wstudio.work/api/auth/callback`。知星 Cookie 为 `__Host-zx_session`，`HttpOnly; Secure; SameSite=Lax`、host-only；长期 wris JWT 不会返回浏览器。登录只显示身份，不表示学习进度已同步。

只有知星 Vercel、wris-auth 与 Worker 都配置并部署后，OAuth 登录才能真实完成。本机可运行 session/API 单测，但真实 OAuth 要在生产域验证。
