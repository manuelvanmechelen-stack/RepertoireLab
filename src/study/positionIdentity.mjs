import { Chess } from 'chess.js';

/**
 * Return a FEN-based position identity without move counters.
 * The en-passant target is retained only when the side to move has a legal
 * en-passant capture. This avoids treating an uncapturable FEN target (or a
 * pinned pawn's illegal capture) as a distinct chess position.
 */
export function canonicalPositionKey(position) {
  const game = position instanceof Chess
    ? position
    : new Chess(String(position ?? '').trim());
  const [placement, turn, castling, enPassant] = game
    .fen({ forceEnpassantSquare: true })
    .split(' ');
  const hasLegalEnPassant = enPassant !== '-' &&
    game.moves({ verbose: true }).some(move => move.flags.includes('e'));
  return [placement, turn, castling, hasLegalEnPassant ? enPassant : '-'].join(' ');
}
