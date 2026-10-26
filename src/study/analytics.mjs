import { Chess } from 'chess.js';

const keyOf = game => game.fen().split(' ').slice(0, 4).join(' ');

/** Compute only metrics supported by saved repertoire and training data. */
export function calculateRepertoireMetrics(lines = [], moveMemory = {}, now = Date.now(), engineLineAudits = {}) {
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
  const currentAudits = lines
    .filter(line => engineLineAudits?.[line.id]?.moves === line.moves)
    .flatMap(line => Array.isArray(engineLineAudits[line.id]?.findings) ? engineLineAudits[line.id].findings : []);
  const comparableAudits = currentAudits.filter(item => typeof item.lossCp === 'number' && Number.isFinite(item.lossCp));
  const engineConsistency = comparableAudits.length
    ? Math.round(comparableAudits.filter(item => item.lossCp <= 80).length / comparableAudits.length * 100)
    : null;
  const engineOutliers = comparableAudits.filter(item => item.lossCp >= 200).length;
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
    engineAuditMoves: currentAudits.length,
    engineComparableMoves: comparableAudits.length,
    engineConsistency,
    engineOutliers,
  };
}


/** Transparent local quality estimates; they are not Chessbook's proprietary 1–99 scores. */
export function calculateRepertoireQuality(lines = [], moveMemory = {}, engineLineAudits = {}, coverage = {}) {
  const validLines = [];
  const positionCounts = new Map();
  let totalPlies = 0;
  for (const line of lines) {
    try {
      const game = new Chess(); game.loadPgn(String(line.moves ?? ''));
      const moves = game.history({ verbose: true });
      if (!moves.length) continue;
      validLines.push(line); totalPlies += moves.length;
      const cursor = new Chess();
      for (const move of moves) {
        const key = keyOf(cursor);
        const set = positionCounts.get(key) ?? new Set(); set.add(move.san.replace(/[!?+#]+/g, '')); positionCounts.set(key, set);
        cursor.move(move);
      }
    } catch { /* Ignore invalid legacy lines. */ }
  }

  let practicalPoints = 0, practicalGames = 0;
  for (const line of validLines) {
    const item = coverage?.[line.id];
    const games = Number(item?.games) || 0;
    const white = Number(item?.white) || 0, draws = Number(item?.draws) || 0, black = Number(item?.black) || 0;
    if (games > 0 && white + draws + black > 0) {
      const score = ((line.color === 'Wit' ? white : black) + draws / 2) / (white + draws + black);
      practicalPoints += score * games; practicalGames += games;
    }
  }
  const practicalRate = practicalGames ? practicalPoints / practicalGames : null;
  const effectivenessScore = practicalRate === null ? null : Math.max(1, Math.min(99, Math.round(1 + (practicalRate - 0.35) / 0.30 * 98)));

  const auditFindings = validLines.flatMap(line => {
    const audit = engineLineAudits?.[line.id];
    return audit?.moves === line.moves && Array.isArray(audit.findings) ? audit.findings.filter(item => typeof item.lossCp === 'number' && Number.isFinite(item.lossCp) && item.lossCp >= 0) : [];
  });
  const avgLossCp = auditFindings.length ? auditFindings.reduce((sum, item) => sum + item.lossCp, 0) / auditFindings.length : null;
  const soundnessScore = avgLossCp === null ? null : Math.max(1, Math.min(99, Math.round(avgLossCp <= 10 ? 99 : 99 - (avgLossCp - 10) * 98 / 130)));

  const lineIds = new Set(validLines.map(line => line.id));
  const attempts = Object.entries(moveMemory).filter(([key, item]) => [...lineIds].some(id => key.startsWith(id + ':')) && Number.isFinite(item?.seen) && item.seen > 0);
  const seen = attempts.reduce((sum, [, item]) => sum + item.seen, 0);
  const misses = attempts.reduce((sum, [, item]) => sum + Math.min(item.seen, Math.max(0, Number(item.misses) || 0)), 0);
  const recallRate = seen ? (seen - misses) / seen : null;
  const avgDepth = validLines.length ? totalPlies / validLines.length : 0;
  const branching = [...positionCounts.values()].filter(set => set.size > 1).length;
  const structuralEase = Math.max(20, Math.min(95, 100 - avgDepth * 1.7 - Math.min(25, branching * 1.5)));
  const learnabilityScore = validLines.length ? Math.max(1, Math.min(99, Math.round(recallRate === null ? structuralEase : recallRate * 75 + structuralEase * 0.25))) : null;

  return {
    effectivenessScore, practicalRate: practicalRate === null ? null : Math.round(practicalRate * 1000) / 10,
    effectivenessGames: practicalGames,
    soundnessScore, averageLossCp: avgLossCp === null ? null : Math.round(avgLossCp), auditedMoves: auditFindings.length,
    learnabilityScore, recallRate: recallRate === null ? null : Math.round(recallRate * 100), reviewAttempts: seen,
    structuralEase: validLines.length ? Math.round(structuralEase) : null,
    confidence: { effectiveness: practicalGames >= 100 ? 'redelijk' : practicalGames > 0 ? 'laag' : 'geen data', soundness: auditFindings.length >= 20 ? 'redelijk' : auditFindings.length > 0 ? 'laag' : 'geen data', learnability: seen >= 20 ? 'redelijk' : seen > 0 ? 'laag' : 'structurele schatting' },
  };
}
