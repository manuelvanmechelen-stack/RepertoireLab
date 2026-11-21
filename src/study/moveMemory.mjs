import { Chess } from 'chess.js';

function readVerboseHistory(pgn) {
  if (typeof pgn !== 'string' || !pgn.trim()) throw new Error('PGN bevat geen zetten.');
  const game = new Chess();
  game.loadPgn(pgn);
  return game.history({ verbose: true });
}

function moveIdentity(move) {
  const position = String(move.before ?? '').split(/\\s+/).slice(0, 4).join(' ');
  const uci = String(move.from ?? '') + String(move.to ?? '') + String(move.promotion ?? '');
  return position + '|' + uci;
}

/**
 * Find the first half-move whose position or UCI move differs.
 * FEN move counters are deliberately excluded; side, castling and en-passant
 * state remain part of the position identity.
 *
 * Returns null when both PGNs contain the same complete move sequence.
 */
export function firstChangedPly(previousPgn, nextPgn) {
  const previous = readVerboseHistory(previousPgn);
  const next = readVerboseHistory(nextPgn);
  const sharedLength = Math.min(previous.length, next.length);
  for (let ply = 0; ply < sharedLength; ply++) {
    if (moveIdentity(previous[ply]) !== moveIdentity(next[ply])) return ply;
  }
  return previous.length === next.length ? null : sharedLength;
}

/**
 * Drop move-level memory from the first changed half-move onward, preserving
 * earlier cards and every record owned by another repertoire line.
 */
export function pruneLineMoveMemoryFromPly(moveMemory = {}, lineId, firstPly) {
  if (typeof lineId !== 'string' || !lineId) throw new TypeError('lineId moet een niet-lege string zijn.');
  if (!Number.isSafeInteger(firstPly) || firstPly < 0) throw new RangeError('firstPly moet een niet-negatief geheel getal zijn.');
  if (!moveMemory || typeof moveMemory !== 'object' || Array.isArray(moveMemory)) return {};
  const prefix = lineId + ':';
  return Object.fromEntries(Object.entries(moveMemory).filter(([key]) => {
    if (!key.startsWith(prefix)) return true;
    const plyText = key.slice(prefix.length);
    if (!/^(0|[1-9]\\d*)$/.test(plyText)) return true;
    const ply = Number(plyText);
    return !Number.isSafeInteger(ply) || ply < firstPly;
  }));
}
