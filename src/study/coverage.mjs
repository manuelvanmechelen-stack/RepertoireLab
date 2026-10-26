/**
 * Rank master-database continuations for actionable repertoire coverage.
 * A move's sample is the sum of wins, draws and losses; no result-based bias
 * is introduced here because this view is about coverage, not move quality.
 */
export function rankCoverageMoves(moves, minGames = 20, limit = 3) {
  if (!Array.isArray(moves)) return [];
  const threshold = Number.isFinite(minGames) ? Math.max(0, minGames) : 20;
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 3;
  return moves
    .filter(move => move && typeof move.san === 'string' && typeof move.uci === 'string')
    .map(move => ({
      ...move,
      games: Math.max(0, Number(move.white) || 0) + Math.max(0, Number(move.draws) || 0) + Math.max(0, Number(move.black) || 0),
    }))
    .filter(move => move.games >= threshold)
    .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san))
    .slice(0, max);
}
