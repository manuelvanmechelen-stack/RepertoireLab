import { Chess } from 'chess.js';

const STANDARD_START_FEN = new Chess().fen();

/**
 * Parse a repertoire PGN and retain its declared start position.
 * The SAN history is indexed relative to that start position, not the
 * standard initial chess position.
 */
export function loadTrainingLine(pgn) {
  const game = new Chess();
  game.loadPgn(String(pgn ?? ''));
  const startFen = game.getHeaders().FEN || STANDARD_START_FEN;
  const start = new Chess(startFen);
  return {
    san: game.history(),
    startFen: start.fen(),
    startTurn: start.turn(),
  };
}

/** Return whether a zero-based PGN ply belongs to the repertoire side. */
export function isOwnTrainingPly(ply, color, startingTurn = 'w') {
  if (!Number.isInteger(ply) || ply < 0) return false;
  if (color !== 'Wit' && color !== 'Zwart') return false;
  const firstTurn = startingTurn === 'b' ? 'b' : 'w';
  const moveColor = ply % 2 === 0 ? firstTurn : (firstTurn === 'w' ? 'b' : 'w');
  return moveColor === (color === 'Wit' ? 'w' : 'b');
}
