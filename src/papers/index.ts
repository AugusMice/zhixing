export interface PaperQuestion {
  id: string;
  paperId: string;
  number: number;
  section: string;
  type: string;
  score: number;
  stemImage: string;
  analysisImage: string;
  answerImage: string;
  answer?: string | null;
  answerKind: 'official' | 'ai' | 'missing';
  sourcePage: string;
  analysisPage: number | string;
  reviewStatus: 'crop-ok' | 'needs-review' | 'draft';
  tags: string[];
  kpIds: string[];
  /** 1~5，缺省按 3 处理 */
  difficulty?: number;
}

export interface PaperSection {
  id: string;
  title: string;
  hint: string;
  score: number;
  questionIds: string[];
}

export interface Paper {
  id: string;
  title: string;
  shortTitle: string;
  subjectId: string;
  subjectName: string;
  region: string;
  year: number;
  score: number;
  durationMinutes: number;
  choiceAnswerKey?: string[];
  assetBase: string;
  source: { publisher: string; type: string; note: string };
  sections: PaperSection[];
  questionIds: string[];
  reviewStatus: string;
  notes: string[];
}

const paperModules = import.meta.glob('../../content/papers/*/paper.json', {
  eager: true,
  import: 'default',
}) as Record<string, Paper>;

const questionModules = import.meta.glob('../../content/papers/*/q*.json', {
  eager: true,
  import: 'default',
}) as Record<string, PaperQuestion>;

const questionsById = new Map<string, PaperQuestion>();
for (const question of Object.values(questionModules)) {
  questionsById.set(question.id, question);
}

export const PAPERS: Paper[] = Object.values(paperModules).sort((a, b) => b.year - a.year);

export function getPaper(id: string): Paper | undefined {
  return PAPERS.find((paper) => paper.id === id);
}

export function getPaperQuestion(id: string): PaperQuestion | undefined {
  return questionsById.get(id);
}

export function paperQuestions(paper: Paper): PaperQuestion[] {
  return paper.questionIds
    .map((id) => questionsById.get(id))
    .filter((question): question is PaperQuestion => Boolean(question));
}

/** public assets use Vite's base so the app still works under a subpath */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
