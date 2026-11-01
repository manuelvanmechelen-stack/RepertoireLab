import { Chess } from 'chess.js';

const normalizePositionFen = fen => String(fen ?? '').trim().split(/\s+/).slice(0, 4).join(' ');

/**
 * Load a user-supplied FEN and retain it as PGN setup metadata.
 * Without the headers, saving/reloading a line would incorrectly replay its
 * moves from the standard initial position.
 */
export function loadFenPosition(fen) {
  const game = new Chess();
  game.load(String(fen ?? '').trim());
  game.header('SetUp', '1', 'FEN', game.fen());
  return game;
}

/** Stable identity for one exact move path, including its actual start position. */
export function movePathSignature(game) {
  const headers = game.getHeaders();
  const history = game.history({ verbose: true });
  const startFen = headers.FEN || history[0]?.before || game.fen();
  return normalizePositionFen(startFen) + '|' + game.history().join(' ');
}

/** Strict PGN variant of movePathSignature; malformed PGNs are not treated as the start position. */
export function pathSignatureFromPgn(pgn) {
  const game = new Chess();
  game.loadPgn(String(pgn ?? ''));
  return movePathSignature(game);
}
