import { Chess } from 'chess.js';

const positionKey = game => game.fen().split(' ').slice(0, 4).join(' ');

/**
 * Build a position-based repertoire graph. Identical positions reached by
 * different legal move orders share a node; edges keep all source variants.
 * FEN's first four fields preserve side to move, castling rights and en-passant.
 */
export function buildRepertoireTree(lines = []) {
  const nodes = new Map();
  const start = new Chess();
  const rootKey = positionKey(start);
  nodes.set(rootKey, {
    key: rootKey, fen: start.fen(), ply: 0,
    incoming: [], moves: new Map(), lineIds: new Set(), pathSignatures: new Set(['']),
  });
  let validLines = 0;
  let invalidLines = 0;
  let totalPlies = 0;

  for (const line of lines) {
    try {
      const game = new Chess();
      game.loadPgn(String(line?.moves ?? ''));
      const history = game.history({ verbose: true });
      if (!history.length) { invalidLines++; continue; }
      validLines++;
      totalPlies += history.length;
      // PGNs may begin from a composed or study position. Replay from the
      // declared FEN instead of incorrectly applying those moves to the
      // standard initial position.
      const startFen = game.getHeaders().FEN;
      const cursor = startFen ? new Chess(startFen) : new Chess();
      for (const move of history) {
        const beforeKey = positionKey(cursor);
        const before = nodes.get(beforeKey) ?? {
          key: beforeKey, fen: cursor.fen(), ply: cursor.history().length,
          incoming: [], moves: new Map(), lineIds: new Set(), pathSignatures: new Set(),
        };
        before.pathSignatures.add(cursor.history().join(' '));
        nodes.set(beforeKey, before);
        const played = cursor.move(move);
        const afterKey = positionKey(cursor);
        const after = nodes.get(afterKey) ?? {
          key: afterKey, fen: cursor.fen(), ply: cursor.history().length,
          incoming: [], moves: new Map(), lineIds: new Set(), pathSignatures: new Set(),
        };
        after.pathSignatures.add(cursor.history().join(' '));
        nodes.set(afterKey, after);
        const existing = before.moves.get(played.san) ?? {
          san: played.san, uci: played.from + played.to + (played.promotion ?? ''),
          from: played.from, to: played.to, promotion: played.promotion ?? null,
          nextPositionKey: afterKey, lineIds: new Set(), lineNames: new Set(),
        };
        existing.lineIds.add(line.id);
        existing.lineNames.add(line.name || 'Naamloze variant');
        before.moves.set(played.san, existing);
        if (!after.incoming.some(edge => edge.fromKey === beforeKey && edge.san === played.san)) {
          after.incoming.push({ fromKey: beforeKey, san: played.san });
        }
        before.lineIds.add(line.id);
        after.lineIds.add(line.id);
      }
    } catch {
      invalidLines++;
    }
  }

  const positions = [...nodes.values()];
  const edges = positions.reduce((sum, node) => sum + node.moves.size, 0);
  const branchingPositions = positions.filter(node => node.moves.size > 1).length;
  const transpositionPositions = positions.filter(node => node.pathSignatures.size > 1).length;
  const publicNode = node => ({
    key: node.key, fen: node.fen, ply: node.ply, pathCount: node.pathSignatures.size,
    incoming: node.incoming.map(edge => ({ ...edge })),
    moves: [...node.moves.values()].map(edge => ({
      ...edge, lineIds: [...edge.lineIds], lineNames: [...edge.lineNames],
    })).sort((a, b) => b.lineIds.length - a.lineIds.length || a.san.localeCompare(b.san)),
    lineIds: [...node.lineIds],
  });
  return {
    rootKey, validLines, invalidLines, totalPlies,
    positionCount: positions.length, edgeCount: edges,
    branchingPositions, transpositionPositions,
    nodes: positions.map(publicNode),
  };
}

/** Return only repertoire continuations legal from a supplied position. */
export function getRepertoireContinuations(tree, fen) {
  if (!tree || !Array.isArray(tree.nodes)) return [];
  const key = String(fen ?? '').split(' ').slice(0, 4).join(' ');
  return tree.nodes.find(node => node.key === key)?.moves ?? [];
}
