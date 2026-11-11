import { Chess } from 'chess.js';

/**
 * Build bounded engine-analysis requests from each repertoire move.
 * The FEN is taken from the verbose move's `before` snapshot, so analysis
 * always starts before the move being evaluated, including custom-FEN PGNs.
 */
export function getEngineAuditPositions(pgn, repertoireColor, maxOwnMoves = 40) {
  if (repertoireColor !== 'Wit' && repertoireColor !== 'Zwart') {
    throw new Error('Ongeldige repertoirekleur voor engine-analyse.');
  }
  const game = new Chess();
  game.loadPgn(String(pgn ?? ''));
  const history = game.history({ verbose: true });
  const targetColor = repertoireColor === 'Wit' ? 'w' : 'b';
  const limit = Number.isFinite(maxOwnMoves)
    ? Math.max(0, Math.min(40, Math.floor(maxOwnMoves)))
    : 40;
  const positions = [];

  for (let index = 0; index < history.length && positions.length < limit; index++) {
    const move = history[index];
    if (move.color !== targetColor) continue;
    if (typeof move.before !== 'string' || !move.before.trim()) {
      throw new Error('De beginstelling van een engine-analyse ontbreekt.');
    }
    positions.push({
      ply: index + 1,
      san: move.san,
      uci: move.from + move.to + (move.promotion ?? ''),
      color: move.color,
      fen: move.before,
    });
  }
  return positions;
}

/** Calculate evaluation loss from the side-to-move player's perspective. Scores are white-relative centipawns. */
export function evaluationLossCp(bestWhiteScore, playedWhiteScore, moverColor) {
  if (!Number.isFinite(bestWhiteScore) || !Number.isFinite(playedWhiteScore)) return null;
  const bestForMover = moverColor === 'w' ? bestWhiteScore : -bestWhiteScore;
  const playedForMover = moverColor === 'w' ? playedWhiteScore : -playedWhiteScore;
  return Math.max(0, Math.round(bestForMover - playedForMover));
}
