import { Chess } from 'chess.js';

const keyOf = game => game.fen().split(' ').slice(0, 4).join(' ');

/** Compute only metrics supported by saved repertoire and training data. */
export function calculateRepertoireMetrics(lines = [], moveMemory = {}, now = Date.now()) {
  const positions = new Map();
  let validLines = 0;
  let moveCount = 0;
  let notedLines = 0;
  for (const line of lines) {
    try {
      const game = new Chess();
      game.loadPgn(String(line.moves ?? ''));
      const history = game.history({ verbose: true });
      if (!history.length) continue;
      validLines++;
      moveCount += history.length;
      if (String(line.note ?? '').trim()) notedLines++;
      const cursor = new Chess();
      for (const move of history) {
        const key = keyOf(cursor);
        const node = positions.get(key) ?? new Set();
        node.add(move.san.replace(/[!?+#]+/g, ''));
        positions.set(key, node);
        cursor.move(move);
      }
    } catch {
      // Invalid legacy variants are excluded from structural metrics.
    }
  }
  const attempts = Object.entries(moveMemory).filter(([key, value]) =>
    lines.some(line => key.startsWith(line.id + ':')) && Number.isFinite(value?.seen) && value.seen > 0);
  const totalAttempts = attempts.reduce((sum, [, value]) => sum + value.seen, 0);
  const totalMisses = attempts.reduce((sum, [, value]) => sum + Math.min(value.seen, Math.max(0, Number(value.misses) || 0)), 0);
  const dueMoves = attempts.filter(([, value]) => !Number.isFinite(value.due) || value.due <= now).length;
  const branchingPositions = [...positions.values()].filter(moves => moves.size > 1).length;
  return {
    validLines,
    moveCount,
    uniquePositions: positions.size,
    branchingPositions,
    transpositionPotential: Math.max(0, moveCount - positions.size),
    notedLines,
    noteCoverage: validLines ? Math.round(notedLines / validLines * 100) : null,
    totalAttempts,
    totalMisses,
    accuracy: totalAttempts ? Math.round((totalAttempts - totalMisses) / totalAttempts * 100) : null,
    dueMoves,
  };
}
