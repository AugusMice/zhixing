# 游戏层接入

目标：**学习系统可以独立存在，游戏只是它的一个消费者。**

```text
做题 / 复习 / 错题
        ↓
AppData（IndexedDB）
        ↓  只读派生
文明快照 · 掌握度 · 星图
        ↓  订阅事件
游戏层（资源、舰队、外交、战斗）
```

游戏层不允许反向修改 SRS、掌握度和错题本；它只能读取快照、订阅事件，并通过学习系统发起的答题流程获得结果。这样即使游戏以后被砍掉，题库和复习计划仍然完整。

---

## 1. 文明快照

```ts
import { computeCivilization } from '../engine/game';

const civ = computeCivilization(data, content.questions, kpStats);
```

`CivilizationSnapshot` 字段：

| 字段 | 含义 |
| --- | --- |
| `xp` / `level` / `levelInto` / `levelNeed` | 累计经验、文明等级、当前等级进度 |
| `coins` | 由答题累计的星币 |
| `totalAnswered` / `totalCorrect` / `accuracy` | 累计作答与正确率 |
| `litSystems` / `totalSystems` / `exploredRatio` | 掌握度 ≥ 60% 的星球数 / 总数 / 比例 |
| `fleetPower` | 当前按 `xp / 10` 折算的舰队战力 |
| `techTier` | 当前等于文明等级，后续可拆成独立科技树 |

经验与星币规则（`src/engine/game.ts`）：

- 答错：`2 XP`、`1` 星币。
- 答对：`8 + difficulty * 4 + (grade >= 4 ? 4 : 0)` XP；`3 + difficulty * 2` 星币。
- 升级所需经验：`60 + 40 * level`。

这些数值故意做得「慢」：一场 20 题的练习大约只能升 1~2 级。游戏层的资源产出不应该绕过做题。

### 星球 ↔ 知识点

- 一个知识点就是一颗星球：`content.kps`。
- 星球发展等级 = `kpStats.get(kpId).mastery`（0~1）。
- 星图航道 = `kp.parents`。
- 「点亮」阈值是 `mastery >= 0.6`，与首页、星图保持一致。

游戏层可以用同一份 `kpStats` 决定星系里哪些星球可殖民、哪些航道可通行，**不要另建一套进度**。

---

## 2. 事件总线

```ts
import { onGameEvent } from '../engine/game';

useEffect(() => {
  const offAnswer = onGameEvent('answer', (e) => {
    // e: { qid, correct, grade, xp, coins }
    spawnResourcePulse(e.coins);
  });

  const offSession = onGameEvent('session:complete', (e) => {
    // e: { sessionId, mode, answered, correct, accuracy }
    endTurn(e.accuracy);
  });

  return () => {
    offAnswer();
    offSession();
  };
}, []);
```

已实现并会发出的事件：

| 事件 | 触发时机 | 载荷 |
| --- | --- | --- |
| `answer` | 每道题提交后 | `qid, correct, grade, xp, coins` |
| `session:complete` | 一组学习结束时 | `sessionId, mode, answered, correct, accuracy` |

已声明、暂未发出的事件（接入游戏时再补）：`level:up`、`kp:mastered`。

事件通过模块级 `EventTarget` 广播，不依赖 React。订阅函数返回取消订阅的 cleanup，组件卸载时务必调用。

---

## 3. 游戏操作如何绑题

### 现在就能用的方式：先学习，后操作

游戏里的「研究科技」「建造舰队」「外交谈判」暂时都跳转到学习会话，答完再回来结算。最小接入：

```ts
const ok = startSession('kp', {
  label: '研发：曲率引擎',
  kpId: 'phy-circular',
  count: 3,
  reveal: 'immediate',
});
if (!ok) toast('这个知识点还没有题目');
```

`startSession` 会构建队列、写入 `AppData.session` 并跳到 `/session`；学习结束后 `session:complete` 事件带回正确率。游戏层根据正确率决定操作成功度即可。

### 后续方式：题内浮层（尚未实现）

RTS 里每次操作都跳整页会打断节奏。更合适的是在游戏 HUD 上弹一道题，答完立即结算。计划中的接口：

```ts
// 规划中的 API，当前代码里还没有
const result = await askQuestion({
  mode: 'operation',
  question: pickQuestionForOperation(),
  timeLimitSec: 45,
});
// result: { correct, score, grade, elapsedMs }
```

实现时应复用：

- `evaluateAnswer(question, payload)`：判分，不写数据。
- `applyAnswer(data, question, result, ctx)`：纯函数，返回新的 `AppData` 与 grade/xp/coins。
- `recordSessionAnswer` / `advance`：如果要把这次作答并入当天学习记录。
- 最后仍通过 `update()` 持久化，不能绕过 store 直接改 IndexedDB。

在此之前，游戏层不要自己判题、自己加经验，否则掌握度和文明快照会对不上。

---

## 4. 科目加成（高考模式）

`SessionConfig.subjectIds?: string[]` 已经预留，用于「多科混合组卷」。游戏层的计划：

- 玩家文明有「数理」「政文」等倾向；做对应科目的题，操作获得加成。
- 例如：数学/物理题 → 科技研发加速；语文/政治题 → 外交与治理加成。
- 加成只影响**游戏内结算**，不影响题目本身的判分和 SRS。

不要在 `engine/` 里写「数学题一定加科技」；这属于游戏规则，应该放在未来的游戏模块里，通过读取 `question.subjectId` 自行映射。

---

## 5. 边界与约束

必须遵守：

1. **学习层不 import 游戏层。** 目前 `srs.ts`、`mastery.ts`、`planner.ts`、`store.ts` 都不依赖 `game.ts`。
2. **游戏层不直接写 `AppData`。** 需要记录时走 `update()` / `store.ts` 的函数。
3. **不另建进度。** 星球等级、资源、战力都从 `AppData` + `kpStats` 派生，避免两套真相。
4. **答题必须经过同一套判分。** 游戏里的题和题库里的题共享 `evaluateAnswer`，否则错题本和掌握度会失真。
5. **事件只用来通知，不用来传状态。** 订阅方需要完整状态时，重新读 `AppData` 或快照，不要依赖事件载荷里的局部字段。

可以随时删除游戏层：删掉 `src/engine/game.ts`、文明档案卡片和事件订阅，学习系统仍然能构建、做题、复习。

---

## 6. 接入顺序建议

1. 先做**星图回合制骨架**：一回合 = 一次学习会话；用 `session:complete` 推进回合。
2. 用 `CivilizationSnapshot` 显示资源、等级、舰队，不做战斗。
3. 再做一个「关键操作绑题」的浮层，验证节奏是否可接受。
4. 最后才做实时战斗、外交、星际兽群。不要在题库还没铺满时先做 3D。
