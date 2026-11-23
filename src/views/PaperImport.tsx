import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createStore, del, get, set } from 'idb-keyval';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, SectionHead, Sheet, StatTile } from '../components/ui';
import { pad2 } from '../lib/format';
import { navigate } from '../lib/router';
import { useApp } from '../state/AppState';
import { PAPERS, assetUrl } from '../papers';
import {
  ASSET_KINDS,
  DRAFT_KEY,
  REGION_NAMES,
  assetKeyFor,
  buildExport,
  createEmptyMeta,
  createQuestion,
  emptyAsset,
  imageExtension,
  normalizeAssetPath,
  parseDraft,
  parseTags,
  renumberQuestions,
  suggestPaperId,
  suggestedAssetPath,
  validateDraft,
  type AssetKind,
  type ExportFile,
  type ExportImageFile,
  type ImportAssetDraft,
  type ImportDraft,
  type ImportPaperMeta,
  type ImportQuestionDraft,
} from '../papers/import';
import '../styles-import.css';

const store = createStore('zhixing-db', 'kv');

type Step = 1 | 2 | 3;

const STEPS: readonly { id: Step; label: string }[] = [
  { id: 1, label: '卷子信息' },
  { id: 2, label: '逐题录入' },
  { id: 3, label: '校验导出' },
];

function controlClass(base: string, error: string | undefined): string {
  return `${base}${error ? ' is-bad' : ''}`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 继续尝试旧接口 */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function getAsset(question: ImportQuestionDraft, kind: AssetKind): ImportAssetDraft {
  if (kind === 'stem') return question.stem;
  if (kind === 'analysis') return question.analysis;
  return question.answerImage;
}

function withAsset(
  question: ImportQuestionDraft,
  kind: AssetKind,
  asset: ImportAssetDraft,
): ImportQuestionDraft {
  if (kind === 'stem') return { ...question, stem: asset };
  if (kind === 'analysis') return { ...question, analysis: asset };
  return { ...question, answerImage: asset };
}

function Field({
  label,
  required = false,
  hint,
  error,
  wide = false,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`imp-field${wide ? ' imp-span-2' : ''}`}>
      <span className="imp-label">
        {label}
        {required && <em>*</em>}
      </span>
      {children}
      {error ? (
        <span className="imp-error">{error}</span>
      ) : (
        hint && <span className="imp-hint">{hint}</span>
      )}
    </div>
  );
}

function ImageField({
  title,
  required = false,
  hint,
  asset,
  src,
  suggestedPath,
  onPick,
  onMode,
  onPath,
  onClear,
}: {
  title: string;
  required?: boolean;
  hint?: string;
  asset: ImportAssetDraft;
  src: string;
  suggestedPath: string;
  onPick: (file: File) => void;
  onMode: (mode: 'upload' | 'path') => void;
  onPath: (value: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <div className="imp-img">
      <div className="imp-img-head">
        <span className="imp-img-title">
          {title}
          {required && <em>*</em>}
        </span>
        <div className="imp-img-modes">
          <button
            type="button"
            className={`imp-img-mode${asset.mode === 'upload' ? ' is-on' : ''}`}
            onClick={() => {
              onMode('upload');
              inputRef.current?.click();
            }}
          >
            上传
          </button>
          <button
            type="button"
            className={`imp-img-mode${asset.mode === 'path' ? ' is-on' : ''}`}
            onClick={() => onMode('path')}
          >
            路径
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onPick(file);
        }}
      />

      {src ? (
        <div className="imp-img-preview">
          {broken ? (
            <div className="imp-img-empty">图片无法预览；构建后才会按路径加载。</div>
          ) : (
            <img src={src} alt={`${title}预览`} onError={() => setBroken(true)} />
          )}
        </div>
      ) : (
        <div className="imp-img-empty">
          {asset.missing ? '图片文件已丢失，请重新上传。' : '还没有图片'}
        </div>
      )}

      {asset.mode === 'path' && (
        <div className="imp-img-path">
          <input
            className="imp-input"
            value={asset.path}
            placeholder={suggestedPath}
            onChange={(event) => onPath(event.currentTarget.value)}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onPath(suggestedPath)}
          >
            建议
          </button>
        </div>
      )}

      <div className="imp-img-actions">
        {asset.mode === 'upload' && asset.fileName && (
          <span className="imp-img-file" title={asset.fileName}>
            {asset.fileName}
          </span>
        )}
        {asset.mode === 'upload' && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" size={13} />
            {asset.fileName ? '重新选择' : '选择图片'}
          </button>
        )}
        {asset.mode !== 'none' && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
            <Icon name="trash" size={13} />
            清除
          </button>
        )}
        {hint && <span className="imp-hint">{hint}</span>}
      </div>
    </div>
  );
}

