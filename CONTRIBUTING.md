# 一起开发「知星」

这份文档写给第一次参与这个项目的人：怎么跑起来、代码怎么分工、加内容要注意什么、提 PR 之前自检哪些东西。

---

## 1. 环境

| 需要 | 版本 | 备注 |
| --- | --- | --- |
| Node.js | 20 以上（开发用 24） | https://nodejs.org |
| npm | 跟随 Node | 用 `npm ci` 更稳 |
| Git | 任意较新版本 | Windows 可用 PortableGit |
| 编辑器 | VS Code 推荐 | 装 ESLint 之外不必额外插件 |

```bash
git clone <仓库地址> zhixing
cd zhixing
npm ci          # 没有 lock 文件时用 npm install
npm run dev     # http://localhost:5173
```

手机同网段访问：`npm run dev` 已监听 `0.0.0.0`，用电脑的局域网 IP 打开即可（Windows 上双击 `start-zhixing.cmd` 会自动打印地址）。

---

## 2. 这个项目的三条硬约束

1. **纯前端**。没有后端、没有数据库服务。所有内容以 JSON 形式放在 `content/`，构建时打进包里；用户进度存浏览器 IndexedDB。任何需要服务器才能实现的功能，先讨论再动手。
2. **内容即数据**。加题、加诗文、加真题都是往 `content/` 里写 JSON，不需要改代码。改代码只负责「怎么呈现、怎么排程」。
3. **游戏层只读**。`src/game/` 下的东西可以读学习数据，但不能写回，也不能让学习流程依赖游戏。这条是为了保证「就算游戏不好玩，学习系统也不受影响」。

---

## 3. 目录分工

```
content/            内容，全部是数据
  subjects.json       科目
  knowledge/*.json    六科知识点（335 个）
  questions/*.json    题库（含 gen-*.json 自编题、chn-text-*.json 抽句题）
  texts/*.json        古诗文 77 篇
  papers/*/           真题卷（paper.json + qNN.json + 图片）

src/                代码
  views/              页面（路由级）
  components/         通用组件
  engine/             学习引擎：SRS、掌握度、排程、会话、存档
  lib/                纯函数工具：格式化、答案判定、Markdown、布局
  papers/             真题相关的适配、判分、写入学习数据
  game/               游戏层（只读）
  content/            内容加载与校验
  state/              全局状态（AppState）

scripts/            校验与工具脚本
docs/               设计文档（格式说明、进度日志、战斗设计等）
```

---

## 4. 加内容：先读格式，再跑校验

所有格式说明在 [`docs/content-format.md`](docs/content-format.md)。写完**必须**跑校验：

```bash
npm run check:content   # 题目 + 古诗文 + 质量体检
npm run check:kp        # 知识点覆盖率（每个知识点至少要有题）
```

单个命令也可以单独跑：`check:texts`、`check:quality`、`check:content`（原始 schema）。

### 三个内容红线

1. **不许编造真题出处**。`source` 写「自编练习」就写自编练习，不要挂上「2023 全国甲卷」这种没有依据的标签。真题卷必须来自真实卷面。
2. **AI 生成的内容必须人工过一遍**。尤其理科的计算结果、文科的史实与引文。校验脚本只能查结构，查不了「这个答案对不对」。
3. **古诗文原文以教材为准**。默写题的第一条答案必须能在正文里逐字找到（校验器会查），异文只能放在后面的备选里。
4. **真题卷不进仓库**。`content/papers/` 与 `public/papers/` 已写进 `.gitignore`：扫描图十几兆、还有版权问题。把自己的卷子放在本地这两个目录里就能练，但提交时只提交代码和题目 JSON，不要用 `git add -f` 强行加图片。

### 加题的最小流程

1. 在对应科目的 `content/questions/gen-<科目>-<序号>.json` 里追加题目对象（id 规则 `q-<知识点id>-<序号>`）；
2. 每题的 `kpIds` 必须是 `content/knowledge/<科目>.json` 里真实存在的知识点；
3. 跑 `npm run check:content` 与 `npm run check:kp`；
4. 页面里点一遍这道题，确认公式渲染、答案判定正常。

---

## 5. 代码约定

- **TypeScript strict**，不要用 `any` 绕过类型；确实需要时写明原因。
- **CSS 用命名空间前缀**：页面级 `.xx-`（如 `.text-`、`.kmap-`、`.bt-`、`.imp-`），避免样式互相污染。新页面优先新建 `styles-xxx.css` 并在 `main.tsx` 引入。
- **不要引入后端依赖**，也不要引入体积大的 UI 框架（当前主包已经不小，先看 `npm run build` 的体积再决定）。
- **引擎层写纯函数**：`src/engine/` 里的函数尽量接受数据、返回新数据，不直接碰 DOM 或 storage，方便测试和复用。
- 中文注释可以写，但注释要解释「为什么」，不要复述代码。

### 已知的坑

- **别用 PowerShell 的 `Set-Content` / `-replace | Set-Content` 改写含中文的文件**，它会把 UTF-8 当 GBK 二次编码成乱码。用编辑器保存，或先写 `.py` 脚本再用 Python 处理（脚本里显式 `encoding='utf-8'`）。
- Windows 上 `npm run build` 偶尔报 `Access is denied`（esbuild 清理临时目录失败），把 `TMP`/`TEMP` 指到项目内的 `.tmp-esbuild` 再跑即可。
- 改了 `src/content/index.ts` 这类被全局引用的模块后，如果页面报「useApp 必须在 AppProvider 内使用」，重启 dev server 就好（HMR 的边界问题）。

---

## 6. 分支与提交

- `main` 保持可用：任何时候 `npm run check && npm run build` 都应该通过。
- 开发走短分支：`feat/battle-scope`、`content/physics-bank`、`fix/session-resume`。
- 提交信息用前缀，方便生成日志：

```
feat: 战斗出题范围支持三级多选
fix: 刷新答题页重复计分
content: 补齐化学 3/5 板块题库
docs: 补充诗文录入格式
```

- 提 PR 前自检：

```bash
npm run check
npm run check:content
npm run check:kp
npm run build
```

PR 描述里写清楚：改了什么、为什么、怎么验证的（截图或命令输出）。内容类 PR 请附上验证命令的结果。

---

## 7. 现在最需要人帮忙的地方

1. **题库提质**：自编题是 AI 起草 + 人工筛的，仍然可能有个别答案错误、解析太浅。看到就改，改完跑校验。
2. **真题录入**：`/paper-import` 有录入向导，把真题录进 `content/papers/`，并且**务必核对官方答案表**（之前就出现过答案错位）。
3. **知识体系校对**：335 个知识点是按教材/课标整理的骨架，板块归属与前置关系值得逐科过一遍。
4. **手机端体验**：真机上的手感、字号、触控命中，只有真机能验证。
