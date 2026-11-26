import { useRef, useState } from 'react';
import { useApp } from '../state/AppState';
import { computeCivilization } from '../engine/game';
import {
  exportJson,
  importJson,
  resetProgress,
  updateSettings,
} from '../engine/store';
import { dateKey, pct, relativeTime } from '../lib/format';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';
import { PageHeader, Ring, SectionHead, Sheet } from '../components/ui';
import type { Settings as SettingsType } from '../types';

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className="stepper">
        <button
          className="stepper-btn"
          aria-label={`减少${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </button>
        <span className="stepper-value">{value}</span>
        <button
          className="stepper-btn"
          aria-label={`增加${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <button
        className={`switch ${value ? 'is-on' : ''}`}
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="setting-row setting-row--stack">
      <div className="setting-text">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className="segmented">
        {options.map((option) => (
          <button
            key={option.value}
            className={value === option.value ? 'is-on' : ''}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Settings() {
  const { data, questions, kpStats, content, update, toast, startSession, sync, syncNow, logout: doLogout } = useApp();
  const civ = computeCivilization(data, questions, kpStats);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const account = sync.user;
  const authBusy = !sync.authChecked || logoutBusy;
  const authError = logoutError || sync.authError;

  const logout = async () => {
    setLogoutBusy(true);
    setLogoutError('');
    try {
      await doLogout();
      toast('已退出登录');
    } catch {
      setLogoutError('退出失败，请重试。');
    } finally {
      setLogoutBusy(false);
    }
  };

  const handleManualSync = async () => {
    const res = await syncNow();
    if (!res.ok) {
      toast(res.error || '同步失败');
      return;
    }
    if (res.pulled && res.pushed) {
      toast('已与云端双向合并同步');
    } else if (res.pulled) {
      toast('已拉取并合并云端最新进度');
    } else if (res.pushed) {
      toast('本地进度已同步到云端');
    } else {
      toast('已是最新，无需更新');
    }
  };

  const syncHint = (() => {
    if (sync.status === 'syncing') return '正在与云端合并同步…';
    if (sync.status === 'error') return sync.message || '同步失败，本机数据不受影响';
    if (sync.dirty) return '有本地改动，等待自动上传';
    if (sync.lastSyncedAt > 0) return `已自动同步 · ${relativeTime(sync.lastSyncedAt)}`;
    return '已开启多设备自动合并同步';
  })();

  const patch = (value: Partial<SettingsType>) => {
    update((d) => updateSettings(d, value));
  };

  const doExport = () => {
    const blob = new Blob([exportJson(data)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `知星进度-${dateKey(Date.now())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('进度已导出');
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importJson(text);
      update(() => imported);
      toast('进度已导入');
      navigate('/');
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败');
    }
  };

  return (
    <div className="view">
      <PageHeader title="我的" subtitle="文明档案与本机设置" />

      <section className="card profile-card">
        <div className="profile-top">
          <Ring
            value={civ.levelNeed === 0 ? 0 : civ.levelInto / civ.levelNeed}
            size={84}
            stroke={6}
            label={`Lv.${civ.level}`}
            sub={`${civ.levelInto}/${civ.levelNeed}`}
            color="var(--accent)"
          />
          <div className="profile-info">
            <h2>求知文明</h2>
            <p>
              累计 {civ.totalAnswered} 次作答 · 正确率 {pct(civ.accuracy)}
            </p>
            <div className="profile-chips">
              <span className="mini-chip">
                <Icon name="star" size={13} /> 点亮 {civ.litSystems}/{civ.totalSystems}
              </span>
              <span className="mini-chip">
                <Icon name="sparkles" size={13} /> 舰队战力 {civ.fleetPower}
              </span>
              <span className="mini-chip">
                <Icon name="target" size={13} /> 科技 T{civ.techTier}
              </span>
            </div>
          </div>
        </div>
        <p className="profile-note">
          文明等级来自学习经验；之后接入游戏系统时，这份档案会直接变成你的势力初始状态。
        </p>
      </section>

      <section className="block">
        <SectionHead title="账号与同步" hint="登录后自动在多设备间合并同步学习进度与真题记录" />
        <div className="card settings-card">
          <div className="setting-row">
            <div className="setting-text">
              <strong>{!sync.authChecked ? '正在检查登录状态…' : account ? (account.name || account.login || '已登录') : '未登录'}</strong>
              <span>{account ? `已通过 ${account.provider} 登录（${account.sub}）` : '登录 wris.me 账号以开启多设备云端自动同步。'}</span>
            </div>
            {account ? (
              <button className="btn btn--ghost btn--sm" disabled={authBusy} onClick={() => void logout()}>退出登录</button>
            ) : (
              <a className={`btn btn--primary btn--sm${authBusy ? ' is-disabled' : ''}`} href={authBusy ? undefined : '/api/auth/login'} aria-disabled={authBusy}>使用 wris.me 登录</a>
            )}
          </div>
          {account && (
            <div className="setting-row">
              <div className="setting-text">
                <strong>云端同步</strong>
                <span>{syncHint}</span>
              </div>
              <button
                className="btn btn--ghost btn--sm"
                disabled={sync.status === 'syncing'}
                onClick={() => void handleManualSync()}
              >
                {sync.status === 'syncing' ? '同步中…' : '立即同步'}
              </button>
            </div>
          )}
          {authError && <p className="auth-note" role="status">{authError}</p>}
        </div>
      </section>

      <section className="block">
        <SectionHead title="学习节奏" hint="决定「今日学习」给你安排多少题" />
        <div className="card settings-card">
          <Stepper
            label="每日新题"
            hint="没做过的题，最多安排这么多"
            value={data.settings.dailyNew}
            min={5}
            max={50}
            step={5}
            onChange={(dailyNew) => patch({ dailyNew })}
          />
          <Stepper
            label="每日复习"
            hint="到期卡片的复习上限"
            value={data.settings.dailyReview}
            min={10}
            max={120}
            step={10}
            onChange={(dailyReview) => patch({ dailyReview })}
          />
          <Toggle
            label="答题计时"
            hint="记录每题用时，影响复习评分"
            value={data.settings.showTimer}
            onChange={(showTimer) => patch({ showTimer })}
          />
          <Toggle
            label="答对自动下一题"
            hint="仅即时反馈模式，1 秒后自动继续"
            value={data.settings.autoNext}
            onChange={(autoNext) => patch({ autoNext })}
          />
        </div>
      </section>

      <section className="block">
        <SectionHead title="外观" />
        <div className="card settings-card">
          <Segmented
            label="主题"
            value={data.settings.theme}
            options={[
              { value: 'dark', label: '深空' },
              { value: 'light', label: '纸白' },
              { value: 'auto', label: '跟随系统' },
            ]}
            onChange={(theme) => patch({ theme })}
          />
          <Segmented
            label="字号"
            value={data.settings.fontSize}
            options={[
              { value: 'sm', label: '小' },
              { value: 'md', label: '中' },
              { value: 'lg', label: '大' },
            ]}
            onChange={(fontSize) => patch({ fontSize })}
          />
        </div>
      </section>

      <section className="block">
        <SectionHead title="学习工具" hint="把收藏的题集中过一遍" />
        <div className="card settings-card">
          <button
            className="setting-row setting-action"
            disabled={data.favorites.length === 0}
            onClick={() => {
              const ok = startSession('favorite', {
                label: '收藏练习',
                count: Math.min(10, data.favorites.length),
                reveal: 'immediate',
              });
              if (!ok) toast('还没有收藏题目');
            }}
          >
            <div className="setting-text">
              <strong>收藏练习</strong>
              <span>
                {data.favorites.length > 0
                  ? `${data.favorites.length} 道收藏，练一组 ${Math.min(10, data.favorites.length)} 题`
                  : '在科目题库里点星标即可收藏'}
              </span>
            </div>
            <Icon name="star" />
          </button>
        </div>
      </section>

      <section className="block">
        <SectionHead title="数据" hint={account ? '已开启云端自动合并同步；也可随时导出本地备份' : '进度只保存在本机浏览器，登录后可云端同步或手动导出'} />
        <div className="card settings-card">
          <button className="setting-row setting-action" onClick={doExport}>
            <div className="setting-text">
              <strong>导出进度</strong>
              <span>下载一个 JSON 备份文件</span>
            </div>
            <Icon name="download" />
          </button>
          <button className="setting-row setting-action" onClick={() => fileRef.current?.click()}>
            <div className="setting-text">
              <strong>导入进度</strong>
              <span>会覆盖当前设备上的记录</span>
            </div>
            <Icon name="upload" />
          </button>
          <button
            className="setting-row setting-action setting-action--danger"
            onClick={() => setConfirmReset(true)}
          >
            <div className="setting-text">
              <strong>清空学习记录</strong>
              <span>保留自定义题目与设置</span>
            </div>
            <Icon name="trash" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void doImport(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      <section className="block">
        <SectionHead title="关于" />
        <div className="card settings-card">
          <div className="setting-row">
            <div className="setting-text">
              <strong>题库内容</strong>
              <span>
                {content.subjects.length} 个科目 · {content.kps.length} 个知识点 ·{' '}
                {questions.length} 道题
              </span>
            </div>
            <span className="quiet small">内置</span>
          </div>
          <div className="setting-row">
            <div className="setting-text">
              <strong>内容校对</strong>
              <span>知识体系为 AI 辅助整理，请以教材与课标为准；真题来源待逐步补齐。</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-text">
              <strong>游戏系统</strong>
              <span>尚未接入；学习数据与文明档案已按接口预留</span>
            </div>
            <span className="badge tone-muted">施工中</span>
          </div>
          <div className="setting-row">
            <div className="setting-text">
              <strong>知星</strong>
              <span>离线优先 · wris.me 账号登录 · 学习进度与真题记录云端同步</span>
            </div>
            <span className="quiet small">v0.7</span>
          </div>
        </div>
      </section>

      <p className="footnote">
        把不会的题做对两次，它就会从错题本毕业；让薄弱的知识点亮起来，星图会记住你走过的路。
      </p>

      <Sheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="清空学习记录？"
        footer={
          <div className="sheet-actions">
            <button className="btn btn--ghost" onClick={() => setConfirmReset(false)}>
              取消
            </button>
            <button
              className="btn btn--danger"
              onClick={() => {
                update(resetProgress);
                setConfirmReset(false);
                toast('学习记录已清空');
                navigate('/');
              }}
            >
              确认清空
            </button>
          </div>
        }
      >
        <p className="sheet-text">
          这会删除所有复习卡片、作答记录、错题本和统计数据，且无法恢复。自定义题目和设置会保留。
        </p>
        <p className="sheet-text quiet">建议先导出进度备份。</p>
      </Sheet>
    </div>
  );
}
