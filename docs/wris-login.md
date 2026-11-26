# 知星 wris.me 登录与云端进度同步（香港服务器 Node.js 部署）

知星已接入 `wris.me` 登录并通过 `wris-data`（Cloudflare Worker D1 + R2）实现学习进度与真题记录的多设备自动合并同步。

## 1. 知星服务端环境变量（`.env`）

在香港服务器项目根目录复制 `.env.example` 为 `.env`：

- `HOST=127.0.0.1`（本机 Nginx / Caddy 反代时建议仅监听回环地址；直连调试可改为 `0.0.0.0`）
- `PORT=3000`
- `ZHIXING_ORIGIN=https://zhistar.aux.wris.me`
- `ZHIXING_REDIRECT_URI=https://zhistar.aux.wris.me/api/auth/callback`
- `WRIS_AUTH_ORIGIN=https://auth.wris.me`
- `WRIS_BRIDGE_URL=https://auth.wris.me/api/bridge`
- `WRIS_SYNC_URL=https://api.wris.me/zhixing/sync`
- `ZHIXING_SESSION_SECRET`：至少 32 字符随机 secret，用于签发知星 HttpOnly 会话。
- `ZHIXING_EXCHANGE_SECRET`：至少 32 字符随机 secret，知星服务端 -> `auth.wris.me` 的兑换代理密钥。
- `ZHIXING_SYNC_SECRET`：至少 32 字符随机 secret，知星服务端 -> `wris-data`（`api.wris.me`）的数据同步代理密钥。

可用 `openssl rand -base64 32` 生成随机值；不要使用 `VITE_` 前缀。

## 2. wris-auth 侧环境变量同步

迁移域名后，务必在 `auth.wris.me`（`wris-auth`）侧更新回调地址，否则授权码兑换会因 `redirectUri` 不匹配被拒绝：

- `WRIS_BRIDGE_SECRET`：至少 32 字符随机 secret，auth -> Worker 的创建码调用密钥。
- `ZHIXING_EXCHANGE_SECRET`：与知星服务端一致的独立随机 secret（至少 32 字符）。
- `WRIS_BRIDGE_URL=https://api.wris.me/auth/bridge`
- `ZHIXING_REDIRECT_URI=https://zhistar.aux.wris.me/api/auth/callback`

完成后重载/重启 `wris-auth` 使其生效。

## 3. wris-data Cloudflare Worker（如未初始化）

- 设置独立随机 `AUTH_BRIDGE_SECRET`（不能和 `wris-auth` / 知星的值复用）。
- 在 Image2Story 的 `worker/` 目录执行 `npx wrangler d1 execute wris-data --file=schema.sql --remote`，创建 `auth_bridge_codes` 表。
- 部署 Worker，并确认自定义域 `api.wris.me` 在线。

授权码只存 SHA-256 摘要、有效 60 秒，绑定固定 client、callback 与 state；兑换时用 D1 条件更新原子标记已消费，重复兑换失败。

## 4. 香港服务器启动与参数

```bash
npm ci
npm run build
node server.mjs --host 127.0.0.1 --port 3000
```

支持的参数与环境变量：

- `--port <port>` / `PORT`：监听端口（默认 `3000`）
- `--host <host>` / `HOST`：绑定地址（默认 `0.0.0.0`，反代模式推荐 `127.0.0.1`）
- `--dist <dir>` / `ZHIXING_DIST_DIR`：静态产物目录（默认 `./dist`）
- `--env <file>`：指定环境变量文件（默认 `./.env`）

健康检查端点：`GET /healthz` 返回 `200 {"ok":true,"service":"zhixing",...}`。

## 5. 生产域与安全边界

- 访问域与回调固定为 `https://zhistar.aux.wris.me` 与 `https://zhistar.aux.wris.me/api/auth/callback`。
- 知星 Cookie 为 `__Host-zx_session` 与 `__Host-zx_auth_tx`，带有 `HttpOnly; Secure; SameSite=Lax`、host-only 属性，**必须通过 HTTPS 访问**（由 Nginx / Caddy 终结 TLS 并反代到 `http://127.0.0.1:3000`）。
- 长期 wris JWT 不会返回浏览器；登录只显示身份，不表示学习进度已同步。
