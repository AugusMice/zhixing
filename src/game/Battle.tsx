import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppState';
import { navigate } from '../lib/router';
import { AnswerInput } from '../components/AnswerInput';
import { Markdown } from '../components/Markdown';
import { Icon } from '../components/Icon';
import { EmptyState, Meter, Ring, Sheet, StatTile } from '../components/ui';
import {
  correctAnswerMarkdown,
  evaluateAnswer,
  isAnswerComplete,
  typeLabel,
  type AnswerPayload,
} from '../lib/answers';
import { formatClock, formatDuration, pct } from '../lib/format';
import {
  CARDS_PER_ROUND,
  COMBO_CAP,
  DIFFICULTIES,
  DIFFICULTY_MAP,
  MAX_ROUNDS,
  buildScopedDeck,
  comboMultiplier,
  customDifficulty,
  drawRound,
  emptyPayloadFor,
  enemyHpFor,
  isBattleQuestion,
  rateBattle,
  ratingInfo,
  resolveRound,
  type BattleCard,
  type BattleDifficulty,
  type BattleDifficultyId,
  type EnemyShip,
  type PlayerShip,
  type Rating,
  type RoundResolution,
} from './battleEngine';
import { ScopePicker } from './ScopePicker';
import './battle.css';

/* ------------------------------ 场景常量 ------------------------------ */

const STARS = Array.from({ length: 28 }, (_, index) => ({
  left: (index * 37 + 13) % 100,
  top: (index * 53 + 9) % 100,
  size: 1 + (index % 3),
  delay: (index % 7) * 0.45,
  opacity: 0.2 + (index % 5) * 0.15,
}));

interface Runtime {
  /** 本局范围的可读标签，如「数学」「数学 · 8 个知识点」「3 个科目 · 12 个知识点」 */
  scopeName: string;
  /** 本局选中的知识点数量，0 表示全题库 */
  scopeCount: number;
  difficulty: BattleDifficulty;
  deck: BattleCard[];
  cursor: number;
  cards: BattleCard[];
  round: number;
  combo: number;
  maxCombo: number;
  correct: number;
  total: number;
  damageDealt: number;
  damageTaken: number;
  player: PlayerShip;
  enemy: EnemyShip;
  startedAt: number;
  recycled: boolean;
  crossSubject: boolean;
}

interface Floater {
  id: number;
  side: 'enemy' | 'player';
  text: string;
  tone: 'hit' | 'crit' | 'weak' | 'heal';
}

interface Summary {
  kind: 'victory' | 'defeat' | 'retreat';
  rating: Rating;
  rounds: number;
  correct: number;
  total: number;
  maxCombo: number;
  damageDealt: number;
  damageTaken: number;
  hullLeft: number;
  enemyHpLeft: number;
  durationMs: number;
  subjectName: string;
  difficultyLabel: string;
  crossSubject: boolean;
}

type Phase = 'setup' | 'battle' | 'result';
type MissReason = 'wrong' | 'timeout' | 'skip';

/* ------------------------------ SVG 舰船 ------------------------------ */

function PlayerShipArt() {
  return (
    <svg viewBox="0 0 120 84" className="bt-ship-svg bt-ship-svg--player" aria-hidden="true">
      <defs>
        <linearGradient id="bt-player-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dbe8ff" />
          <stop offset="45%" stopColor="#7aa2ff" />
          <stop offset="100%" stopColor="#2b3f86" />
        </linearGradient>
        <linearGradient id="bt-player-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5ee0c0" />
          <stop offset="100%" stopColor="#1f6f7a" />
        </linearGradient>
      </defs>
      <path d="M60 4 L88 70 L60 57 L32 70 Z" fill="rgba(122,162,255,.18)" />
      <path d="M60 4 L88 70 L60 57 L32 70 Z" fill="url(#bt-player-hull)" stroke="#cfe0ff" strokeWidth="1.1" />
      <path d="M32 70 L14 79 L41 48 Z" fill="url(#bt-player-wing)" opacity="0.9" />
      <path d="M88 70 L106 79 L79 48 Z" fill="url(#bt-player-wing)" opacity="0.9" />
      <path d="M60 25 L69 53 L60 47 L51 53 Z" fill="#0b1224" opacity="0.82" />
      <circle cx="60" cy="40" r="4.5" fill="#eaf4ff" />
      <circle cx="60" cy="40" r="9" fill="none" stroke="#9fd8ff" strokeWidth="1" opacity="0.7" />
      <path className="bt-thruster" d="M54 64 L60 81 L66 64 L60 69 Z" fill="#7ad8ff" />
    </svg>
  );
}

function EnemyShipArt() {
  return (
    <svg viewBox="0 0 120 84" className="bt-ship-svg bt-ship-svg--enemy" aria-hidden="true">
      <defs>
        <linearGradient id="bt-enemy-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb3c0" />
          <stop offset="45%" stopColor="#ff5c7a" />
          <stop offset="100%" stopColor="#5a1430" />
        </linearGradient>
        <linearGradient id="bt-enemy-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd479" />
          <stop offset="100%" stopColor="#b34a2a" />
        </linearGradient>
      </defs>
      <path d="M60 80 L88 12 L60 25 L32 12 Z" fill="rgba(255,92,122,.2)" />
      <path d="M60 80 L88 12 L60 25 L32 12 Z" fill="url(#bt-enemy-hull)" stroke="#ffd0d8" strokeWidth="1.1" />
      <path d="M32 12 L10 4 L39 38 Z" fill="url(#bt-enemy-wing)" opacity="0.9" />
      <path d="M88 12 L110 4 L81 38 Z" fill="url(#bt-enemy-wing)" opacity="0.9" />
      <path d="M60 58 L69 32 L60 38 L51 32 Z" fill="#180812" opacity="0.85" />
      <circle cx="60" cy="47" r="5" fill="#ff9fb0" />
      <circle cx="60" cy="47" r="10" fill="none" stroke="#ff7d8c" strokeWidth="1" opacity="0.6" />
      <path className="bt-thruster bt-thruster--enemy" d="M54 20 L60 4 L66 20 L60 16 Z" fill="#ffc46b" />
    </svg>
  );
}

