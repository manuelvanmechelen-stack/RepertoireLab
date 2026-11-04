import { Chess } from 'chess.js';

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


/**
 * Summarize how much of the observed continuation frequency is covered by a
 * repertoire at one position. Only moves with usable samples contribute.
 */
export function summarizeCoverageMoves(moves, knownSans = [], minGames = 20) {
  const known = new Set((Array.isArray(knownSans) ? knownSans : []).map(san => String(san).replace(/[!?+#]+/g, '')));
  const ranked = rankCoverageMoves(moves, minGames, Number.MAX_SAFE_INTEGER)
    .map(move => ({ ...move, normalizedSan: move.san.replace(/[!?+#]+/g, '') }));
  const totalGames = ranked.reduce((sum, move) => sum + move.games, 0);
  const coveredGames = ranked.reduce((sum, move) => sum + (known.has(move.normalizedSan) ? move.games : 0), 0);
  return {
    totalGames,
    coveredGames,
    weightedCoverage: totalGames ? Math.round(coveredGames / totalGames * 100) : null,
    missingMoves: ranked.filter(move => !known.has(move.normalizedSan)),
    observedMoves: ranked.length,
    coveredMoves: ranked.filter(move => known.has(move.normalizedSan)).length,
  };
}


/**
 * Collect repertoire replies already stored after a position.
 *
 * Replay each PGN from its declared FEN start when present. Starting every
 * line from the standard position silently omits valid custom-FEN replies.
 */
export function collectKnownContinuationSans(lines, targetFen) {
  if (!Array.isArray(lines) || typeof targetFen !== 'string' || !targetFen.trim()) return [];

  const positionKey = fen => fen.trim().split(/\s+/).slice(0, 4).join(' ');
  const targetKey = positionKey(targetFen);
  const known = new Set();

  for (const line of lines) {
    if (!line || typeof line.moves !== 'string' || !line.moves.trim()) continue;
    try {
      const game = new Chess();
      game.loadPgn(line.moves);
      // chess.js stores the exact pre-move FEN on each verbose history move.
      // Use it directly so custom-FEN starts and transposed paths share the
      // same position identity without replaying from the standard start.
      for (const move of game.history({ verbose: true })) {
        if (positionKey(move.before) === targetKey) {
          known.add(move.san.replace(/[!?+#]+/g, ''));
        }
      }
    } catch {
      // Ignore invalid or legacy lines; one damaged line must not hide others.
    }
  }

  return [...known];
}
