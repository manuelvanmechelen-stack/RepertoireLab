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
