import { Chess } from 'chess.js';

const positionKey = game => game.fen().split(' ').slice(0, 4).join(' ');

/**
 * Find positions reached through more than one distinct move path.
 * Replay each PGN from its declared FEN when present; replaying every SAN
 * sequence from the standard start silently drops or misclassifies custom-FEN
 * lines whose first move is legal only in their declared starting position.
 */
export function analyzeTranspositions(lines = []) {
  const positions = new Map();
  const recordPosition = (key, signature, name, ply) => {
    const item = positions.get(key) ?? {
      histories: new Set(),
      names: new Set(),
      ply,
    };
    item.histories.add(signature);
    item.names.add(name);
    item.ply = Math.min(item.ply, ply);
    positions.set(key, item);
  };

  for (const line of lines) {
    try {
      const source = new Chess();
      source.loadPgn(String(line?.moves ?? ''));
      const moves = source.history({ verbose: true });
      if (!moves.length) continue;
      const startFen = source.getHeaders().FEN;
      const cursor = startFen ? new Chess(startFen) : new Chess();
      const startKey = positionKey(cursor);
      const path = [];
      const lineName = line.name || 'Naamloze variant';

      // A custom-FEN root is itself a repertoire position. Record it so the
      // report can detect when another saved line reaches that position by
      // playing a different move order, even before the custom line's first move.
      recordPosition(startKey, `${startKey}|`, lineName, 0);

      for (const move of moves) {
        const played = cursor.move(move.san);
        path.push(played.san);
        const key = positionKey(cursor);
        recordPosition(key, `${startKey}|${path.join(' ')}`, lineName, path.length);
      }
    } catch {
      // Ignore malformed legacy PGNs, matching the app's previous behavior.
    }
  }

  return [...positions.entries()]
    .filter(([, item]) => item.histories.size > 1)
    .map(([fen, item]) => ({
      fen,
      paths: item.histories.size,
      names: [...item.names],
      ply: item.ply,
    }))
    .sort((a, b) => b.names.length - a.names.length || a.ply - b.ply)
    .slice(0, 20);
}
