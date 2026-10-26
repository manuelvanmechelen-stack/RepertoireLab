export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

export function scheduleMoveResult(previous, remembered, now = Date.now()) {
  const seen = (previous?.seen ?? 0) + 1;
  const misses = previous?.misses ?? 0;
  if (!remembered) {
    return { seen, misses: misses + 1, due: now + 5 * MINUTE_MS, intervalDays: 0, lastResult: 'miss' };
  }
  const priorInterval = previous?.intervalDays ?? 0;
  const intervalDays = priorInterval > 0 ? Math.min(120, Math.max(1, Math.round(priorInterval * 1.8))) : 1;
  return { seen, misses, due: now + intervalDays * DAY_MS, intervalDays, lastResult: 'good' };
}

export function scheduleLineResult({ seen = 0, intervalDays = 0 }, remembered, recentMoveMisses = 0, now = Date.now()) {
  const nextSeen = seen + 1;
  const nextInterval = remembered
    ? Math.min(120, Math.max(1, recentMoveMisses > 0 ? 1 : intervalDays > 0 ? Math.round(intervalDays * (nextSeen <= 2 ? 2 : 1.8)) : nextSeen <= 1 ? 1 : 3))
    : 0;
  return {
    seen: nextSeen,
    intervalDays: nextInterval,
    due: remembered ? now + nextInterval * DAY_MS : now + 5 * MINUTE_MS,
  };
}

export function isDue(due, now = Date.now()) {
  return !Number.isFinite(due) || due <= 0 || due <= now;
}

export function selectDueOwnPly(historyLength, color, moveMemory, lineId, lineDue, now = Date.now()) {
  if (isDue(lineDue, now)) return 0;
  for (let ply = 0; ply < historyLength; ply++) {
    const isOwnMove = color === 'Wit' ? ply % 2 === 0 : ply % 2 === 1;
    if (isOwnMove && isDue(moveMemory?.[lineId + ':' + ply]?.due, now)) return ply;
  }
  return 0;
}

/**
 * Four-grade adaptive repetition schedule. This is a transparent SM-2-style
 * scheduler, not a claim of implementing the FSRS algorithm.
 */
export function scheduleLineGrade(previous, grade, recentMoveMisses = 0, now = Date.now()) {
  const seen = (previous?.seen ?? 0) + 1;
  const priorInterval = Math.max(0, previous?.intervalDays ?? 0);
  const hasRecentErrors = recentMoveMisses > 0;
  let intervalDays;
  let due;

  if (grade === 'again') {
    intervalDays = 0;
    due = now + 5 * MINUTE_MS;
  } else if (grade === 'hard') {
    intervalDays = priorInterval > 0 ? Math.max(1, Math.round(priorInterval * 1.2)) : 1;
    if (hasRecentErrors) intervalDays = Math.min(intervalDays, 1);
    due = now + intervalDays * DAY_MS;
  } else if (grade === 'good') {
    intervalDays = priorInterval > 0
      ? Math.round(priorInterval * (hasRecentErrors ? 1.3 : 1.8))
      : seen <= 1 ? 1 : 3;
    intervalDays = Math.min(120, Math.max(1, intervalDays));
    due = now + intervalDays * DAY_MS;
  } else if (grade === 'easy') {
    intervalDays = priorInterval > 0
      ? Math.round(priorInterval * (hasRecentErrors ? 1.8 : 2.5))
      : 4;
    intervalDays = Math.min(120, Math.max(1, intervalDays));
    due = now + intervalDays * DAY_MS;
  } else {
    throw new Error('Onbekende trainingsbeoordeling: ' + grade);
  }

  return { seen, intervalDays, due, lastGrade: grade };
}


// FSRS v6 scheduler used by interactive move and line reviews.
// Card state is stored as JSON-safe timestamps so it survives local/cloud backups.
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';

const fsrsScheduler = fsrs({ request_retention: 0.9, maximum_interval: 120, enable_fuzz: false, enable_short_term: true, learning_steps: ['5m'], relearning_steps: ['5m'] });
const fsrsRating = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };

function restoreFsrsCard(previous, now) {
  const saved = previous?.fsrsCard;
  if (saved && typeof saved === 'object' && Number.isFinite(saved.due)) {
    return { ...saved, due: new Date(saved.due), last_review: Number.isFinite(saved.last_review) ? new Date(saved.last_review) : null };
  }
  return createEmptyCard(new Date(now));
}

function saveFsrsCard(card) {
  return { ...card, due: card.due instanceof Date ? card.due.getTime() : new Date(card.due).getTime(), last_review: card.last_review ? (card.last_review instanceof Date ? card.last_review.getTime() : new Date(card.last_review).getTime()) : null };
}

export function scheduleFsrsMoveResult(previous, remembered, now = Date.now()) {
  const rating = remembered ? Rating.Good : Rating.Again;
  const prior = restoreFsrsCard(previous, now);
  const result = fsrsScheduler.next(prior, new Date(now), rating);
  const fsrsCard = saveFsrsCard(result.card);
  const seen = (previous?.seen ?? 0) + 1;
  const misses = (previous?.misses ?? 0) + (remembered ? 0 : 1);
  return { seen, misses, due: fsrsCard.due, intervalDays: Math.max(0, Number(result.card.scheduled_days) || 0), lastResult: remembered ? 'good' : 'miss', fsrsCard };
}

export function scheduleFsrsLineGrade(previous, grade, now = Date.now()) {
  const rating = fsrsRating[grade];
  if (!rating) throw new Error('Onbekende trainingsbeoordeling: ' + grade);
  const result = fsrsScheduler.next(restoreFsrsCard(previous, now), new Date(now), rating);
  const fsrsCard = saveFsrsCard(result.card);
  return { seen: (previous?.seen ?? 0) + 1, intervalDays: Math.max(0, Number(result.card.scheduled_days) || 0), due: fsrsCard.due, lastGrade: grade, fsrsCard };
}
