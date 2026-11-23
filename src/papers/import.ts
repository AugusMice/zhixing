import { pad2, uid } from '../lib/format';
import type { Paper, PaperQuestion, PaperSection } from './index';

/* ============================================================
 * 试卷录入向导 · 纯逻辑
 * 这里只做「草稿数据 -> 校验 -> 导出 JSON」的转换，
 * 不碰 DOM、IndexedDB 或 React，方便单独推演和测试。
 * ============================================================ */

export type ImportQuestionType = 'single' | 'short';
export type ImportAssetMode = 'none' | 'upload' | 'path';
export type AssetKind = 'stem' | 'analysis' | 'answerImage';
export type IssueLevel = 'error' | 'warn';

export const DRAFT_KEY = 'paper-draft';
export const DRAFT_VERSION = 1;
export const ASSET_KINDS: readonly AssetKind[] = ['stem', 'analysis', 'answerImage'];

/** 地区 -> 拼音缩写。省份用常见两字母缩写；有歧义时用三字母，宁可长一点也不撞车。 */
export const REGION_ABBR: Readonly<Record<string, string>> = {
  北京: 'bj',
  上海: 'sh',
  天津: 'tj',
  重庆: 'cq',
  河北: 'heb',
  山西: 'sx',
  内蒙古: 'nm',
  辽宁: 'ln',
  吉林: 'jl',
  黑龙江: 'hlj',
  江苏: 'js',
  浙江: 'zj',
  安徽: 'ah',
  福建: 'fj',
  江西: 'jx',
  山东: 'sd',
  河南: 'hen',
  湖北: 'hb',
  湖南: 'hun',
  广东: 'gd',
  广西: 'gx',
  海南: 'hai',
  四川: 'sc',
  贵州: 'gzh',
  云南: 'yn',
  西藏: 'xz',
  陕西: 'shx',
  甘肃: 'gs',
  青海: 'qh',
  宁夏: 'nx',
  新疆: 'xj',
  香港: 'hk',
  澳门: 'mo',
  台湾: 'tw',
  广州: 'gz',
  深圳: 'sz',
  成都: 'cd',
  杭州: 'hz',
  南京: 'nj',
  武汉: 'wh',
  西安: 'xa',
  长沙: 'cs',
  郑州: 'zz',
  济南: 'jn',
  青岛: 'qd',
  合肥: 'hf',
  福州: 'fz',
  厦门: 'xm',
  南昌: 'nc',
  昆明: 'km',
  贵阳: 'gy',
  南宁: 'nn',
  海口: 'haik',
  太原: 'ty',
  石家庄: 'sjz',
  沈阳: 'sy',
  长春: 'cc',
  哈尔滨: 'hrb',
  大连: 'dl',
  苏州: 'suz',
  无锡: 'wx',
  宁波: 'nb',
  温州: 'wz',
  佛山: 'fs',
  东莞: 'dg',
  珠海: 'zh',
  汕头: 'st',
  洛阳: 'ly',
  宜昌: 'yc',
  襄阳: 'xy',
  株洲: 'zhu',
  岳阳: 'yy',
  绵阳: 'my',
  宜宾: 'yb',
  遵义: 'zy',
  大理: 'dali',
};

export const REGION_NAMES: readonly string[] = Object.keys(REGION_ABBR);

export const PAPER_ID_RE = /^[a-z0-9-]+$/;

const REGION_SUFFIXES: readonly string[] = [
  '壮族自治区',
  '回族自治区',
  '维吾尔自治区',
  '特别行政区',
  '自治区',
  '省',
  '市',
];

