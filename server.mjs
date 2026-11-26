import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompress, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import loginHandler from './api/auth/login.js';
import callbackHandler from './api/auth/callback.js';
import meHandler from './api/auth/me.js';
import logoutHandler from './api/auth/logout.js';
import syncHandler from './api/sync.js';
import { getAppOrigin, getAuthOrigin, getBridgeUrl, getRedirectUri, json } from './api/auth/shared.js';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIST_DIR = path.join(ROOT_DIR, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.map']);
const NO_CACHE_FILES = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);

const API_ROUTES = {
  '/api/auth/login': loginHandler,
  '/api/auth/callback': callbackHandler,
  '/api/auth/me': meHandler,
  '/api/auth/logout': logoutHandler,
  '/api/sync': syncHandler,
};

/**
 * Load key=value pairs from a .env file into process.env without overriding
 * variables already provided by the shell or process manager.
 */
export function loadEnvFile(envPath = path.join(ROOT_DIR, '.env')) {
  if (!existsSync(envPath)) return false;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = normalized.indexOf('=');
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    let value = normalized.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
  return true;
}

/**
 * Parse CLI arguments for host, port, dist directory, env file, and help.
 */
export function parseCliArgs(argv = process.argv.slice(2)) {
  const opts = {
    host: undefined,
    port: undefined,
    distDir: undefined,
    envFile: undefined,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--host' && argv[i + 1]) {
      opts.host = argv[++i];
    } else if (arg.startsWith('--host=')) {
      opts.host = arg.slice(7);
    } else if ((arg === '-p' || arg === '--port') && argv[i + 1]) {
      opts.port = Number(argv[++i]);
    } else if (arg.startsWith('--port=')) {
      opts.port = Number(arg.slice(7));
    } else if (arg === '--dist' && argv[i + 1]) {
      opts.distDir = path.resolve(argv[++i]);
    } else if (arg.startsWith('--dist=')) {
      opts.distDir = path.resolve(arg.slice(7));
    } else if (arg === '--env' && argv[i + 1]) {
      opts.envFile = path.resolve(argv[++i]);
    } else if (arg.startsWith('--env=')) {
      opts.envFile = path.resolve(arg.slice(6));
    }
  }
  return opts;
}

function getCacheControl(relPath) {
  const base = path.basename(relPath);
  if (NO_CACHE_FILES.has(base)) return 'no-cache';
  if (relPath.startsWith('assets/') || relPath.startsWith(`assets${path.sep}`)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

async function sendStaticFile(req, res, distDir, filePath, relPath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const raw = await readFile(filePath);

  setSecurityHeaders(res);
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', getCacheControl(relPath));

  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', raw.length);
    res.statusCode = 200;
    res.end();
    return;
  }

  let body = raw;
  if (raw.length >= 1024 && COMPRESSIBLE_EXTS.has(ext)) {
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    res.setHeader('Vary', 'Accept-Encoding');
    if (/\bbr\b/.test(acceptEncoding)) {
      body = await brotliAsync(raw);
      res.setHeader('Content-Encoding', 'br');
    } else if (/\bgzip\b/.test(acceptEncoding)) {
      body = await gzipAsync(raw);
      res.setHeader('Content-Encoding', 'gzip');
    }
  }

  res.setHeader('Content-Length', body.length);
  res.statusCode = 200;
  res.end(body);
}

function resolveStaticTarget(distDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { error: 400 };
  }
  if (decoded.includes('\0')) return { error: 400 };
  if (decoded.split(/[\\/]/).includes('..')) return { error: 403 };
  const normalizedPosix = path.posix.normalize(decoded);
  const rel = normalizedPosix === '/' ? 'index.html' : normalizedPosix.replace(/^\/+/, '');
  const resolved = path.resolve(distDir, rel);
  const rootPrefix = distDir.endsWith(path.sep) ? distDir : distDir + path.sep;
  if (resolved !== distDir && !resolved.startsWith(rootPrefix)) {
    return { error: 403 };
  }

  if (existsSync(resolved)) {
    const stat = statSync(resolved);
    if (stat.isFile()) return { filePath: resolved, relPath: rel };
    if (stat.isDirectory()) {
      const indexFile = path.join(resolved, 'index.html');
      if (existsSync(indexFile) && statSync(indexFile).isFile()) {
        return { filePath: indexFile, relPath: path.posix.join(rel, 'index.html') };
      }
    }
  }

  // SPA fallback only for extensionless HTML navigation (not missing assets/files)
  if (!path.posix.extname(rel) && !rel.startsWith('assets/')) {
    const fallback = path.join(distDir, 'index.html');
    if (existsSync(fallback) && statSync(fallback).isFile()) {
      return { filePath: fallback, relPath: 'index.html' };
    }
  }
  return { error: 404 };
}

