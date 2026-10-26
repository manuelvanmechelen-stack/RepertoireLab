import { Chess } from 'chess.js';

const positionKey = game => game.fen().split(' ').slice(0, 4).join(' ');
const normalizeSan = san => String(san ?? '').replace(/[!?+#]+/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');

/**
 * Compare a played game to the repertoire by chess position, not only by
 * identical move order. If a different move order reaches a stored position,
 * continue the review from that transposition rather than calling it a gap.
 */
export function analyzeGameAgainstRepertoire(pgn, lines) {
  const game = new Chess();
  game.loadPgn(String(pgn ?? ''));
  const history = game.history({ verbose: true });
  const headers = game.header();
  if (!history.length) throw new Error('De partij bevat geen zetten.');

  const nodes = new Map();
  for (const line of lines ?? []) {
    try {
      const replay = new Chess();
      replay.loadPgn(String(line.moves ?? ''));
      const moves = replay.history({ verbose: true });
      if (!moves.length) continue;
      const cursor = new Chess();
      for (const move of moves) {
        const key = positionKey(cursor);
        const node = nodes.get(key) ?? { continuations: new Map() };
        const normalized = normalizeSan(move.san);
        const existing = node.continuations.get(normalized) ?? { san: move.san, names: new Set() };
        existing.names.add(line.name || 'Naamloze variant');
        node.continuations.set(normalized, existing);
        nodes.set(key, node);
        cursor.move(move);
      }
    } catch {
      // An invalid legacy line must not prevent review of valid lines.
    }
  }

  const played = new Chess();
  let firstDeviation = null;
  let matchedPlies = 0;
  let bestMatchName = '';
  let transpositionCount = 0;
  let ply = 0;
  while (ply < history.length) {
    const node = nodes.get(positionKey(played));
    const san = history[ply].san;
    const expected = node ? [...node.continuations.values()] : [];
    const matching = expected.find(item => normalizeSan(item.san) === normalizeSan(san));
    if (matching) {
      matchedPlies++;
      bestMatchName = [...matching.names][0] ?? bestMatchName;
      played.move(history[ply]);
      ply++;
      continue;
    }

    // Look ahead for a genuine position match. Position keys include turn,
    // castling rights and en-passant state; a mere similar-looking board is not enough.
    const lookahead = new Chess(played.fen());
    let rejoinPly = -1;
    const lookaheadLimit = Math.min(history.length, ply + 13);
    for (let candidatePly = ply; candidatePly < lookaheadLimit; candidatePly++) {
      lookahead.move(history[candidatePly]);
      if (nodes.has(positionKey(lookahead))) {
        rejoinPly = candidatePly + 1;
        break;
      }
    }
    if (rejoinPly > ply) {
      transpositionCount += rejoinPly - ply;
      while (ply < rejoinPly) {
        played.move(history[ply]);
        ply++;
      }
      continue;
    }

    firstDeviation = {
      ply, san, expectedMoves: expected.map(item => item.san),
      side: ply % 2 === 0 ? 'Wit' : 'Zwart',
      kind: node ? 'deviation' : 'gap',
    };
    break;
  }

  const moveLabel = movePly => Math.floor(movePly / 2) + 1 + (movePly % 2 === 0 ? '.' : '...');
  const players = (headers.White ?? 'Wit') + ' – ' + (headers.Black ?? 'Zwart');
  const result = headers.Result ?? '*';
  const matchSummary = matchedPlies
    ? 'repertoirezet gematcht: ' + matchedPlies + ' halve zetten' + (bestMatchName ? ' — ' + bestMatchName : '')
    : 'geen directe repertoirezetten gematcht';
  let deviationSummary = 'geen afwijking gevonden binnen de gespeelde zetten';
  if (firstDeviation?.kind === 'deviation') {
    deviationSummary = 'eerste afwijking bij ' + moveLabel(firstDeviation.ply) + ' ' + firstDeviation.san +
      ' (' + firstDeviation.side + ')' +
      (firstDeviation.expectedMoves.length ? '; opgeslagen vervolg(en): ' + firstDeviation.expectedMoves.join(', ') : '');
  } else if (firstDeviation?.kind === 'gap') {
    deviationSummary = 'repertoiredekking ontbreekt vanaf ' + moveLabel(firstDeviation.ply) + ' ' + firstDeviation.san +
      '; er was geen opgeslagen vervolg vanuit deze stelling';
  }
  const transpositionSummary = transpositionCount
    ? '; transpositie herkend na ' + transpositionCount + ' halve zetten in een andere zettenvolgorde'
    : '';

  return {
    players, result, plyCount: history.length, bestMatchName,
    matchedPlies, transpositionCount, firstDeviation,
    summary: players + ' (' + result + '): ' + matchSummary + transpositionSummary + '; ' + deviationSummary + '.',
  };
}