function stripRegionSuffix(value: string): string {
  for (const suffix of REGION_SUFFIXES) {
    if (value.length > suffix.length && value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

/** 「重庆市」「内蒙古自治区」都能识别；认不出的地区退化为 ASCII 或 cn。 */
export function regionAbbr(region: string): string {
  const clean = region.trim().replace(/\s+/g, '');
  if (!clean) return '';
  const base = stripRegionSuffix(clean);
  const hit = REGION_ABBR[base] ?? REGION_ABBR[clean];
  if (hit) return hit;
  const ascii = base.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ascii || 'cn';
}

export function subjectCode(subjectId: string): string {
  return subjectId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface ImportAssetDraft {
  mode: ImportAssetMode;
  /** 上传时的原始文件名，用于展示与下载 */
  fileName: string;
  /** 手填的相对路径，例如 papers/xxx/q01-stem.png */
  path: string;
  /** IndexedDB 里的 key，形如 paper-asset:<paperId>:q01-stem */
  assetKey: string;
  /** 上传图片的扩展名，不含点 */
  ext: string;
  /** 草稿恢复时发现 blob 不在了 */
  missing: boolean;
}

export interface ImportQuestionDraft {
  /** 仅用于 React 列表，不进入导出 JSON */
  key: string;
  number: number;
  type: ImportQuestionType;
  score: number;
  /** 单选 A/B/C/D；综合题留空 */
  answer: string;
  kpIds: string[];
  difficulty: number;
  /** 原始输入，导出时按逗号/顿号/空白拆分 */
  tagsText: string;
  stem: ImportAssetDraft;
  analysis: ImportAssetDraft;
  answerImage: ImportAssetDraft;
}

export interface ImportPaperMeta {
  id: string;
  title: string;
  shortTitle: string;
  subjectId: string;
  region: string;
  year: number;
  score: number;
  durationMinutes: number;
  source: string;
  note: string;
}

export interface ImportDraft {
  version: 1;
  savedAt: number;
  meta: ImportPaperMeta;
  questions: ImportQuestionDraft[];
}

export interface ImportIssue {
  level: IssueLevel;
  scope: 'paper' | 'question';
  /** 卷子字段名，或题目字段名（stem/answer/kpIds/score/...） */
  field?: string;
  /** 题号，仅 scope=question 时有值 */
  number?: number;
  message: string;
}

export interface ImportValidation {
  errors: ImportIssue[];
  warnings: ImportIssue[];
  totalScore: number;
}

export interface ImportContext {
  paperIds: ReadonlySet<string>;
  subjectIds: ReadonlySet<string>;
  kpIds: ReadonlySet<string>;
}

export interface ExportFile {
  name: string;
  text: string;
}

export interface ExportImageFile {
  fileName: string;
  jsonPath: string;
  assetKey: string;
}

export interface ExportBundle {
  paper: Paper;
  questions: PaperQuestion[];
  files: ExportFile[];
  imageFiles: ExportImageFile[];
}

/* ------------------------------ 草稿构造 ------------------------------ */

export function emptyAsset(): ImportAssetDraft {
  return { mode: 'none', fileName: '', path: '', assetKey: '', ext: '', missing: false };
}

export function createEmptyMeta(): ImportPaperMeta {
  return {
    id: '',
    title: '',
    shortTitle: '',
    subjectId: '',
    region: '',
    year: new Date().getFullYear(),
    score: 100,
    durationMinutes: 75,
    source: '',
    note: '',
  };
}

export function createQuestion(
  number: number,
  type: ImportQuestionType = 'single',
): ImportQuestionDraft {
  return {
    key: uid('q'),
    number,
    type,
    score: type === 'single' ? 3 : 10,
    answer: '',
    kpIds: [],
    difficulty: 3,
    tagsText: '',
    stem: emptyAsset(),
    analysis: emptyAsset(),
    answerImage: emptyAsset(),
  };
}

export function renumberQuestions(questions: ImportQuestionDraft[]): ImportQuestionDraft[] {
  return questions.map((question, index) => ({ ...question, number: index + 1 }));
}

export function suggestPaperId(meta: ImportPaperMeta): string {
  const abbr = regionAbbr(meta.region);
  const subject = subjectCode(meta.subjectId);
  if (!abbr || !subject) return '';
  const year =
    Number.isInteger(meta.year) && meta.year >= 2000 && meta.year <= 2100
      ? meta.year
      : new Date().getFullYear();
  return `${abbr}-${year}-${subject}`;
}

export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(/[,，、;；\s]+/)) {
    const tag = raw.trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

/* ------------------------------ 图片路径与 key ------------------------------ */

export function assetSuffix(kind: AssetKind): string {
  if (kind === 'stem') return 'stem';
  if (kind === 'analysis') return 'analysis';
  return 'answer';
}

export function assetKeyFor(paperId: string, number: number, kind: AssetKind): string {
  const safeId = paperId.trim() || 'draft';
  return `paper-asset:${safeId}:q${pad2(number)}-${assetSuffix(kind)}`;
}

export function suggestedAssetPath(
  paperId: string,
  number: number,
  kind: AssetKind,
  ext = 'png',
): string {
  const safeId = paperId.trim() || 'new-paper';
  return `papers/${safeId}/q${pad2(number)}-${assetSuffix(kind)}.${ext || 'png'}`;
}

export function normalizeAssetPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/|\/)+/, '');
}

export function assetPath(
  paperId: string,
  number: number,
  kind: AssetKind,
  asset: ImportAssetDraft,
): string {
  if (asset.mode === 'path') return normalizeAssetPath(asset.path);
  if (asset.mode === 'upload') {
    // blob 丢失时不要导出悬空路径；校验里提示的「导出时会留空」要兑现。
    if (!asset.assetKey || asset.missing) return '';
    return suggestedAssetPath(paperId, number, kind, asset.ext || 'png');
  }
  return '';
}

export function assetFileName(number: number, kind: AssetKind, asset: ImportAssetDraft): string {
  return `q${pad2(number)}-${assetSuffix(kind)}.${asset.ext || 'png'}`;
}

export function imageExtension(fileName: string, mime: string): string {
  const dot = fileName.lastIndexOf('.');
  const raw = dot >= 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  if (raw === 'jpeg') return 'jpg';
  if (raw.length >= 2 && raw.length <= 5) return raw;
  const fromMime = mime.startsWith('image/') ? mime.slice(6).toLowerCase() : '';
  if (fromMime === 'jpeg') return 'jpg';
  if (fromMime === 'svg+xml') return 'svg';
  if (fromMime.length >= 2 && fromMime.length <= 5) return fromMime;
  return 'png';
}

/* ------------------------------ 草稿读取 ------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readInt(value: unknown, fallback: number): number {
  return Math.round(readNumber(value, fallback));
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function isQuestionType(value: unknown): value is ImportQuestionType {
  return value === 'single' || value === 'short';
}

function isAssetMode(value: unknown): value is ImportAssetMode {
  return value === 'none' || value === 'upload' || value === 'path';
}

function parseAsset(value: unknown): ImportAssetDraft {
  if (!isRecord(value)) return emptyAsset();
  const mode = isAssetMode(value.mode) ? value.mode : 'none';
  return {
    mode,
    fileName: readString(value.fileName),
    path: readString(value.path),
    assetKey: readString(value.assetKey),
    ext: readString(value.ext),
    missing: value.missing === true,
  };
}

function parseQuestion(value: unknown, index: number): ImportQuestionDraft {
  if (!isRecord(value)) return createQuestion(index + 1);
  const type = isQuestionType(value.type) ? value.type : 'single';
  const rawDifficulty = readInt(value.difficulty, 3);
  const difficulty = rawDifficulty >= 1 && rawDifficulty <= 5 ? rawDifficulty : 3;
  return {
    key: readString(value.key) || uid('q'),
    number: index + 1,
    type,
    score: readNumber(value.score, type === 'single' ? 3 : 10),
    answer: readString(value.answer),
    kpIds: readStringArray(value.kpIds),
    difficulty,
    tagsText: readString(value.tagsText),
    stem: parseAsset(value.stem),
    analysis: parseAsset(value.analysis),
    answerImage: parseAsset(value.answerImage),
  };
}

function parseMeta(value: Record<string, unknown>): ImportPaperMeta {
  return {
    id: readString(value.id),
    title: readString(value.title),
    shortTitle: readString(value.shortTitle),
    subjectId: readString(value.subjectId),
    region: readString(value.region),
    year: readInt(value.year, new Date().getFullYear()),
    score: readNumber(value.score, 100),
    durationMinutes: readInt(value.durationMinutes, 75),
    source: readString(value.source),
    note: readString(value.note),
  };
}

/** 解析 IndexedDB 里的未知草稿；版本或结构不对就当作没有草稿。 */
export function parseDraft(value: unknown): ImportDraft | null {
  if (!isRecord(value)) return null;
  if (value.version !== DRAFT_VERSION) return null;
  if (!isRecord(value.meta)) return null;
  const questions = Array.isArray(value.questions)
    ? value.questions.map((item, index) => parseQuestion(item, index))
    : [];
  return {
    version: 1,
    savedAt: readNumber(value.savedAt, Date.now()),
    meta: parseMeta(value.meta),
    questions: questions.length > 0 ? questions : [createQuestion(1)],
  };
}

/* ------------------------------ 校验 ------------------------------ */

function requiredAssetIssue(asset: ImportAssetDraft, label: string): string | null {
  if (asset.mode === 'none') return `${label}未填写`;
  if (asset.mode === 'upload') {
    if (!asset.assetKey) return `${label}上传失败，请重新选择`;
    if (asset.missing) return `${label}文件已丢失，请重新上传`;
    return null;
  }
  if (!normalizeAssetPath(asset.path)) return `${label}路径不能为空`;
  return null;
}

function optionalAssetIssue(asset: ImportAssetDraft, label: string): string | null {
  if (asset.mode === 'upload' && (!asset.assetKey || asset.missing)) {
    return `${label}文件已丢失，导出时会留空`;
  }
  if (asset.mode === 'path' && !normalizeAssetPath(asset.path)) {
    return `${label}路径为空，导出时会留空`;
  }
  return null;
}

function pathPrefixIssue(asset: ImportAssetDraft, label: string): string | null {
  if (asset.mode !== 'path') return null;
  const path = normalizeAssetPath(asset.path);
  if (!path) return null;
  if (path.startsWith('papers/')) return null;
  return `${label}路径建议以 papers/ 开头`;
}

export function validateDraft(
  meta: ImportPaperMeta,
  questions: ImportQuestionDraft[],
  ctx: ImportContext,
): ImportValidation {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  const paperError = (field: string, message: string) => {
    errors.push({ level: 'error', scope: 'paper', field, message });
  };
  const paperWarn = (field: string, message: string) => {
    warnings.push({ level: 'warn', scope: 'paper', field, message });
  };
  const questionError = (number: number, field: string, message: string) => {
    errors.push({ level: 'error', scope: 'question', number, field, message });
  };
  const questionWarn = (number: number, field: string, message: string) => {
    warnings.push({ level: 'warn', scope: 'question', number, field, message });
  };

  if (!meta.title.trim()) paperError('title', '标题不能为空');
  if (!meta.shortTitle.trim()) paperError('shortTitle', '简称不能为空');
  if (!meta.subjectId.trim()) paperError('subjectId', '请选择科目');
  else if (!ctx.subjectIds.has(meta.subjectId)) paperError('subjectId', '这个科目不存在');
  if (!meta.region.trim()) paperError('region', '地区不能为空');
  if (!Number.isInteger(meta.year) || meta.year < 2000 || meta.year > 2100) {
    paperError('year', '年份需在 2000~2100 之间');
  }
  if (!Number.isFinite(meta.score) || meta.score <= 0) paperError('score', '总分需大于 0');
  if (!Number.isInteger(meta.durationMinutes) || meta.durationMinutes <= 0) {
    paperError('durationMinutes', '时长需大于 0 分钟');
  }

  const id = meta.id.trim();
  if (!id) paperError('id', 'id 不能为空');
  else if (!PAPER_ID_RE.test(id)) paperError('id', 'id 只能使用小写字母、数字和短横线');
  else if (ctx.paperIds.has(id)) paperError('id', `id「${id}」与已有试卷重复`);

  if (questions.length === 0) paperError('questions', '至少录入一道题');

  let totalScore = 0;
  questions.forEach((question, index) => {
    const number = index + 1;
    totalScore += Number.isFinite(question.score) ? question.score : 0;

    if (question.number !== number) {
      questionError(number, 'number', `题号不连续（当前编号 ${question.number}）`);
    }
    if (!Number.isFinite(question.score) || question.score <= 0) {
      questionError(number, 'score', '分值需大于 0');
    }
    if (
      !Number.isInteger(question.difficulty) ||
      question.difficulty < 1 ||
      question.difficulty > 5
    ) {
      questionError(number, 'difficulty', '难度需在 1~5 之间');
    }

    if (question.type === 'single') {
      if (!/^[A-D]$/.test(question.answer.trim().toUpperCase())) {
        questionError(number, 'answer', '单选答案需为 A/B/C/D');
      }
    } else if (question.answer.trim()) {
      questionError(number, 'answer', '综合题答案请留空');
    }

    if (question.kpIds.length === 0) {
      questionWarn(number, 'kpIds', '未关联知识点，学习统计不会累计');
    }
    for (const kpId of question.kpIds) {
      if (!ctx.kpIds.has(kpId)) {
        questionError(number, 'kpIds', `知识点「${kpId}」不存在`);
      }
    }

    const stemIssue = requiredAssetIssue(question.stem, '题干图');
    if (stemIssue) questionError(number, 'stem', stemIssue);
    const stemPrefix = pathPrefixIssue(question.stem, '题干图');
    if (stemPrefix) questionWarn(number, 'stem', stemPrefix);

    const analysisIssue = optionalAssetIssue(question.analysis, '解析图');
    if (analysisIssue) questionWarn(number, 'analysis', analysisIssue);
    const analysisPrefix = pathPrefixIssue(question.analysis, '解析图');
    if (analysisPrefix) questionWarn(number, 'analysis', analysisPrefix);

    if (question.type === 'short') {
      const answerIssue = optionalAssetIssue(question.answerImage, '答案图');
      if (answerIssue) questionWarn(number, 'answerImage', answerIssue);
      const answerPrefix = pathPrefixIssue(question.answerImage, '答案图');
      if (answerPrefix) questionWarn(number, 'answerImage', answerPrefix);
    } else if (question.answerImage.mode !== 'none') {
      questionWarn(number, 'answerImage', '单选题不需要答案图，导出时会忽略');
    }
  });

  if (questions.length > 0 && totalScore !== meta.score) {
    paperWarn(
      'score',
      `分值合计 ${totalScore} 分，与卷面总分 ${meta.score} 分不一致（可以导出，请确认）`,
    );
  }

  return { errors, warnings, totalScore };
}

/* ------------------------------ 导出 ------------------------------ */

export function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildPaperQuestion(
  question: ImportQuestionDraft,
  number: number,
  paperId: string,
): PaperQuestion {
  const stemImage = assetPath(paperId, number, 'stem', question.stem);
  const analysisImage = assetPath(paperId, number, 'analysis', question.analysis);
  const answerImage =
    question.type === 'short' ? assetPath(paperId, number, 'answerImage', question.answerImage) : '';
  const answer = question.type === 'single' ? question.answer.trim().toUpperCase() : null;
  const difficulty = Math.min(5, Math.max(1, Math.round(question.difficulty)));

  const built: PaperQuestion = {
    id: `${paperId}-q${pad2(number)}`,
    paperId,
    number,
    section: question.type === 'single' ? '选择题' : '综合题',
    type: question.type,
    score: question.score,
    stemImage,
    analysisImage,
    answerImage,
    answer,
    answerKind: question.type === 'single' ? 'official' : answerImage ? 'official' : 'missing',
    sourcePage: '',
    analysisPage: '',
    reviewStatus: 'draft',
    tags: parseTags(question.tagsText),
    kpIds: Array.from(new Set(question.kpIds)),
    difficulty,
  };
  return built;
}

function sumScore(list: PaperQuestion[]): number {
  return list.reduce((sum, question) => sum + question.score, 0);
}

function sectionOf(
  id: string,
  title: string,
  list: PaperQuestion[],
): PaperSection | null {
  if (list.length === 0) return null;
  return {
    id,
    title,
    hint: `共 ${list.length} 小题，共 ${sumScore(list)} 分。`,
    score: sumScore(list),
    questionIds: list.map((question) => question.id),
  };
}

/** 把草稿转换成可直接落盘的 paper.json / qNN.json 内容。 */
export function buildExport(
  meta: ImportPaperMeta,
  questions: ImportQuestionDraft[],
  options: { subjectName: string },
): ExportBundle {
  const id = meta.id.trim();
  const title = meta.title.trim() || '未命名试卷';
  const shortTitle = meta.shortTitle.trim() || title;
  const subjectId = meta.subjectId.trim();
  const subjectName = options.subjectName.trim() || subjectId;
  const region = meta.region.trim();

  const paperQuestions = questions.map((question, index) =>
    buildPaperQuestion(question, index + 1, id),
  );

  const singles = paperQuestions.filter((question) => question.type === 'single');
  const shorts = paperQuestions.filter((question) => question.type === 'short');
  const sections: PaperSection[] = [];
  const choiceSection = sectionOf('choice', '一、选择题', singles);
  if (choiceSection) sections.push(choiceSection);
  const comprehensiveSection = sectionOf('comprehensive', '二、综合题', shorts);
  if (comprehensiveSection) sections.push(comprehensiveSection);

  const allAnswered = singles.length > 0 && singles.every((question) => question.answer);
  const choiceAnswerKey = allAnswered
    ? singles.map((question) => question.answer ?? '')
    : undefined;

  const paper: Paper = {
    id,
    title,
    shortTitle,
    subjectId,
    subjectName,
    region,
    year: meta.year,
    score: meta.score,
    durationMinutes: meta.durationMinutes,
    choiceAnswerKey,
    assetBase: `papers/${id}`,
    source: {
      publisher: meta.source.trim() || '个人整理',
      type: '个人整理',
      note: meta.note.trim(),
    },
    sections,
    questionIds: paperQuestions.map((question) => question.id),
    reviewStatus: 'draft',
    notes: ['由「知星」录入向导生成；图片裁切、答案与知识点请在导入后复核。'],
  };

  const files: ExportFile[] = [
    { name: 'paper.json', text: jsonText(paper) },
    ...paperQuestions.map((question, index) => ({
      name: `q${pad2(index + 1)}.json`,
      text: jsonText(question),
    })),
  ];

  const imageFiles: ExportImageFile[] = [];
  questions.forEach((question, index) => {
    const number = index + 1;
    for (const kind of ASSET_KINDS) {
      if (kind === 'answerImage' && question.type !== 'short') continue;
      const asset = question[kind];
      if (asset.mode === 'upload' && asset.assetKey && !asset.missing) {
        imageFiles.push({
          fileName: assetFileName(number, kind, asset),
          jsonPath: assetPath(id, number, kind, asset),
          assetKey: asset.assetKey,
        });
      }
    }
  });

  return { paper, questions: paperQuestions, files, imageFiles };
}