/**
 * Create an HTTP server serving built static files from distDir and /api/auth/* routes.
 */
export function createZhixingServer({ distDir = DEFAULT_DIST_DIR } = {}) {
  const resolvedDist = path.resolve(distDir);

  return http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const { pathname } = parsedUrl;

      if (pathname === '/healthz') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          return json(res, 405, { error: 'method_not_allowed' });
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        if (req.method === 'HEAD') return res.end();
        return res.end(JSON.stringify({ ok: true, service: 'zhixing', origin: getAppOrigin() }));
      }

      const apiHandler = API_ROUTES[pathname];
      if (apiHandler) {
        await apiHandler(req, res);
        return;
      }

      if (pathname.startsWith('/api/')) {
        return json(res, 404, { error: 'not_found' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Method Not Allowed');
        return;
      }

      const target = resolveStaticTarget(resolvedDist, pathname);
      if (target.error) {
        res.statusCode = target.error;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(target.error === 400 ? 'Bad Request' : target.error === 403 ? 'Forbidden' : 'Not Found');
        return;
      }

      await sendStaticFile(req, res, resolvedDist, target.filePath, target.relPath);
    } catch (err) {
      console.error('[zhixing] Request error:', err);
      if (!res.headersSent) {
        json(res, 500, { error: 'internal_error' });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  }
}

if (isMainModule()) {
  const cli = parseCliArgs();
  if (cli.help) {
    console.log([
      '知星生产服务器 (Node.js)',
      '',
      '用法: node server.mjs [选项]',
      '',
      '选项:',
      '  -p, --port <port>   监听端口（默认: process.env.PORT || 3000）',
      '      --host <host>   绑定地址（默认: process.env.HOST || 0.0.0.0）',
      '      --dist <dir>    静态构建目录（默认: ./dist）',
      '      --env <file>    指定 .env 文件路径（默认: ./.env）',
      '  -h, --help          显示帮助',
    ].join('\n'));
    process.exit(0);
  }

  const loadedEnv = loadEnvFile(cli.envFile);
  const port = Number.isFinite(cli.port) ? cli.port : Number(process.env.PORT || 3000);
  const host = cli.host || process.env.HOST || '0.0.0.0';
  const distDir = cli.distDir || (process.env.ZHIXING_DIST_DIR ? path.resolve(process.env.ZHIXING_DIST_DIR) : DEFAULT_DIST_DIR);

  if (!existsSync(path.join(distDir, 'index.html'))) {
    console.error(`[zhixing] 错误: 未找到 ${path.join(distDir, 'index.html')}，请先运行 npm run build。`);
    process.exit(1);
  }

  const hasSessionSecret = (process.env.ZHIXING_SESSION_SECRET || '').length >= 32;
  const hasExchangeSecret = (process.env.ZHIXING_EXCHANGE_SECRET || '').length >= 32;

  const server = createZhixingServer({ distDir });
  server.listen(port, host, () => {
    console.log(`[zhixing] Server listening on http://${host}:${port}`);
    console.log(`[zhixing] Origin: ${getAppOrigin()} | Auth: ${getAuthOrigin()} | Bridge: ${getBridgeUrl()}`);
    console.log(`[zhixing] Callback: ${getRedirectUri()} | .env: ${loadedEnv ? 'loaded' : 'not found (using process.env)'}`);
    if (!hasSessionSecret || !hasExchangeSecret) {
      console.warn('[zhixing] WARNING: ZHIXING_SESSION_SECRET 或 ZHIXING_EXCHANGE_SECRET 未配置（需 >= 32 字符），登录功能将返回错误。');
    }
  });

  const shutdown = (signal) => {
    console.log(`[zhixing] Received ${signal}, shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
