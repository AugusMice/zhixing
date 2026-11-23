// 用 Chrome DevTools Protocol 给本地开发服务器截图（无第三方依赖）。
// 用法：node scripts/shoot.mjs <url> <out.png> [width] [height] [waitMs]
import { writeFile, readFile } from 'node:fs/promises';

const [, , url, out, widthArg, heightArg, waitArg] = process.argv;
if (!url || !out) {
  console.error('usage: node scripts/shoot.mjs <url> <out.png> [width] [height] [waitMs]');
  process.exit(1);
}
const width = Number(widthArg) || 390;
const height = Number(heightArg) || 880;
const waitMs = Number(waitArg) || 1600;
let rawActions = process.argv[7];
if (rawActions?.startsWith('@')) {
  rawActions = await readFile(rawActions.slice(1), 'utf8');
}
const parsed = rawActions ? JSON.parse(rawActions) : [];
const actions = Array.isArray(parsed) ? parsed : [parsed];

const CDP_PORT = process.env.CDP_PORT || '9222';
const pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = pages.find((p) => p.type === 'page');
if (!page) throw new Error('没有可用的页面目标');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const errors = [];

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject, method } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    errors.push(d.exception?.description || d.text);
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push(msg.params.entry.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} 超时`));
      }
    }, 15000);
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: true,
});
// 先清空再导航，避免同源 hash/query 变化被浏览器当成软导航，拿到上一页状态
await send('Page.navigate', { url: 'about:blank' });
await new Promise((r) => setTimeout(r, 120));
await send('Page.navigate', { url });

// 等页面稳定：splash 消失，或超时
const started = Date.now();
let text = '';
while (Date.now() - started < 8000) {
  await new Promise((r) => setTimeout(r, 250));
  const res = await send('Runtime.evaluate', {
    expression: `(() => { const s = document.querySelector('.splash'); const root = document.querySelector('#root'); return { splash: !!s, text: (root?.innerText || '').slice(0, 4000) }; })()`,
    returnByValue: true,
  });
  text = res.result.value?.text ?? '';
  if (!res.result.value?.splash && text) break;
}
await new Promise((r) => setTimeout(r, waitMs));

const actionResults = [];
for (const expression of actions) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  actionResults.push(res.result?.value ?? res.result?.description ?? null);
  await new Promise((r) => setTimeout(r, 700));
}

const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile(out, Buffer.from(shot.data, 'base64'));

console.log(JSON.stringify({ url, out, text: text.slice(0, 1200), actionResults, errors }, null, 2));
ws.close();