/* ------------------------------ 主组件 ------------------------------ */

export function BattleView() {
  const { content, questions, kpStats, toast } = useApp();

  const [phase, setPhase] = useState<Phase>('setup');
  /** 选中的知识点；空集合表示「全部题库」 */
  const [pickedKps, setPickedKps] = useState<Set<string>>(() => new Set());
  const [scopeOpen, setScopeOpen] = useState(false);
  const [difficultyId, setDifficultyId] = useState<BattleDifficultyId>('standard');
  const [customSeconds, setCustomSeconds] = useState(45);
  const [customHp, setCustomHp] = useState(145);
  const [rulesOpen, setRulesOpen] = useState(false);

  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastConfig, setLastConfig] = useState<{
    kpIds: string[];
    difficultyId: BattleDifficultyId;
    customSeconds: number;
    customHp: number;
  } | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [payload, setPayload] = useState<AnswerPayload | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<RoundResolution | null>(null);
  const [missReason, setMissReason] = useState<MissReason>('wrong');
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [shake, setShake] = useState<'enemy' | 'player' | null>(null);
  const [ticker, setTicker] = useState('');

  const submittedRef = useRef(false);
  const submitRef = useRef<(timedOut: boolean) => void>(() => {});
  const floaterId = useRef(0);
  const floaterTimers = useRef<number[]>([]);

  /* ------------------------------ 题库统计 ------------------------------ */

  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of questions) {
      if (!isBattleQuestion(question)) continue;
      counts.set(question.subjectId, (counts.get(question.subjectId) ?? 0) + 1);
    }
    return counts;
  }, [questions]);

  const countByKp = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of questions) {
      if (!isBattleQuestion(question)) continue;
      for (const kpId of question.kpIds) counts.set(kpId, (counts.get(kpId) ?? 0) + 1);
    }
    return counts;
  }, [questions]);

  const totalTextQuestions = useMemo(() => {
    let total = 0;
    for (const count of subjectCounts.values()) total += count;
    return total;
  }, [subjectCounts]);

  /** 当前选择下的可出题数与掌握度均值 */
  const scopeQuestions = useMemo(() => {
    if (pickedKps.size === 0) return totalTextQuestions;
    let total = 0;
    for (const kpId of pickedKps) total += countByKp.get(kpId) ?? 0;
    return total;
  }, [pickedKps, countByKp, totalTextQuestions]);

  const previewAverage = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const kp of content.kps) {
      if (pickedKps.size > 0 && !pickedKps.has(kp.id)) continue;
      const mastery = kpStats.get(kp.id)?.mastery;
      if (mastery == null) continue;
      sum += mastery;
      count += 1;
    }
    return count === 0 ? null : sum / count;
  }, [pickedKps, content.kps, kpStats]);

  const weakList = useMemo(() => {
    return content.kps
      .filter((kp) => pickedKps.size === 0 || pickedKps.has(kp.id))
      .map((kp) => ({ kp, mastery: kpStats.get(kp.id)?.mastery ?? null }))
      .filter((item) => item.mastery != null)
      .sort((a, b) => (a.mastery ?? 1) - (b.mastery ?? 1))
      .slice(0, 3);
  }, [pickedKps, content.kps, kpStats]);

  /* ------------------------------ 特效 ------------------------------ */

  const addFloater = (side: Floater['side'], text: string, tone: Floater['tone']) => {
    floaterId.current += 1;
    const id = floaterId.current;
    setFloaters((prev) => [...prev, { id, side, text, tone }]);
    const timer = window.setTimeout(() => {
      setFloaters((prev) => prev.filter((item) => item.id !== id));
    }, 1150);
    floaterTimers.current.push(timer);
  };

  useEffect(
    () => () => {
      for (const timer of floaterTimers.current) window.clearTimeout(timer);
    },
    [],
  );

  useEffect(() => {
    if (shake == null) return;
    const timer = window.setTimeout(() => setShake(null), 430);
    return () => window.clearTimeout(timer);
  }, [shake]);

  /* ------------------------------ 提交作答 ------------------------------ */

  const submit = (timedOut: boolean, forceWrong = false) => {
    if (!runtime || selected == null || revealed || submittedRef.current) return;
    submittedRef.current = true;

    const card = runtime.cards[selected];
    const answer = payload ?? emptyPayloadFor(card.question);
    const judged = evaluateAnswer(card.question, answer);
    const correct = !timedOut && !forceWrong && judged.correct;
    const reason: MissReason = timedOut ? 'timeout' : forceWrong ? 'skip' : 'wrong';

    const result = resolveRound({
      correct,
      combo: runtime.combo,
      maxCombo: runtime.maxCombo,
      baseDamage: card.baseDamage,
      enemyShield: runtime.enemy.shield,
      enemyHp: runtime.enemy.hp,
      playerShield: runtime.player.shield,
      playerHull: runtime.player.hull,
      difficulty: runtime.difficulty,
    });

    setOutcome(result);
    setRevealed(true);
    setMissReason(reason);
    setDeadline(null);
    setRuntime((prev) =>
      prev == null
        ? prev
        : {
            ...prev,
            player: { ...prev.player, hull: result.playerHull, shield: result.playerShield },
            enemy: { ...prev.enemy, hp: result.enemyHp, shield: result.enemyShield },
            combo: result.combo,
            maxCombo: result.maxCombo,
            correct: prev.correct + (correct ? 1 : 0),
            total: prev.total + 1,
            damageDealt: prev.damageDealt + result.damage,
            damageTaken: prev.damageTaken + result.enemyAttack,
          },
    );

    setShake('enemy');
    if (result.enemyAttack > 0) {
      window.setTimeout(() => setShake('player'), 260);
    }

    addFloater(
      'enemy',
      `-${result.damage}`,
      result.correct ? (result.multiplier >= 1.5 ? 'crit' : 'hit') : 'weak',
    );
    if (result.enemyAttack > 0) {
      addFloater('player', `-${result.enemyAttack}`, 'hit');
    }

    if (correct) {
      setTicker(
        `命中 · ${card.baseDamage} × ${result.multiplier.toFixed(2)} = ${result.damage} 伤害${
          result.enemyDied ? ' · 敌舰击穿' : ''
        }`,
      );
    } else {
      setTicker(
        `${reason === 'timeout' ? '超时' : reason === 'skip' ? '跳过' : '偏斜'} · 仅造成 ${
          result.damage
        } 伤害${result.enemyAttack > 0 ? ` · 敌舰反击 ${result.enemyAttack}` : ''}`,
      );
    }
  };

  useEffect(() => {
    submitRef.current = submit;
  });

  /* ------------------------------ 计时器 ------------------------------ */

  useEffect(() => {
    if (deadline == null || revealed) return;
    const tick = () => {
      const left = deadline - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) submitRef.current(true);
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [deadline, revealed]);

  useEffect(() => {
    if (selected == null) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected]);

  /* ------------------------------ 回合流转 ------------------------------ */

  const openCard = (index: number) => {
    if (!runtime || selected != null) return;
    const card = runtime.cards[index];
    if (!card) return;
    submittedRef.current = false;
    setSelected(index);
    setPayload(emptyPayloadFor(card.question));
    setRevealed(false);
    setOutcome(null);
    setMissReason('wrong');
    setDeadline(Date.now() + runtime.difficulty.seconds * 1000);
    setRemaining(runtime.difficulty.seconds * 1000);
  };

  const finish = (kind: Summary['kind']) => {
    if (!runtime) return;
    const rating = rateBattle({
      won: kind === 'victory',
      correct: runtime.correct,
      total: runtime.total,
      maxCombo: runtime.maxCombo,
      rounds: runtime.round,
    });
    setSummary({
      kind,
      rating,
      rounds: runtime.round,
      correct: runtime.correct,
      total: runtime.total,
      maxCombo: runtime.maxCombo,
      damageDealt: runtime.damageDealt,
      damageTaken: runtime.damageTaken,
      hullLeft: runtime.player.hull,
      enemyHpLeft: runtime.enemy.hp,
      durationMs: Date.now() - runtime.startedAt,
      subjectName: runtime.scopeName,
      difficultyLabel: runtime.difficulty.label,
      crossSubject: runtime.crossSubject,
    });
    setPhase('result');
    setSelected(null);
    setDeadline(null);
    setRemaining(0);
    setTicker('');
  };

  const nextRound = () => {
    if (!runtime || selected == null) return;
    if (runtime.enemy.hp <= 0) {
      finish('victory');
      return;
    }
    if (runtime.player.hull <= 0) {
      finish('defeat');
      return;
    }
    if (runtime.round >= MAX_ROUNDS) {
      finish('retreat');
      return;
    }

    const draw = drawRound(runtime.deck, runtime.cursor, CARDS_PER_ROUND);
    const regenerated = Math.min(
      runtime.player.maxShield,
      runtime.player.shield + runtime.difficulty.shieldRegen,
    );
    const gained = regenerated - runtime.player.shield;

    setRuntime({
      ...runtime,
      round: runtime.round + 1,
      cards: draw.cards,
      cursor: draw.cursor,
      recycled: runtime.recycled || draw.recycled,
      player: { ...runtime.player, shield: regenerated },
    });
    setSelected(null);
    setPayload(null);
    setRevealed(false);
    setOutcome(null);
    setMissReason('wrong');
    setDeadline(null);
    setRemaining(0);
    submittedRef.current = false;
    setTicker(
      gained > 0
        ? `护盾回充 +${gained} · 第 ${runtime.round + 1} 回合`
        : `第 ${runtime.round + 1} 回合`,
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ------------------------------ 开局 ------------------------------ */

  const resolveDifficulty = (diffId: BattleDifficultyId): BattleDifficulty =>
    diffId === 'custom'
      ? customDifficulty({ seconds: customSeconds, enemyHp: customHp })
      : DIFFICULTY_MAP[diffId];

  /** 选择范围的可读标签 */
  const scopeLabel = (kpIds: Set<string>): string => {
    if (kpIds.size === 0) return '全部题库';
    const bySubject = new Map<string, number>();
    for (const kpId of kpIds) {
      const kp = content.kpsById.get(kpId);
      if (!kp) continue;
      bySubject.set(kp.subjectId, (bySubject.get(kp.subjectId) ?? 0) + 1);
    }
    if (bySubject.size === 1) {
      const [sid, n] = [...bySubject.entries()][0];
      const total = (content.kpsBySubject.get(sid) ?? []).length;
      const name = content.subjectsById.get(sid)?.name ?? '综合';
      return n === total ? name : `${name} · ${n} 个知识点`;
    }
    return `${bySubject.size} 个科目 · ${kpIds.size} 个知识点`;
  };

  const launch = (kpIds: Set<string>, diffId: BattleDifficultyId) => {
    const difficulty = resolveDifficulty(diffId);
    const deck = buildScopedDeck({
      questions,
      kpIds: kpIds.size > 0 ? kpIds : null,
      kpStats,
    });
    if (deck.cards.length === 0) {
      toast('这个范围里暂时没有可出战的文本题');
      return;
    }
    let sum = 0;
    let count = 0;
    for (const card of deck.cards) {
      if (card.mastery == null) continue;
      sum += card.mastery;
      count += 1;
    }
    const average = count === 0 ? null : sum / count;
    const enemyHp = enemyHpFor(difficulty, average);
    const draw = drawRound(deck.cards, 0, CARDS_PER_ROUND);

    setRuntime({
      scopeName: scopeLabel(kpIds),
      scopeCount: kpIds.size,
      difficulty,
      deck: deck.cards,
      cursor: draw.cursor,
      cards: draw.cards,
      round: 1,
      combo: 0,
      maxCombo: 0,
      correct: 0,
      total: 0,
      damageDealt: 0,
      damageTaken: 0,
      player: {
        hull: difficulty.playerHull,
        maxHull: difficulty.playerHull,
        shield: difficulty.playerShield,
        maxShield: difficulty.playerShield,
      },
      enemy: {
        hp: enemyHp,
        maxHp: enemyHp,
        shield: difficulty.enemyShield,
        maxShield: difficulty.enemyShield,
      },
      startedAt: Date.now(),
      recycled: false,
      crossSubject: false,
    });
    setLastConfig({
      kpIds: [...kpIds],
      difficultyId: diffId,
      customSeconds,
      customHp,
    });
    setSummary(null);
    setSelected(null);
    setPayload(null);
    setRevealed(false);
    setOutcome(null);
    setDeadline(null);
    setRemaining(0);
    submittedRef.current = false;
    setTicker(`遭遇 ${difficulty.enemyName} · 选择一张指令卡`);
    setPhase('battle');
    window.scrollTo({ top: 0 });
  };

  const startBattle = () => {
    if (scopeQuestions === 0) {
      toast('这个范围里没有可出战的题，换个范围试试');
      return;
    }
    launch(pickedKps, difficultyId);
  };

  const rematch = () => {
    if (!lastConfig) {
      setPhase('setup');
      return;
    }
    setCustomSeconds(lastConfig.customSeconds);
    setCustomHp(lastConfig.customHp);
    launch(new Set(lastConfig.kpIds), lastConfig.difficultyId);
  };

  const leaveBattle = () => {
    setRuntime(null);
    setSelected(null);
    setRevealed(false);
    setOutcome(null);
    setDeadline(null);
    setTicker('');
    setPhase('setup');
    toast('已撤离战场，本局不记录');
  };

  /* ------------------------------ 渲染：开局 ------------------------------ */

  if (phase === 'setup') {
    if (totalTextQuestions === 0) {
      return (
        <div className="bt-view">
          <EmptyState
            icon="target"
            title="还没有可以出战的题目"
            desc="战斗只抽取非图片的文本题，且会跳过大题。先去题库补充一些题目吧。"
            action={
              <button className="btn btn--primary" onClick={() => navigate('/')}>
                返回星图
              </button>
            }
          />
        </div>
      );
    }

    const chosenDifficulty = resolveDifficulty(difficultyId);
    const previewHp = enemyHpFor(chosenDifficulty, previewAverage);

    return (
      <div className="bt-view bt-view--setup">
        <header className="bt-top">
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="返回星图">
            <Icon name="arrow-left" />
          </button>
          <div className="bt-top-main">
            <h1 className="bt-title">星域演武</h1>
            <p className="bt-sub">答题即开火</p>
          </div>
          <button className="bt-ghost-btn" onClick={() => setRulesOpen(true)}>
            <Icon name="book" size={14} /> 规则
          </button>
        </header>

        <section className="bt-hero">
          <div className="bt-hero-stars" aria-hidden="true">
            {STARS.slice(0, 14).map((star, index) => (
              <i
                key={index}
                className="bt-star"
                style={{
                  left: `${star.left}%`,
                  top: `${star.top}%`,
                  width: star.size,
                  height: star.size,
                  opacity: star.opacity,
                  animationDelay: `${star.delay}s`,
                }}
              />
            ))}
          </div>
          <div className="bt-hero-copy">
            <span className="bt-kicker">
              <Icon name="sparkles" size={13} /> 答题驱动战斗
            </span>
            <h2>
              薄弱知识点
              <br />
              就是你的火力
            </h2>
            <p>选指令 · 作答 · 开火，一局 3~6 分钟</p>
          </div>
          <div className="bt-hero-ships" aria-hidden="true">
            <span className="bt-hero-ship bt-hero-ship--enemy">
              <EnemyShipArt />
            </span>
            <span className="bt-hero-ship bt-hero-ship--player">
              <PlayerShipArt />
            </span>
          </div>
        </section>

        <section className="bt-section">
          <div className="bt-section-head">
            <h2>出题范围</h2>
            <span>可多选，薄弱知识点优先</span>
          </div>
          <div className="bt-subjects">
            <button
              className={`bt-subject ${pickedKps.size === 0 ? 'is-on' : ''}`}
              onClick={() => setPickedKps(new Set())}
            >
              <span className="bt-subject-orb bt-subject-orb--random">
                <Icon name="refresh" size={11} />
              </span>
              <span className="bt-subject-name">全部</span>
              <span className="bt-subject-count">{totalTextQuestions} 题</span>
            </button>
            {content.subjects.map((subject) => {
              const own = content.kpsBySubject.get(subject.id) ?? [];
              const ids = own.map((kp) => kp.id);
              const selected = ids.filter((id) => pickedKps.has(id)).length;
              const on = selected > 0 && selected === ids.length;
              const some = selected > 0 && !on;
              return (
                <button
                  key={subject.id}
                  className={`bt-subject ${on ? 'is-on' : ''} ${some ? 'is-some' : ''}`}
                  style={on ? { borderColor: subject.color } : undefined}
                  onClick={() => {
                    const next = new Set(pickedKps);
                    for (const id of ids) {
                      if (on) next.delete(id);
                      else next.add(id);
                    }
                    setPickedKps(next);
                  }}
                >
                  <span
                    className="bt-subject-orb"
                    style={{ background: subject.color, boxShadow: `0 0 10px ${subject.color}` }}
                  />
                  <span className="bt-subject-name">{subject.name}</span>
                  <span className="bt-subject-count">
                    {some ? `${selected}/${ids.length} 知识点` : `${subjectCounts.get(subject.id) ?? 0} 题`}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="bt-scope-bar">
            <span>
              {pickedKps.size === 0 ? (
                <>当前：全部题库 · {totalTextQuestions} 题</>
              ) : (
                <>
                  当前：<b>{pickedKps.size}</b> 个知识点 · {scopeQuestions} 题
                </>
              )}
            </span>
            <div className="bt-scope-bar-actions">
              {pickedKps.size > 0 && (
                <button className="bt-ghost-btn" onClick={() => setPickedKps(new Set())}>
                  清空
                </button>
              )}
              <button
                className={`bt-ghost-btn ${scopeOpen ? 'is-on' : ''}`}
                onClick={() => setScopeOpen((v) => !v)}
                aria-expanded={scopeOpen}
              >
                <Icon name="git-branch" size={13} />
                {scopeOpen ? '收起细化' : '细化到知识点'}
              </button>
            </div>
          </div>
          {scopeOpen && (
            <ScopePicker
              subjects={content.subjects}
              kps={content.kps}
              picked={pickedKps}
              onChange={setPickedKps}
              countByKp={countByKp}
            />
          )}
        </section>

        <section className="bt-section">
          <div className="bt-section-head">
            <h2>难度</h2>
            <span>影响敌舰结构与限时</span>
          </div>
          <div className="bt-diffs">
            {DIFFICULTIES.map((difficulty) => {
              const on = difficultyId === difficulty.id;
              const hp = enemyHpFor(difficulty, previewAverage);
              return (
                <button
                  key={difficulty.id}
                  className={`bt-diff ${on ? 'is-on' : ''}`}
                  onClick={() => setDifficultyId(difficulty.id)}
                >
                  <span className="bt-diff-radio" aria-hidden="true">
                    {on && <i />}
                  </span>
                  <span className="bt-diff-main">
                    <span className="bt-diff-top">
                      <strong>{difficulty.label}</strong>
                      <span className="bt-diff-enemy">{difficulty.enemyName}</span>
                    </span>
                    <span className="bt-diff-tag">{difficulty.tagline}</span>
                  </span>
                  <span className="bt-diff-stats">
                    <b>{hp}</b> 结构
                    <br />
                    {difficulty.seconds}s / 题
                  </span>
                </button>
              );
            })}
            <button
              className={`bt-diff ${difficultyId === 'custom' ? 'is-on' : ''}`}
              onClick={() => setDifficultyId('custom')}
            >
              <span className="bt-diff-radio" aria-hidden="true">
                {difficultyId === 'custom' && <i />}
              </span>
              <span className="bt-diff-main">
                <span className="bt-diff-top">
                  <strong>自定义</strong>
                  <span className="bt-diff-enemy">调限时与血量</span>
                </span>
                <span className="bt-diff-tag">{chosenDifficulty.tagline}</span>
              </span>
              <span className="bt-diff-stats">
                <b>{previewHp}</b> 结构
                <br />
                {chosenDifficulty.seconds}s / 题
              </span>
            </button>
          </div>
          {difficultyId === 'custom' && (
            <div className="bt-custom">
              <label className="bt-custom-row">
                <span>
                  每题限时 <b>{customSeconds}s</b>
                </span>
                <input
                  type="range"
                  min={10}
                  max={180}
                  step={5}
                  value={customSeconds}
                  onChange={(e) => setCustomSeconds(Number(e.target.value))}
                />
              </label>
              <label className="bt-custom-row">
                <span>
                  敌舰结构 <b>{customHp}</b>
                </span>
                <input
                  type="range"
                  min={40}
                  max={500}
                  step={5}
                  value={customHp}
                  onChange={(e) => setCustomHp(Number(e.target.value))}
                />
              </label>
              <p className="bt-custom-hint">
                敌方攻击力会随结构值等比放大，护盾同步调整；我方舰体保持该档预设。
              </p>
            </div>
          )}
        </section>

        <section className="bt-preview">
          <div className="bt-preview-head">
            <div>
              <span className="bt-preview-label">本局预估</span>
              <strong>
                {scopeLabel(pickedKps)} · {chosenDifficulty.label}
              </strong>
            </div>
            <div className="bt-preview-mastery">
              <span>平均掌握</span>
              <b>{pct(previewAverage)}</b>
            </div>
          </div>
          <div className="bt-preview-rows">
            <div>
              <span>敌舰结构</span>
              <b>{previewHp}</b>
            </div>
            <div>
              <span>我方结构</span>
              <b>{chosenDifficulty.playerHull}</b>
            </div>
            <div>
              <span>每题限时</span>
              <b>{chosenDifficulty.seconds}s</b>
            </div>
            <div>
              <span>可出题量</span>
              <b>{scopeQuestions}</b>
            </div>
          </div>
          {weakList.length > 0 ? (
            <div className="bt-weak">
              <span className="bt-weak-title">
                <Icon name="target" size={13} /> 优先出题
              </span>
              {weakList.map((item) => (
                <span key={item.kp.id} className="bt-weak-item">
                  <i style={{ background: 'var(--weak)' }} />
                  {item.kp.name}
                  <em>{pct(item.mastery)}</em>
                </span>
              ))}
            </div>
          ) : (
            <p className="bt-weak-empty">
              还没有掌握度记录：本局会均匀抽题，打完后回星图复盘即可建立基线。
            </p>
          )}
          {pickedKps.size > 0 && scopeQuestions < 6 && (
            <p className="bt-cross">
              这个范围只有 {scopeQuestions} 道可出战的题，牌堆会较快循环；想多打几回合可以放宽范围。
            </p>
          )}
        </section>

        <button className="btn btn--primary btn--lg bt-start" onClick={startBattle}>
          <Icon name="play" size={17} /> 进入星域
        </button>
        <p className="bt-disclaimer">纯游戏演练，不写入学习记录</p>

        <Sheet
          open={rulesOpen}
          onClose={() => setRulesOpen(false)}
          title="战斗规则"
          footer={
            <button className="btn btn--primary btn--block" onClick={() => setRulesOpen(false)}>
              知道了
            </button>
          }
        >
          <div className="bt-rules">
            <p>每回合抽 3 张指令卡，每张卡绑定一道题。选卡后作答，答对即命中。</p>
            <ul>
              <li>命中伤害 = 卡片基础伤害 ×（1 + 0.25 × 连对），连对上限 4。</li>
              <li>答错或超时只造成 35% 伤害，并立刻遭到反击。</li>
              <li>每回合开始护盾回充，伤害先扣护盾再扣结构值。</li>
              <li>答对后敌人也会做一次弱攻击；敌舰被击穿则不再还手。</li>
              <li>战斗只抽文本题，跳过图片真题和大题。</li>
            </ul>
            <p className="bt-rules-note">
              题目优先来自掌握度低的知识点；科目平均掌握度会轻微影响敌舰结构值（±10%）。
            </p>
          </div>
        </Sheet>
      </div>
    );
  }

  /* ------------------------------ 渲染：结算 ------------------------------ */

  if (phase === 'result' && summary) {
    const info = ratingInfo(summary.rating);
    const accuracy = summary.total > 0 ? summary.correct / summary.total : 0;
    const title =
      summary.kind === 'victory' ? '星域肃清' : summary.kind === 'defeat' ? '战舰失联' : '战略撤离';
    const subtitle =
      summary.kind === 'victory'
        ? `击穿 ${summary.subjectName} 星域的 ${summary.difficultyLabel}敌舰`
        : summary.kind === 'defeat'
          ? '结构值归零，本局结束'
          : `达到 ${MAX_ROUNDS} 回合上限，主动撤离`;

    return (
      <div className="bt-view bt-view--result">
        <header className="bt-top">
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="返回星图">
            <Icon name="arrow-left" />
          </button>
          <div className="bt-top-main">
            <h1 className="bt-title">战果</h1>
            <p className="bt-sub">
              {summary.subjectName} · {summary.difficultyLabel}
            </p>
          </div>
          <span className={`bt-result-badge is-${summary.kind}`}>
            {summary.kind === 'victory' ? '胜利' : summary.kind === 'defeat' ? '失败' : '撤离'}
          </span>
        </header>

        <section className={`bt-verdict is-${summary.kind}`}>
          <span className="bt-verdict-kicker">
            {summary.kind === 'victory' ? 'MISSION COMPLETE' : 'MISSION ENDED'}
          </span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          <div className="bt-rating">
            <Ring
              value={accuracy}
              size={108}
              stroke={9}
              color={info.color}
              label={summary.rating}
              sub="评级"
            />
            <p>{info.desc}</p>
          </div>
        </section>

        <section className="bt-report">
          <div className="bt-report-head">
            <div>
              <span className="bt-report-kicker">BATTLE REPORT</span>
              <h2>战斗报告</h2>
            </div>
            <span className="bt-report-acc">正确率 {pct(accuracy)}</span>
          </div>
          <div className="bt-stats">
            <StatTile label="回合" value={summary.rounds} />
            <StatTile label="正确率" value={pct(accuracy)} />
            <StatTile label="最高连对" value={`×${summary.maxCombo}`} />
            <StatTile label="造成伤害" value={summary.damageDealt} tone="ok" />
            <StatTile label="承受伤害" value={summary.damageTaken} tone="bad" />
            <StatTile label="用时" value={formatDuration(summary.durationMs)} />
          </div>
          <div className="bt-report-foot">
            <span>
              答对 {summary.correct} / {summary.total}
            </span>
            <span>剩余结构 {summary.hullLeft}</span>
            <span>敌舰剩余 {Math.max(0, summary.enemyHpLeft)}</span>
            {summary.crossSubject && <span>含跨科题</span>}
          </div>
        </section>

        <div className="bt-actions">
          <button className="btn btn--primary btn--lg btn--block" onClick={rematch}>
            <Icon name="refresh" size={16} /> 再战一局
          </button>
          <div className="bt-actions-row">
            <button className="btn btn--ghost" onClick={() => setPhase('setup')}>
              <Icon name="sliders" size={15} /> 换科目 / 难度
            </button>
            <button className="btn btn--ghost" onClick={() => navigate('/')}>
              <Icon name="grid" size={15} /> 返回星图
            </button>
          </div>
        </div>
        <p className="bt-footnote">战斗是独立演练，不会改变你的掌握度与错题本。</p>
      </div>
    );
  }

  /* ------------------------------ 渲染：战斗 ------------------------------ */

  if (!runtime) {
    return (
      <div className="bt-view">
        <EmptyState
          icon="target"
          title="战斗尚未开始"
          desc="回到选择界面，挑一个科目与难度。"
          action={
            <button className="btn btn--primary" onClick={() => setPhase('setup')}>
              返回选择
            </button>
          }
        />
      </div>
    );
  }

  const card = selected == null ? null : runtime.cards[selected];
  const complete = card ? isAnswerComplete(card.question, payload) : false;
  const enemyHpRatio = Math.max(0, runtime.enemy.hp / runtime.enemy.maxHp);
  const enemyShieldRatio = Math.max(0, runtime.enemy.shield / runtime.enemy.maxShield);
  const playerHullRatio = Math.max(0, runtime.player.hull / runtime.player.maxHull);
  const playerShieldRatio = Math.max(0, runtime.player.shield / runtime.player.maxShield);
  const timerRatio = Math.max(
    0,
    Math.min(1, remaining / (runtime.difficulty.seconds * 1000)),
  );
  const urgent = remaining <= 10_000;

  const missTitle =
    missReason === 'timeout' ? '超时，指令偏斜' : missReason === 'skip' ? '已跳过，指令偏斜' : '指令偏斜';

  const battleEnd: Summary['kind'] | null =
    outcome == null
      ? null
      : outcome.enemyDied
        ? 'victory'
        : outcome.playerDied
          ? 'defeat'
          : runtime.round >= MAX_ROUNDS
            ? 'retreat'
            : null;

  const kpNameOf = (question: BattleCard['question']): string => {
    const id = question.kpIds[0];
    if (!id) return '综合';
    return content.kpsById.get(id)?.name ?? '综合';
  };

  return (
    <div className="bt-view bt-view--battle">
      <header className="bt-hud">
        <button className="icon-btn" onClick={leaveBattle} aria-label="撤离战场">
          <Icon name="arrow-left" />
        </button>
        <div className="bt-hud-mid">
          <span className="bt-hud-round">
            回合 {runtime.round}
            <em>/{MAX_ROUNDS}</em>
          </span>
          <span className="bt-hud-subject">
            <i style={{ background: 'var(--accent)' }} />
            {runtime.scopeName} · {runtime.difficulty.label}
          </span>
        </div>
        <div className={`bt-combo ${runtime.combo > 0 ? 'is-on' : ''}`}>
          <Icon name="flame" size={14} />
          <b>×{runtime.combo}</b>
          <span>连对</span>
        </div>
      </header>

      <section
        className={`bt-stage ${shake ? `is-shake-${shake}` : ''}`}
        aria-label="战斗场景"
      >
        <div className="bt-stars" aria-hidden="true">
          {STARS.map((star, index) => (
            <i
              key={index}
              className="bt-star"
              style={{
                left: `${star.left}%`,
                top: `${star.top}%`,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                animationDelay: `${star.delay}s`,
              }}
            />
          ))}
        </div>

        <div className={`bt-unit bt-unit--enemy ${shake === 'enemy' ? 'is-hit' : ''}`}>
          <div className="bt-unit-head">
            <span className="bt-unit-name">{runtime.difficulty.enemyName}</span>
            <span className="bt-unit-hp">
              {Math.max(0, runtime.enemy.hp)} / {runtime.enemy.maxHp}
            </span>
          </div>
          <div className="bt-bars">
            <div className={`bt-bar bt-bar--hp ${runtime.enemy.hp <= 0 ? 'is-empty' : ''}`}>
              <Meter value={enemyHpRatio} tone="weak" height={7} />
            </div>
            <div className={`bt-bar bt-bar--shield ${runtime.enemy.shield <= 0 ? 'is-empty' : ''}`}>
              <Meter value={enemyShieldRatio} tone="accent" height={4} />
            </div>
          </div>
          <div className="bt-unit-shield">护盾 {runtime.enemy.shield}</div>
          <div className="bt-ship bt-ship--enemy">
            <EnemyShipArt />
          </div>
        </div>

        <div className="bt-stage-mid" aria-hidden="true">
          <span className="bt-stage-line" />
          <span className="bt-stage-badge">
            <Icon name="target" size={12} /> 交战中
          </span>
          <span className="bt-stage-line" />
        </div>

        <div className={`bt-unit bt-unit--player ${shake === 'player' ? 'is-hit' : ''}`}>
          <div className="bt-ship bt-ship--player">
            <PlayerShipArt />
          </div>
          <div className="bt-bars">
            <div className={`bt-bar bt-bar--hp ${runtime.player.hull <= 0 ? 'is-empty' : ''}`}>
              <Meter value={playerHullRatio} tone="good" height={7} />
            </div>
            <div className={`bt-bar bt-bar--shield ${runtime.player.shield <= 0 ? 'is-empty' : ''}`}>
              <Meter value={playerShieldRatio} tone="accent" height={4} />
            </div>
          </div>
          <div className="bt-unit-foot">
            <span className="bt-unit-name">知星级战舰</span>
            <span className="bt-unit-shield">护盾 {runtime.player.shield}</span>
            <span className="bt-unit-hp">
              {Math.max(0, runtime.player.hull)} / {runtime.player.maxHull}
            </span>
          </div>
        </div>

        {floaters.map((floater) => (
          <span
            key={floater.id}
            className={`bt-floater bt-floater--${floater.side} bt-floater--${floater.tone}`}
          >
            {floater.text}
          </span>
        ))}
      </section>

      <p className="bt-ticker" aria-live="polite">
        {ticker}
      </p>

      <section className="bt-command">
        <div className="bt-command-head">
          <h2>选择指令</h2>
          <span>命中伤害 ×{comboMultiplier(Math.min(COMBO_CAP, runtime.combo + 1)).toFixed(2)}</span>
        </div>
        <div className="bt-cards">
          {runtime.cards.map((battleCard, index) => (
            <button
              key={`${battleCard.question.id}-${index}`}
              className={`bt-card ${selected === index ? 'is-on' : ''}`}
              onClick={() => openCard(index)}
              disabled={selected != null}
            >
              <span className="bt-card-top">
                <span className="bt-card-type">{typeLabel(battleCard.question.type)}</span>
                {battleCard.fromOtherSubject && <span className="bt-card-cross">跨科</span>}
              </span>
              <strong className="bt-card-dmg">
                {battleCard.baseDamage}
                <em>伤害</em>
              </strong>
              <span className="bt-card-kp">{kpNameOf(battleCard.question)}</span>
              <span
                className={`bt-card-mastery ${
                  battleCard.mastery == null
                    ? 'is-none'
                    : battleCard.mastery < 0.5
                      ? 'is-weak'
                      : ''
                }`}
              >
                {battleCard.mastery == null ? '未探索' : `掌握 ${pct(battleCard.mastery)}`}
              </span>
              {battleCard.recycled && <span className="bt-card-recycled">循环</span>}
            </button>
          ))}
        </div>
        <p className="bt-command-hint">
          答对命中 · 答错偏斜 35% 并遭反击 · 限时 {runtime.difficulty.seconds}s
          {runtime.crossSubject ? ' · 含跨科题' : ''}
        </p>
      </section>

      {card && (
        <div className="bt-answer-layer">
          <div className="bt-answer" role="dialog" aria-modal="true" aria-label="作答">
            <div className="bt-answer-grip" />
            <div className="bt-answer-head">
              <div>
                <span className="bt-answer-kicker">
                  指令 {selected == null ? 0 : selected + 1} · {typeLabel(card.question.type)} · 基础伤害{' '}
                  {card.baseDamage}
                </span>
                <h2>
                  {revealed ? (outcome?.correct ? '指令命中' : missTitle) : '作答以开火'}
                </h2>
              </div>
              {!revealed && (
                <span className={`bt-timer ${urgent ? 'is-urgent' : ''}`}>
                  <Icon name="timer" size={14} /> {formatClock(remaining)}
                </span>
              )}
            </div>
            {!revealed && (
              <div className={`bt-timer-track ${urgent ? 'is-urgent' : ''}`}>
                <span style={{ width: `${timerRatio * 100}%` }} />
              </div>
            )}

            <div className="bt-answer-body">
              <div className="bt-question">
                <div className="bt-question-meta">
                  <span className="bt-type-pill">{typeLabel(card.question.type)}</span>
                  <span>难度 {card.question.difficulty}/5</span>
                  <span>{kpNameOf(card.question)}</span>
                  {card.mastery != null && <span>掌握 {pct(card.mastery)}</span>}
                </div>
                <Markdown source={card.question.stem} />
              </div>

              <form
                className="bt-answer-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (revealed) nextRound();
                  else submit(false);
                }}
              >
                <AnswerInput
                  question={card.question}
                  payload={payload}
                  onChange={setPayload}
                  revealed={revealed}
                />
                <button
                  type="submit"
                  className="bt-hidden-submit"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </form>

              {revealed && outcome && (
                <div className={`bt-feedback ${outcome.correct ? 'is-good' : 'is-bad'}`}>
                  <div className="bt-feedback-head">
                    <span className="bt-feedback-icon">
                      <Icon name={outcome.correct ? 'check' : 'x'} size={17} />
                    </span>
                    <div>
                      <strong>{outcome.correct ? '指令命中' : missTitle}</strong>
                      <p>
                        {outcome.correct
                          ? `造成 ${outcome.damage} 伤害（×${outcome.multiplier.toFixed(2)}）${
                              outcome.enemyDied
                                ? ' · 敌舰结构归零'
                                : ` · 敌方弱攻击 ${outcome.enemyAttack}`
                            }`
                          : `只造成 ${outcome.damage} 伤害${
                              outcome.enemyDied
                                ? ' · 敌舰结构归零'
                                : `，敌舰反击 ${outcome.enemyAttack}`
                            }`}
                      </p>
                    </div>
                  </div>
                  <div className="bt-feedback-bars">
                    <span>
                      敌舰护盾 {outcome.enemyShield} · 结构 {Math.max(0, outcome.enemyHp)}
                    </span>
                    <span>
                      我方护盾 {outcome.playerShield} · 结构 {Math.max(0, outcome.playerHull)}
                    </span>
                  </div>
                  <div className="bt-correct">
                    <span className="bt-correct-label">正确答案</span>
                    <Markdown source={correctAnswerMarkdown(card.question)} />
                  </div>
                  {card.question.explanation && (
                    <details className="bt-explanation">
                      <summary>解析</summary>
                      <Markdown source={card.question.explanation} />
                    </details>
                  )}
                </div>
              )}
            </div>

            <div className="bt-answer-foot">
              {!revealed ? (
                <>
                  <button
                    type="button"
                    className="btn btn--ghost bt-skip"
                    onClick={() => submit(false, true)}
                  >
                    跳过
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary bt-fire"
                    disabled={!complete}
                    onClick={() => submit(false)}
                  >
                    <Icon name="play" size={16} /> 开火
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn--primary btn--block" onClick={nextRound}>
                  {battleEnd ? '查看战果' : '继续'}
                  <Icon name="chevron-right" size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
