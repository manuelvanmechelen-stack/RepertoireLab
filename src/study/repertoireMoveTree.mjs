import { Chess } from 'chess.js';
import { canonicalPositionKey } from './positionIdentity.mjs';

const STANDARD_FEN = new Chess().fen();
const positionKey = fen => canonicalPositionKey(fen);

function addUnique(items, value) {
  if (!items.includes(value)) items.push(value);
}

/**
 * Build the move-order tree used by the repertoire workspace.
 * Keep distinct full starting FENs in separate roots so custom positions and
 * their PGN move numbers are never presented as continuations from move one.
 * Individual nodes retain their normalized position key so the UI can mark
 * positions that the position graph also reaches through other move orders.
 */
export function buildRepertoireMoveTree(lines = []) {
  const roots = new Map();
  let validLines = 0;
  let invalidLines = 0;
  let totalPlies = 0;

  for (const line of Array.isArray(lines) ? lines : []) {
    try {
      const game = new Chess();
      game.loadPgn(String(line?.moves ?? ''));
      const history = game.history({ verbose: true });
      if (!history.length) {
        invalidLines++;
        continue;
      }

      const declaredFen = game.getHeaders().FEN;
      const start = declaredFen ? new Chess(declaredFen) : new Chess();
      const startFen = start.fen();
      let root = roots.get(startFen);
      if (!root) {
        const fields = startFen.split(/\s+/);
        root = {
          key: startFen,
          fen: startFen,
          isStandard: startFen === STANDARD_FEN,
          turn: start.turn(),
          moveNumber: Number(fields[5]) || 1,
          lineIds: [],
          lineNames: [],
          moves: [],
        };
        roots.set(startFen, root);
      }

      const lineId = String(line?.id ?? '');
      const lineName = String(line?.name || 'Naamloze variant');
      addUnique(root.lineIds, lineId);
      addUnique(root.lineNames, lineName);

      let parent = root;
      history.forEach((move, index) => {
        const siblings = parent === root ? root.moves : parent.children;
        let child = siblings.find(candidate => candidate.san === move.san);
        if (!child) {
          child = {
            san: move.san,
            uci: move.from + move.to + (move.promotion ?? ''),
            from: move.from,
            to: move.to,
            promotion: move.promotion ?? null,
            ply: index + 1,
            moveNumber: Number(move.before.split(/\s+/)[5]) || 1,
            color: move.color,
            positionKey: positionKey(move.after),
            fen: move.after,
            lineIds: [],
            lineNames: [],
            children: [],
          };
          siblings.push(child);
        }
        addUnique(child.lineIds, lineId);
        addUnique(child.lineNames, lineName);
        parent = child;
      });

      validLines++;
      totalPlies += history.length;
    } catch {
      invalidLines++;
    }
  }

  return { validLines, invalidLines, totalPlies, roots: [...roots.values()] };
}
