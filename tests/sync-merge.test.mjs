import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffAppDataTombstones,
  emptyTombstones,
  mergeSyncSnapshots,
  snapshotsContentEqual,
} from '../src/engine/sync.ts';

function makeAppData(overrides = {}) {
  return {
    version: 1,
    cards: {},
    attempts: [],
    favorites: [],
    wrong: {},
    dailyLog: {},
    settings: {
      dailyNew: 10,
      dailyReview: 40,
      theme: 'dark',
      fontSize: 'md',
      showTimer: true,
      autoNext: false,
    },
    session: null,
    userQuestions: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeSnapshot(appOverrides = {}, extra = {}) {
  return {
    schemaVersion: 1,
    appData: makeAppData(appOverrides),
    paperExams: {},
    paperReports: [],
    tombstones: emptyTombstones(),
    ...extra,
  };
}

test('mergeSyncSnapshots unions attempts without double-counting dailyLog across devices', () => {
  const day = new Date(2026, 10, 27, 10, 0, 0).getTime();
  const local = makeSnapshot({
    cards: {
      q1: { qid: 'q1', ease: 2.5, interval: 1, reps: 1, lapses: 0, due: day + 86400_000, introducedAt: day, lastReview: day },
    },
    attempts: [
      { id: 'a1', qid: 'q1', ts: day, correct: true, grade: 4, elapsedMs: 5000, mode: 'daily', sessionId: 's1' },
    ],
    dailyLog: { '2026-11-27': { count: 1, correct: 1, ms: 5000, newCount: 1 } },
  });
  const remote = makeSnapshot({
    cards: {
      q2: { qid: 'q2', ease: 2.5, interval: 1, reps: 1, lapses: 0, due: day + 86400_000, introducedAt: day + 1000, lastReview: day + 1000 },
    },
    attempts: [
      { id: 'a2', qid: 'q2', ts: day + 1000, correct: false, grade: 1, elapsedMs: 7000, mode: 'daily', sessionId: 's2' },
    ],
    dailyLog: { '2026-11-27': { count: 1, correct: 0, ms: 7000, newCount: 1 } },
  });

  const merged = mergeSyncSnapshots(local, remote, day + 2000);
  assert.deepEqual(merged.appData.attempts.map((a) => a.id), ['a1', 'a2']);
  assert.equal(Object.keys(merged.appData.cards).length, 2);
  assert.deepEqual(merged.appData.dailyLog['2026-11-27'], {
    count: 2,
    correct: 1,
    ms: 12000,
    newCount: 2,
  });

  // Idempotent on second merge
  const mergedAgain = mergeSyncSnapshots(merged, remote, day + 3000);
  assert.equal(snapshotsContentEqual(merged, mergedAgain), true);
});

test('mergeSyncSnapshots honors favorite removal and wrong graduation', () => {
  const base = makeAppData({
    favorites: ['q1', 'q2'],
    wrong: {
      q1: { qid: 'q1', count: 1, lastAt: 1000, streak: 0 },
      q2: { qid: 'q2', count: 1, lastAt: 1000, streak: 0 },
    },
    cards: {
      q1: { qid: 'q1', ease: 2.5, interval: 1, reps: 1, lapses: 0, due: 2000, introducedAt: 1000, lastReview: 1000 },
    },
  });

  // Device B unfavorites q1 and graduates q1 from wrong book at t=3000
  const afterB = makeAppData({
    ...base,
    favorites: ['q2'],
    wrong: { q2: { qid: 'q2', count: 1, lastAt: 1000, streak: 0 } },
    cards: {
      q1: { qid: 'q1', ease: 2.5, interval: 6, reps: 3, lapses: 0, due: 9000, introducedAt: 1000, lastReview: 3000 },
    },
    updatedAt: 3000,
  });
  const tombsB = diffAppDataTombstones(base, afterB, emptyTombstones(), 3000);

  const merged = mergeSyncSnapshots(
    makeSnapshot(base),
    makeSnapshot(afterB, { tombstones: tombsB }),
    4000,
  );
  assert.deepEqual(merged.appData.favorites, ['q2']);
  assert.equal(merged.appData.wrong.q1, undefined);
  assert.ok(merged.appData.wrong.q2);
});

test('mergeSyncSnapshots merges paperExams, selfScores, cleared tombstones, and paperReports', () => {
  const local = makeSnapshot({}, {
    paperExams: {
      'chem-2025': {
        id: 'pex-1',
        paperId: 'chem-2025',
        startedAt: 1000,
        endsAt: 2000,
        durationMinutes: 30,
        status: 'submitted',
        answers: { q1: 'A' },
        submittedAt: 1500,
        applied: true,
      },
      'chem-2024': {
        id: 'pex-old',
        paperId: 'chem-2024',
        startedAt: 1000,
        endsAt: 2000,
        durationMinutes: 30,
        status: 'submitted',
        answers: { q1: 'B' },
        submittedAt: 1200,
      },
    },
    paperReports: [
      { id: 'r1', paperId: 'chem-2025', questionId: 'q1', number: 1, message: 'typo', createdAt: 1500 },
    ],
  });

  const remote = makeSnapshot({}, {
    paperExams: {
      'chem-2025': {
        id: 'pex-1',
        paperId: 'chem-2025',
        startedAt: 1000,
        endsAt: 2000,
        durationMinutes: 30,
        status: 'submitted',
        answers: { q1: 'A', q2: 'C' },
        selfScores: { q15: 10 },
        submittedAt: 1500,
      },
    },
    paperReports: [
      { id: 'r2', paperId: 'chem-2025', questionId: 'q2', number: 2, message: 'key?', createdAt: 2500 },
    ],
    tombstones: {
      ...emptyTombstones(),
      paperExamCleared: { 'chem-2024': 2000 },
    },
  });

  const merged = mergeSyncSnapshots(local, remote, 3000);
  assert.equal(merged.paperExams['chem-2024'], undefined);
  assert.deepEqual(merged.paperExams['chem-2025'].answers, { q1: 'A', q2: 'C' });
  assert.deepEqual(merged.paperExams['chem-2025'].selfScores, { q15: 10 });
  assert.equal(merged.paperExams['chem-2025'].applied, true);
  assert.deepEqual(merged.paperReports.map((r) => r.id), ['r2', 'r1']);
});

test('mergeSyncSnapshots honors resetProgress across devices', () => {
  const beforeReset = makeAppData({
    cards: {
      q1: { qid: 'q1', ease: 2.5, interval: 1, reps: 1, lapses: 0, due: 5000, introducedAt: 1000, lastReview: 1000 },
    },
    attempts: [
      { id: 'a1', qid: 'q1', ts: 1000, correct: true, grade: 4, elapsedMs: 3000, mode: 'daily', sessionId: 's1' },
    ],
    dailyLog: { '2026-11-27': { count: 1, correct: 1, ms: 3000, newCount: 1 } },
  });
  const afterReset = makeAppData({
    cards: {},
    attempts: [],
    wrong: {},
    dailyLog: {},
    updatedAt: 5000,
  });
  const resetTombs = diffAppDataTombstones(beforeReset, afterReset, emptyTombstones(), 5000);

  const merged = mergeSyncSnapshots(
    makeSnapshot(beforeReset),
    makeSnapshot(afterReset, { tombstones: resetTombs }),
    6000,
  );
  assert.equal(merged.appData.attempts.length, 0);
  assert.deepEqual(merged.appData.cards, {});
});
