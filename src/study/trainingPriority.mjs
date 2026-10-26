const DAY_MS = 86_400_000;

/**
 * Prioritize the lines a player should rehearse next.
 * Adapted conceptually from Tabia's MIT-licensed due-line picker:
 * due lines first, then lower mastery, then overdue and error history.
 * Does not mutate the supplied lines or training memory.
 */
export function rankTrainingLines(lines = [], moveMemory = {}, missedMoves = {}, now = Date.now()) {
  const scored = lines.map((line, index) => {
    const memories = Object.entries(moveMemory)
      .filter(([key]) => key.startsWith(line.id + ':'))
      .map(([, value]) => value);
    const attempts = memories.reduce((sum, item) => sum + Math.max(0, Number(item?.seen) || 0), 0);
    const misses = memories.reduce((sum, item) => sum + Math.max(0, Number(item?.misses) || 0), 0)
      + Math.max(0, Number(missedMoves[line.id]) || 0);
    const dueTimes = memories.map(item => Number(item?.due)).filter(Number.isFinite);
    const dueAt = Number.isFinite(line.due) && line.due > 0
      ? Math.min(line.due, dueTimes.length ? Math.min(...dueTimes) : Infinity)
      : (dueTimes.length ? Math.min(...dueTimes) : 0);
    const isDue = dueAt <= now;
    const overdueMs = isDue ? Math.max(0, now - dueAt) : 0;
    const interval = Math.max(0, Number(line.intervalDays) || 0);
    const missRate = attempts ? misses / attempts : (misses ? 1 : 0);
    return { line, index, isDue, overdueMs, interval, missRate, misses, attempts };
  });

  scored.sort((a, b) =>
    Number(b.isDue) - Number(a.isDue)
    || a.interval - b.interval
    || b.overdueMs - a.overdueMs
    || b.missRate - a.missRate
    || b.misses - a.misses
    || a.attempts - b.attempts
    || a.index - b.index
  );
  return scored.map(item => item.line);
}
