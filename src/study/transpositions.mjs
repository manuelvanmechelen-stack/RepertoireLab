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

  for (const line of lines) {
    try {
      const source = new Chess();
      source.loadPgn(String(line?.moves ?? ''));
      const moves = source.history({ verbose: true });
      const startFen = source.getHeaders().FEN;
      const cursor = startFen ? new Chess(startFen) : new Chess();
      const path = [];

      for (const move of moves) {
        const played = cursor.move(move.san);
        path.push(played.san);
        const key = positionKey(cursor);
        const item = positions.get(key) ?? {
          histories: new Set(),
          names: new Set(),
          ply: path.length,
        };
        item.histories.add(path.join(' '));
        item.names.add(line.name || 'Naamloze variant');
        item.ply = Math.min(item.ply, path.length);
        positions.set(key, item);
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