export function PaperImport() {
  const { content, toast } = useApp();

  const [meta, setMeta] = useState<ImportPaperMeta>(() => createEmptyMeta());
  const [questions, setQuestions] = useState<ImportQuestionDraft[]>(() => [createQuestion(1)]);
  const [step, setStep] = useState<Step>(1);
  const [hydrated, setHydrated] = useState(false);
  const [saveEnabled, setSaveEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [idTouched, setIdTouched] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [kpSheetKey, setKpSheetKey] = useState<string | null>(null);
  const [kpSearch, setKpSearch] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const assetUrls = useRef<Map<string, string>>(new Map());
  const hydratedRef = useRef(false);
  const saveEnabledRef = useRef(false);
  const draftRef = useRef<ImportDraft | null>(null);

  /* ---------------- 恢复草稿 ---------------- */

  useEffect(() => {
    let alive = true;
    const created: { key: string; url: string }[] = [];

    const discard = () => {
      for (const item of created) {
        URL.revokeObjectURL(item.url);
        if (assetUrls.current.get(item.key) === item.url) assetUrls.current.delete(item.key);
      }
    };

    const hydrate = async (asset: ImportAssetDraft): Promise<ImportAssetDraft> => {
      if (asset.mode !== 'upload' || !asset.assetKey) return asset;
      let blob: Blob | undefined;
      try {
        blob = await get<Blob>(asset.assetKey, store);
      } catch {
        blob = undefined;
      }
      if (!(blob instanceof Blob)) return { ...asset, missing: true };
      const url = URL.createObjectURL(blob);
      created.push({ key: asset.assetKey, url });
      const previous = assetUrls.current.get(asset.assetKey);
      if (previous) URL.revokeObjectURL(previous);
      assetUrls.current.set(asset.assetKey, url);
      return { ...asset, missing: false };
    };

    void (async () => {
      let raw: unknown;
      try {
        raw = await get<unknown>(DRAFT_KEY, store);
      } catch {
        raw = undefined;
      }
      if (!alive) return;
      const draft = parseDraft(raw);
      if (!draft) {
        setHydrated(true);
        return;
      }

      const restored: ImportQuestionDraft[] = [];
      for (const question of draft.questions) {
        const stem = await hydrate(question.stem);
        const analysis = await hydrate(question.analysis);
        const answerImage = await hydrate(question.answerImage);
        if (!alive) {
          discard();
          return;
        }
        restored.push({ ...question, stem, analysis, answerImage });
      }

      if (!alive) {
        discard();
        return;
      }

      setMeta(draft.meta);
      setQuestions(renumberQuestions(restored));
      setSavedAt(draft.savedAt || null);
      setHydrated(true);
      toast('已恢复上次草稿');
    })();

    return () => {
      alive = false;
    };
  }, [toast]);

  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  useEffect(() => {
    saveEnabledRef.current = saveEnabled;
  }, [saveEnabled]);

  useEffect(() => {
    const urls = assetUrls.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  /* ---------------- 自动保存 ---------------- */

  const snapshot: ImportDraft = {
    version: 1,
    savedAt: savedAt ?? Date.now(),
    meta,
    questions,
  };
  draftRef.current = snapshot;

  useEffect(() => {
    if (!hydrated || !saveEnabled) return;
    setSaving(true);
    const timer = window.setTimeout(() => {
      const draft: ImportDraft = {
        version: 1,
        savedAt: Date.now(),
        meta,
        questions,
      };
      set(DRAFT_KEY, draft, store)
        .then(() => {
          setSavedAt(draft.savedAt);
          setSaving(false);
        })
        .catch((error: unknown) => {
          console.error('[知星] 草稿保存失败', error);
          setSaving(false);
          toast('草稿保存失败，请检查浏览器存储空间');
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [meta, questions, hydrated, saveEnabled, toast]);

  useEffect(() => {
    const flush = () => {
      if (!hydratedRef.current || !saveEnabledRef.current || !draftRef.current) return;
      const draft: ImportDraft = { ...draftRef.current, savedAt: Date.now() };
      void set(DRAFT_KEY, draft, store);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /* ---------------- 校验与导出 ---------------- */

  const paperIds = useMemo(() => new Set(PAPERS.map((paper) => paper.id)), []);
  const subjectIds = useMemo(
    () => new Set(content.subjects.map((subject) => subject.id)),
    [content.subjects],
  );
  const knownKpIds = useMemo(() => new Set(content.kps.map((kp) => kp.id)), [content.kps]);

  const validation = useMemo(
    () => validateDraft(meta, questions, { paperIds, subjectIds, kpIds: knownKpIds }),
    [meta, questions, paperIds, subjectIds, knownKpIds],
  );

  const bundle = useMemo(
    () =>
      buildExport(meta, questions, {
        subjectName: content.subjectsById.get(meta.subjectId)?.name ?? '',
      }),
    [meta, questions, content],
  );

  const canExport = validation.errors.length === 0;
  const issues = [...validation.errors, ...validation.warnings];
  const exportId = meta.id.trim() || '<id>';
  const treeText = [
    `content/papers/${exportId}/`,
    ...bundle.files.map((file) => `  ${file.name}`),
    '',
    `public/papers/${exportId}/`,
    ...(bundle.imageFiles.length > 0
      ? bundle.imageFiles.map((file) => `  ${file.fileName}`)
      : ['  （没有上传图片）']),
  ].join('\n');

  const kpSheetQuestion = questions.find((question) => question.key === kpSheetKey);

  const kpList = useMemo(() => {
    const list = content.kpsBySubject.get(meta.subjectId) ?? [];
    const term = kpSearch.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (kp) =>
        kp.name.toLowerCase().includes(term) ||
        kp.id.toLowerCase().includes(term) ||
        (kp.group ?? '').toLowerCase().includes(term),
    );
  }, [content, meta.subjectId, kpSearch]);

  const draftLabel = !hydrated
    ? '正在读取本机草稿…'
    : saving
      ? '草稿保存中…'
      : savedAt
        ? `草稿已保存 ${formatTime(savedAt)}`
        : '尚未保存草稿';

  /* ---------------- 基础操作 ---------------- */

  function paperError(field: string): string | undefined {
    const issue = validation.errors.find(
      (item) => item.scope === 'paper' && item.field === field,
    );
    return issue?.message;
  }

  function questionError(number: number, field: string): string | undefined {
    const issue = validation.errors.find(
      (item) => item.scope === 'question' && item.number === number && item.field === field,
    );
    return issue?.message;
  }

  function previewFor(asset: ImportAssetDraft): string {
    if (asset.mode === 'upload') return assetUrls.current.get(asset.assetKey) ?? '';
    if (asset.mode === 'path') {
      const path = normalizeAssetPath(asset.path);
      return path ? assetUrl(path) : '';
    }
    return '';
  }

  function revokeUrl(key: string) {
    const url = assetUrls.current.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      assetUrls.current.delete(key);
    }
  }

  function updateMeta(patch: Partial<ImportPaperMeta>) {
    setSaveEnabled(true);
    setMeta((current) => {
      const next = { ...current, ...patch };
      if (!idTouched && patch.id === undefined) next.id = suggestPaperId(next);
      return next;
    });
  }

  function regenerateId() {
    const next = suggestPaperId(meta);
    if (!next) {
      toast('先填写地区和科目，才能生成 id');
      return;
    }
    setIdTouched(false);
    setSaveEnabled(true);
    setMeta({ ...meta, id: next });
  }

  function changeSubject(subjectId: string) {
    setSaveEnabled(true);
    const allowed = new Set(
      (content.kpsBySubject.get(subjectId) ?? []).map((kp) => kp.id),
    );
    const nextQuestions = questions.map((question) => ({
      ...question,
      kpIds: question.kpIds.filter((kpId) => allowed.has(kpId)),
    }));
    const dropped = nextQuestions.some(
      (question, index) => question.kpIds.length !== questions[index].kpIds.length,
    );
    setQuestions(nextQuestions);
    setKpSheetKey(null);
    setMeta((current) => {
      const next = { ...current, subjectId };
      if (!idTouched) next.id = suggestPaperId(next);
      return next;
    });
    if (dropped) toast('已移除不属于新科目的知识点');
  }

  function patchQuestion(key: string, patch: Partial<ImportQuestionDraft>) {
    setSaveEnabled(true);
    setQuestions((current) =>
      current.map((question) => (question.key === key ? { ...question, ...patch } : question)),
    );
  }

  function patchAsset(key: string, kind: AssetKind, asset: ImportAssetDraft) {
    setSaveEnabled(true);
    setQuestions((current) =>
      current.map((question) =>
        question.key === key ? withAsset(question, kind, asset) : question,
      ),
    );
  }

  async function uploadAsset(question: ImportQuestionDraft, kind: AssetKind, file: File) {
    if (!file.type.startsWith('image/')) {
      toast('请选择图片文件');
      return;
    }
    const paperId = meta.id.trim() || 'draft';
    const key = assetKeyFor(paperId, question.number, kind);
    try {
      await set(key, file, store);
    } catch (error: unknown) {
      console.error('[知星] 图片写入失败', error);
      toast('图片保存失败，可能是浏览器存储空间不足');
      return;
    }
    const previous = getAsset(question, kind);
    if (previous.assetKey && previous.assetKey !== key) {
      try {
        await del(previous.assetKey, store);
      } catch {
        /* 旧图删不掉不影响新图 */
      }
      revokeUrl(previous.assetKey);
    }
    const oldUrl = assetUrls.current.get(key);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    assetUrls.current.set(key, URL.createObjectURL(file));
    patchAsset(question.key, kind, {
      mode: 'upload',
      fileName: file.name,
      path: '',
      assetKey: key,
      ext: imageExtension(file.name, file.type),
      missing: false,
    });
    toast('图片已存入本机草稿');
  }

  function switchAssetMode(
    question: ImportQuestionDraft,
    kind: AssetKind,
    mode: 'upload' | 'path',
  ) {
    const asset = getAsset(question, kind);
    if (asset.mode === mode) return;
    if (mode === 'path') {
      patchAsset(question.key, kind, {
        ...asset,
        mode: 'path',
        path: asset.path || suggestedAssetPath(meta.id, question.number, kind),
      });
    } else {
      patchAsset(question.key, kind, { ...asset, mode: 'upload' });
    }
  }

  function setAssetPath(question: ImportQuestionDraft, kind: AssetKind, value: string) {
    const asset = getAsset(question, kind);
    patchAsset(question.key, kind, { ...asset, mode: 'path', path: value });
  }

  function clearAsset(question: ImportQuestionDraft, kind: AssetKind) {
    const asset = getAsset(question, kind);
    if (asset.assetKey) {
      void del(asset.assetKey, store).catch(() => undefined);
      revokeUrl(asset.assetKey);
    }
    patchAsset(question.key, kind, emptyAsset());
  }

  function addQuestion() {
    setSaveEnabled(true);
    const next = createQuestion(questions.length + 1);
    setQuestions([...questions, next]);
    setExpandedKey(next.key);
  }

  function removeQuestion(question: ImportQuestionDraft) {
    for (const kind of ASSET_KINDS) {
      const asset = getAsset(question, kind);
      if (asset.assetKey) {
        void del(asset.assetKey, store).catch(() => undefined);
        revokeUrl(asset.assetKey);
      }
    }
    setSaveEnabled(true);
    setQuestions(renumberQuestions(questions.filter((item) => item.key !== question.key)));
    if (expandedKey === question.key) setExpandedKey(null);
  }

  function changeType(question: ImportQuestionDraft, type: 'single' | 'short') {
    const previousDefault = question.type === 'single' ? 3 : 10;
    const nextDefault = type === 'single' ? 3 : 10;
    patchQuestion(question.key, {
      type,
      answer: '',
      score: question.score === previousDefault ? nextDefault : question.score,
    });
  }

  function toggleKpFor(questionKey: string, kpId: string) {
    setSaveEnabled(true);
    setQuestions((current) =>
      current.map((question) => {
        if (question.key !== questionKey) return question;
        const has = question.kpIds.includes(kpId);
        return {
          ...question,
          kpIds: has
            ? question.kpIds.filter((id) => id !== kpId)
            : [...question.kpIds, kpId],
        };
      }),
    );
  }

  async function clearDraft() {
    setClearOpen(false);
    try {
      await del(DRAFT_KEY, store);
    } catch (error: unknown) {
      console.error('[知星] 删除草稿失败', error);
    }
    const keys = new Set<string>();
    for (const question of questions) {
      for (const kind of ASSET_KINDS) {
        const asset = getAsset(question, kind);
        if (asset.assetKey) keys.add(asset.assetKey);
      }
    }
    for (const key of keys) {
      try {
        await del(key, store);
      } catch {
        /* 忽略单个图片删除失败 */
      }
      revokeUrl(key);
    }
    setMeta(createEmptyMeta());
    setQuestions([createQuestion(1)]);
    setIdTouched(false);
    setExpandedKey(null);
    setKpSheetKey(null);
    setStep(1);
    setSavedAt(null);
    setSaving(false);
    setSaveEnabled(false);
    toast('草稿已清空');
  }

  /* ---------------- 导出操作 ---------------- */

  async function copyFile(file: ExportFile) {
    const ok = await copyText(file.text);
    if (!ok) {
      toast('复制失败，请展开 JSON 手动选择');
      return;
    }
    setCopied(file.name);
    window.setTimeout(() => {
      setCopied((current) => (current === file.name ? null : current));
    }, 1600);
    toast(`已复制 ${file.name}`);
  }

  function downloadText(file: ExportFile) {
    downloadBlob(
      file.name,
      new Blob([file.text], { type: 'application/json;charset=utf-8' }),
    );
  }

  async function downloadAll() {
    if (!canExport) return;
    for (const file of bundle.files) {
      downloadText(file);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 160);
      });
    }
    toast('已开始下载全部 JSON；若浏览器拦截，请逐个下载');
  }

  async function downloadImage(image: ExportImageFile) {
    try {
      const blob = await get<Blob>(image.assetKey, store);
      if (!(blob instanceof Blob)) {
        toast('图片文件丢失，请重新上传');
        return;
      }
      downloadBlob(image.fileName, blob);
    } catch (error: unknown) {
      console.error('[知星] 读取图片失败', error);
      toast('读取图片失败');
    }
  }

  function goToQuestions() {
    const paperErrors = validation.errors.filter((item) => item.scope === 'paper');
    if (paperErrors.length > 0) {
      toast(`还有 ${paperErrors.length} 处卷子信息需要修正`);
      return;
    }
    setStep(2);
  }

  /* ---------------- 渲染 ---------------- */

  return (
    <div className="view imp-view">
      <PageHeader
        title="录入真题"
        subtitle="不写代码，把一套图片真题接进题库"
        back={() => navigate('/')}
      />

      <div className="imp-topline">
        <span className={`imp-draft${saving ? ' is-saving' : ''}`}>{draftLabel}</span>
        <button type="button" className="imp-link imp-link--danger" onClick={() => setClearOpen(true)}>
          清空草稿
        </button>
      </div>

      <div className="imp-steps">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`imp-step${step === item.id ? ' is-on' : ''}${
              step > item.id ? ' is-done' : ''
            }`}
            onClick={() => setStep(item.id)}
          >
            <i>{step > item.id ? <Icon name="check" size={12} /> : item.id}</i>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {step === 1 && (
        <section className="imp-panel">
          <SectionHead title="卷子信息" hint="带 * 的必填；id 会作为文件名和题库主键。" />
          <div className="imp-grid imp-grid--2">
            <Field label="标题" required wide error={paperError('title')}>
              <input
                className={controlClass('imp-input', paperError('title'))}
                value={meta.title}
                onChange={(event) => updateMeta({ title: event.currentTarget.value })}
                placeholder="例如：重庆市 2026 年普通高中学业水平选择性考试 化学"
              />
            </Field>

            <Field label="简称" required error={paperError('shortTitle')}>
              <input
                className={controlClass('imp-input', paperError('shortTitle'))}
                value={meta.shortTitle}
                onChange={(event) => updateMeta({ shortTitle: event.currentTarget.value })}
                placeholder="例如：2026 重庆化学"
              />
            </Field>

            <Field label="科目" required error={paperError('subjectId')}>
              <select
                className={controlClass('imp-select', paperError('subjectId'))}
                value={meta.subjectId}
                onChange={(event) => changeSubject(event.currentTarget.value)}
              >
                <option value="">请选择科目</option>
                {content.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="地区"
              required
              error={paperError('region')}
              hint="省或市均可，例如 重庆、重庆市、北京。"
            >
              <input
                className={controlClass('imp-input', paperError('region'))}
                value={meta.region}
                onChange={(event) => updateMeta({ region: event.currentTarget.value })}
                placeholder="重庆"
                list="imp-region-options"
              />
              <datalist id="imp-region-options">
                {REGION_NAMES.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>

            <Field label="年份" required error={paperError('year')}>
              <input
                className={controlClass('imp-input', paperError('year'))}
                type="number"
                min={2000}
                max={2100}
                step={1}
                value={meta.year || ''}
                onChange={(event) =>
                  updateMeta({ year: Number(event.currentTarget.value) || 0 })
                }
                placeholder="2026"
              />
            </Field>

            <Field label="总分" required error={paperError('score')}>
              <input
                className={controlClass('imp-input', paperError('score'))}
                type="number"
                min={0}
                step={1}
                value={meta.score || ''}
                onChange={(event) =>
                  updateMeta({ score: Number(event.currentTarget.value) || 0 })
                }
                placeholder="100"
              />
            </Field>

            <Field label="时长（分钟）" required error={paperError('durationMinutes')}>
              <input
                className={controlClass('imp-input', paperError('durationMinutes'))}
                type="number"
                min={1}
                step={1}
                value={meta.durationMinutes || ''}
                onChange={(event) =>
                  updateMeta({ durationMinutes: Number(event.currentTarget.value) || 0 })
                }
                placeholder="75"
              />
            </Field>

            <Field
              label="试卷 id"
              required
              wide
              error={paperError('id')}
              hint="只含小写字母、数字、短横线；不能与已有试卷重复。"
            >
              <div className="imp-id-row">
                <input
                  className={controlClass('imp-input', paperError('id'))}
                  value={meta.id}
                  onChange={(event) => {
                    setIdTouched(true);
                    updateMeta({ id: event.currentTarget.value });
                  }}
                  placeholder="例如 cq-2026-chemistry"
                />
                <button type="button" className="btn btn--ghost btn--sm" onClick={regenerateId}>
                  <Icon name="refresh" size={14} />
                  重新生成
                </button>
              </div>
            </Field>

            <Field
              label="来源说明"
              wide
              hint="留空时导出为「个人整理」。"
            >
              <input
                className="imp-input"
                value={meta.source}
                onChange={(event) => updateMeta({ source: event.currentTarget.value })}
                placeholder="例如：重庆市教育考试院"
              />
            </Field>

            <Field label="备注" wide hint="会写进 paper.json 的 source.note。">
              <textarea
                className="imp-textarea"
                value={meta.note}
                onChange={(event) => updateMeta({ note: event.currentTarget.value })}
                placeholder="例如：图片来自网络，仅供个人练习。"
              />
            </Field>
          </div>

          <div className="imp-actions">
            <span className="imp-hint">
              共 {questions.length} 题 · {meta.score} 分 · {meta.durationMinutes} 分钟
            </span>
            <button type="button" className="btn btn--primary" onClick={goToQuestions}>
              下一步：逐题录入
              <Icon name="chevron-right" size={15} />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="imp-panel">
          <SectionHead
            title="逐题录入"
            hint={`${questions.length} 题 · 合计 ${validation.totalScore} 分`}
            action={
              <button type="button" className="btn btn--ghost btn--sm" onClick={addQuestion}>
                <Icon name="plus" size={14} />
                加一题
              </button>
            }
          />

          {questions.length === 0 ? (
            <EmptyState
              icon="book"
              title="还没有题目"
              desc="先加一道题，再填题干图、答案和知识点。"
              action={
                <button type="button" className="btn btn--primary btn--sm" onClick={addQuestion}>
                  <Icon name="plus" size={14} />
                  添加第 1 题
                </button>
              }
            />
          ) : (
            <div>
              {questions.map((question) => {
                const expanded = expandedKey === question.key;
                const qIssues = issues.filter(
                  (item) => item.scope === 'question' && item.number === question.number,
                );
                const hasError = qIssues.some((item) => item.level === 'error');
                const thumb = previewFor(question.stem);
                const selectedKps = question.kpIds
                  .map((kpId) => content.kpsById.get(kpId))
                  .filter((kp) => kp !== undefined);

                return (
                  <div className="imp-q" key={question.key}>
                    <button
                      type="button"
                      className={`imp-q-head${expanded ? ' is-open' : ''}`}
                      onClick={() => setExpandedKey(expanded ? null : question.key)}
                    >
                      <span className="imp-q-no">{question.number}</span>
                      <span className="imp-q-main">
                        <span className="imp-q-title">
                          {question.type === 'single' ? '单选题' : '综合题'} · {question.score} 分
                        </span>
                        <span className="imp-q-meta">
                          {question.kpIds.length} 个知识点 · 难度 {question.difficulty}
                          {question.stem.mode === 'none' ? ' · 缺题干图' : ''}
                        </span>
                      </span>
                      {thumb && (
                        <img
                          key={thumb}
                          className="imp-q-thumb"
                          src={thumb}
                          alt=""
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                      )}
                      {hasError && <span className="imp-q-badge">待修正</span>}
                      <Icon
                        className={`imp-chev${expanded ? ' is-open' : ''}`}
                        name="chevron-right"
                        size={16}
                      />
                    </button>

                    {expanded && (
                      <div className="imp-q-body">
                        {qIssues.length > 0 && (
                          <div className="imp-q-issues">
                            {qIssues.slice(0, 4).map((issue, index) => (
                              <span
                                key={`${issue.level}-${issue.field ?? ''}-${index}`}
                                className={`imp-q-issue${issue.level === 'warn' ? ' is-warn' : ''}`}
                              >
                                <Icon
                                  name={issue.level === 'error' ? 'x' : 'flame'}
                                  size={12}
                                />
                                {issue.message}
                              </span>
                            ))}
                            {qIssues.length > 4 && (
                              <span className="imp-q-issue">
                                还有 {qIssues.length - 4} 条，去校验页查看全部
                              </span>
                            )}
                          </div>
                        )}

                        <div className="imp-row2">
                          <Field label="题型">
                            <div className="imp-seg">
                              <button
                                type="button"
                                className={question.type === 'single' ? 'is-on' : ''}
                                onClick={() => changeType(question, 'single')}
                              >
                                单选
                              </button>
                              <button
                                type="button"
                                className={question.type === 'short' ? 'is-on' : ''}
                                onClick={() => changeType(question, 'short')}
                              >
                                综合
                              </button>
                            </div>
                          </Field>
                          <Field
                            label="分值"
                            required
                            error={questionError(question.number, 'score')}
                          >
                            <input
                              className={controlClass(
                                'imp-input',
                                questionError(question.number, 'score'),
                              )}
                              type="number"
                              min={0}
                              step={1}
                              value={question.score || ''}
                              onChange={(event) =>
                                patchQuestion(question.key, {
                                  score: Number(event.currentTarget.value) || 0,
                                })
                              }
                            />
                          </Field>
                        </div>

                        <Field
                          label="难度"
                          error={questionError(question.number, 'difficulty')}
                          hint="1 送分 · 5 压轴"
                        >
                          <div className="imp-seg imp-seg--5">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <button
                                key={value}
                                type="button"
                                className={question.difficulty === value ? 'is-on' : ''}
                                onClick={() =>
                                  patchQuestion(question.key, { difficulty: value })
                                }
                              >
                                {value}
                              </button>
                            ))}
                          </div>
                        </Field>

                        {question.type === 'single' ? (
                          <Field
                            label="答案"
                            required
                            error={questionError(question.number, 'answer')}
                          >
                            <div className="imp-seg imp-seg--4">
                              {['A', 'B', 'C', 'D'].map((letter) => (
                                <button
                                  key={letter}
                                  type="button"
                                  className={question.answer === letter ? 'is-on' : ''}
                                  onClick={() =>
                                    patchQuestion(question.key, { answer: letter })
                                  }
                                >
                                  {letter}
                                </button>
                              ))}
                            </div>
                          </Field>
                        ) : (
                          <p className="imp-hint">
                            综合题不填选项答案；答案与评分说明请放在答案图或解析图里。
                          </p>
                        )}

                        <Field
                          label="知识点"
                          error={questionError(question.number, 'kpIds')}
                          hint="建议 1~3 个；学习统计会按知识点累计。"
                        >
                          <div className="imp-chips">
                            {selectedKps.map((kp) => (
                              <span className="chip is-on" key={kp.id}>
                                {kp.name}
                                <button
                                  type="button"
                                  aria-label={`移除 ${kp.name}`}
                                  onClick={() => toggleKpFor(question.key, kp.id)}
                                >
                                  <Icon name="close" size={11} />
                                </button>
                              </span>
                            ))}
                            {question.kpIds
                              .filter((kpId) => !content.kpsById.has(kpId))
                              .map((kpId) => (
                                <span className="chip imp-chip-bad" key={kpId}>
                                  未知：{kpId}
                                  <button
                                    type="button"
                                    aria-label={`移除 ${kpId}`}
                                    onClick={() => toggleKpFor(question.key, kpId)}
                                  >
                                    <Icon name="close" size={11} />
                                  </button>
                                </span>
                              ))}
                            <button
                              type="button"
                              className="chip imp-chip-add"
                              onClick={() => {
                                setKpSheetKey(question.key);
                                setKpSearch('');
                              }}
                            >
                              <Icon name="search" size={12} />
                              选择知识点
                            </button>
                          </div>
                        </Field>

                        <Field label="标签" hint="用逗号、顿号或空格分隔。">
                          <input
                            className="imp-input"
                            value={question.tagsText}
                            onChange={(event) =>
                              patchQuestion(question.key, {
                                tagsText: event.currentTarget.value,
                              })
                            }
                            placeholder="重庆, 2026, 化学"
                          />
                          {parseTags(question.tagsText).length > 0 && (
                            <div className="imp-chips">
                              {parseTags(question.tagsText).map((tag) => (
                                <span className="chip" key={tag}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </Field>

                        <ImageField
                          title="题干图"
                          required
                          asset={question.stem}
                          src={previewFor(question.stem)}
                          suggestedPath={suggestedAssetPath(
                            meta.id,
                            question.number,
                            'stem',
                          )}
                          hint="必填。上传后会存进本机草稿。"
                          onPick={(file) => void uploadAsset(question, 'stem', file)}
                          onMode={(mode) => switchAssetMode(question, 'stem', mode)}
                          onPath={(value) => setAssetPath(question, 'stem', value)}
                          onClear={() => clearAsset(question, 'stem')}
                        />

                        <ImageField
                          title="解析图"
                          asset={question.analysis}
                          src={previewFor(question.analysis)}
                          suggestedPath={suggestedAssetPath(
                            meta.id,
                            question.number,
                            'analysis',
                          )}
                          hint="选填。"
                          onPick={(file) => void uploadAsset(question, 'analysis', file)}
                          onMode={(mode) => switchAssetMode(question, 'analysis', mode)}
                          onPath={(value) => setAssetPath(question, 'analysis', value)}
                          onClear={() => clearAsset(question, 'analysis')}
                        />

                        {question.type === 'short' && (
                          <ImageField
                            title="答案图"
                            asset={question.answerImage}
                            src={previewFor(question.answerImage)}
                            suggestedPath={suggestedAssetPath(
                              meta.id,
                              question.number,
                              'answerImage',
                            )}
                            hint="选填；有答案图时 answerKind 记为 official。"
                            onPick={(file) =>
                              void uploadAsset(question, 'answerImage', file)
                            }
                            onMode={(mode) =>
                              switchAssetMode(question, 'answerImage', mode)
                            }
                            onPath={(value) =>
                              setAssetPath(question, 'answerImage', value)
                            }
                            onClear={() => clearAsset(question, 'answerImage')}
                          />
                        )}

                        <div className="imp-q-foot">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => removeQuestion(question)}
                          >
                            <Icon name="trash" size={13} />
                            删除本题
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="imp-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>
              <Icon name="arrow-left" size={15} />
              上一步
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setStep(3)}>
              去校验
              <Icon name="chevron-right" size={15} />
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <>
          <section className="imp-panel">
            <SectionHead
              title="校验结果"
              hint="错误必须修正；警告可以带病导出。"
              action={
                <span className="imp-hint">
                  {validation.errors.length} 错误 · {validation.warnings.length} 警告
                </span>
              }
            />
            <div className="overview-strip">
              <StatTile label="题目" value={questions.length} sub="题" />
              <StatTile
                label="分值合计"
                value={`${validation.totalScore} / ${meta.score}`}
                sub="题面 / 总分"
              />
              <StatTile label="上传图片" value={bundle.imageFiles.length} sub="张" />
            </div>
            {issues.length === 0 ? (
              <div className="imp-ok">
                <Icon name="check" size={16} />
                校验通过，可以导出。
              </div>
            ) : (
              <div className="imp-issues">
                {issues.map((issue, index) => (
                  <div
                    key={`${issue.level}-${issue.scope}-${issue.number ?? 0}-${
                      issue.field ?? ''
                    }-${index}`}
                    className={`imp-issue${issue.level === 'error' ? ' is-error' : ' is-warn'}`}
                  >
                    <Icon name={issue.level === 'error' ? 'x' : 'flame'} size={14} />
                    <span>
                      {issue.scope === 'question' ? `第 ${issue.number} 题：` : ''}
                      {issue.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="imp-panel">
            <SectionHead
              title="导出 JSON"
              hint="内容已完整生成；先复制或下载，再放进仓库。"
              action={
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={!canExport}
                  onClick={() => void downloadAll()}
                >
                  <Icon name="download" size={14} />
                  全部下载
                </button>
              }
            />
            {!canExport && (
              <div className="imp-note">
                <strong>还不能导出：</strong>先修正上面的 {validation.errors.length} 个错误。
              </div>
            )}
            <div className="imp-files">
              {bundle.files.map((file) => (
                <div className="imp-file" key={file.name}>
                  <div className="imp-file-head">
                    <Icon name={file.name === 'paper.json' ? 'book' : 'grid'} size={15} />
                    <span className="imp-file-name">{file.name}</span>
                    <span className="imp-file-size">{file.text.length} 字符</span>
                    <div className="imp-file-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={!canExport}
                        onClick={() => void copyFile(file)}
                      >
                        {copied === file.name ? '已复制' : '复制'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={!canExport}
                        onClick={() => downloadText(file)}
                      >
                        <Icon name="download" size={13} />
                        下载
                      </button>
                    </div>
                  </div>
                  <details className="imp-file-details">
                    <summary>查看完整 JSON</summary>
                    <pre className="imp-json">{file.text}</pre>
                  </details>
                </div>
              ))}
            </div>
          </section>

          <section className="imp-panel">
            <SectionHead
              title="图片文件"
              hint={`${bundle.imageFiles.length} 张上传图片需要另存到 public 目录`}
            />
            {bundle.imageFiles.length === 0 ? (
              <p className="imp-hint">
                没有上传图片。手填路径的图片不会被打包，请按路径自行放置。
              </p>
            ) : (
              <div>
                {bundle.imageFiles.map((image) => {
                  const url = assetUrls.current.get(image.assetKey) ?? '';
                  return (
                    <div className="imp-img-row" key={image.assetKey}>
                      {url ? (
                        <img src={url} alt="" />
                      ) : (
                        <span className="imp-q-thumb" />
                      )}
                      <div className="imp-img-row-main">
                        <span className="imp-file-name">{image.fileName}</span>
                        <span className="imp-hint">{image.jsonPath}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void downloadImage(image)}
                      >
                        <Icon name="download" size={13} />
                        下载
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="imp-panel">
            <SectionHead
              title="放到哪里"
              hint="内容是静态打包的，导出不会自动生效。"
            />
            <pre className="imp-tree">{treeText}</pre>
            <ol className="imp-list">
              <li>
                把 <code>paper.json</code> 和所有 <code>qNN.json</code> 放进{' '}
                <code>content/papers/{exportId}/</code>。
              </li>
              <li>
                把上传的图片按上面的文件名放进 <code>public/papers/{exportId}/</code>
                ；手填路径的图片按你填的路径放。
              </li>
              <li>
                在项目根目录运行 <code>npm run check</code>，再重新构建（
                <code>npm run build</code>）。
              </li>
              <li>
                刷新页面，新试卷才会出现在科目页；已有试卷请勿改 id，否则学习记录会对不上。
              </li>
            </ol>
            <div className="imp-note">
              <strong>注意：</strong>
              本向导不能直接写入仓库，也不能让新卷子立刻在应用里生效。导出后必须把文件放进仓库并重新构建。
            </div>
          </section>

          <div className="imp-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep(2)}>
              <Icon name="arrow-left" size={15} />
              上一步
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/')}>
              返回首页
            </button>
          </div>
        </>
      )}

      <Sheet
        open={kpSheetKey !== null}
        onClose={() => setKpSheetKey(null)}
        title={`选择知识点${kpSheetQuestion ? ` · 第 ${kpSheetQuestion.number} 题` : ''}`}
        footer={
          <div className="imp-kp-foot">
            <span>已选 {kpSheetQuestion?.kpIds.length ?? 0} 个</span>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setKpSheetKey(null)}
            >
              完成
            </button>
          </div>
        }
      >
        <input
          className="imp-input imp-kp-search"
          value={kpSearch}
          onChange={(event) => setKpSearch(event.currentTarget.value)}
          placeholder="搜索名称、板块或 id"
        />
        <div className="imp-kp-list">
          {kpList.map((kp) => {
            const on = kpSheetQuestion?.kpIds.includes(kp.id) ?? false;
            return (
              <button
                type="button"
                key={kp.id}
                className={`imp-kp-row${on ? ' is-on' : ''}`}
                onClick={() => {
                  if (kpSheetKey) toggleKpFor(kpSheetKey, kp.id);
                }}
              >
                <span className="imp-kp-info">
                  <span className="imp-kp-name">{kp.name}</span>
                  <span className="imp-kp-meta">
                    {kp.group ? `${kp.group} · ` : ''}
                    {kp.id}
                  </span>
                </span>
                <Icon
                  className="imp-kp-check"
                  name={on ? 'check' : 'plus'}
                  size={16}
                />
              </button>
            );
          })}
          {kpList.length === 0 && (
            <p className="imp-hint">没有匹配的知识点。换个关键词试试。</p>
          )}
        </div>
      </Sheet>

      <Sheet
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="清空草稿？"
        footer={
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setClearOpen(false)}
            >
              取消
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void clearDraft()}>
              清空
            </button>
          </div>
        }
      >
        <p className="imp-hint">
          本机保存的卷子信息、题目和已上传图片都会被删除，无法恢复。已经导出的文件不受影响。
        </p>
      </Sheet>
    </div>
  );
}

export default PaperImport;
