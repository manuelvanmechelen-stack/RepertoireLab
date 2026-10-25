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
