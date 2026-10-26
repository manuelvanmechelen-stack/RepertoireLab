import { Chess } from 'chess.js';

/**
 * Compare one played game with the saved repertoire and report the earliest
 * move that leaves all stored lines. The report is descriptive only: a missing
 * line is not automatically a bad chess move.
 */
export function analyzeGameAgainstRepertoire(pgn, lines) {
  const game = new Chess();
  game.loadPgn(String(pgn ?? ''));
  const history = game.history();
  const headers = game.header();
  if (!history.length) throw new Error('De partij bevat geen zetten.');

  const candidates = [];
  for (const line of lines ?? []) {
    try {
      const replay = new Chess();
      replay.loadPgn(String(line.moves ?? ''));
      const moves = replay.history();
      if (moves.length) candidates.push({ name: line.name || 'Naamloze variant', color: line.color, moves });
    } catch {
      // Ignore invalid legacy repertoire lines; they must not block game review.
    }
  }

  let bestMatch = { name: '', length: 0, moves: [] };
  for (const line of candidates) {
    let shared = 0;
    while (shared < Math.min(history.length, line.moves.length) && history[shared] === line.moves[shared]) shared++;
    if (shared > bestMatch.length) bestMatch = { name: line.name, length: shared, moves: line.moves };
  }

  let firstDeviation = null;
  for (let ply = 0; ply < history.length; ply++) {
    const matchingPrefix = candidates.filter(line =>
      ply <= line.moves.length && history.slice(0, ply).every((san, index) => line.moves[index] === san)
    );
    const continuations = matchingPrefix
      .filter(line => line.moves.length > ply)
      .map(line => ({ name: line.name, san: line.moves[ply], color: line.color }));
    if (!matchingPrefix.length) {
      firstDeviation = {
        ply,
        san: history[ply],
        expectedMoves: [],
        side: ply % 2 === 0 ? 'Wit' : 'Zwart',
        kind: 'gap',
      };
      break;
    }
    if (continuations.length && !continuations.some(line => line.san === history[ply])) {
      firstDeviation = {
        ply,
        san: history[ply],
        expectedMoves: [...new Set(continuations.map(line => line.san))],
        side: ply % 2 === 0 ? 'Wit' : 'Zwart',
        kind: 'deviation',
      };
      break;
    }
    if (!continuations.length && matchingPrefix.length) {
      firstDeviation = {
        ply,
        san: history[ply],
        expectedMoves: [],
        side: ply % 2 === 0 ? 'Wit' : 'Zwart',
        kind: 'gap',
      };
      break;
    }
  }

  const moveLabel = ply => Math.floor(ply / 2) + (ply % 2 === 0 ? '.' : '...');
  const players = (headers.White ?? 'Wit') + ' – ' + (headers.Black ?? 'Zwart');
  const result = headers.Result ?? '*';
  const matchSummary = bestMatch.length
    ? 'langste match: ' + bestMatch.length + ' halve zetten' + (bestMatch.name ? ' — ' + bestMatch.name : '')
    : 'geen opgeslagen lijn komt overeen met de partij';
  let deviationSummary = 'geen afwijking gevonden binnen de gespeelde zetten';
  if (firstDeviation?.kind === 'deviation') {
    deviationSummary = 'eerste afwijking bij ' + moveLabel(firstDeviation.ply) + ' ' + firstDeviation.san +
      ' (' + firstDeviation.side + ')' +
      (firstDeviation.expectedMoves.length ? '; opgeslagen vervolg(en): ' + firstDeviation.expectedMoves.join(', ') : '');
  } else if (firstDeviation?.kind === 'gap') {
    deviationSummary = 'repertoiredekking ontbreekt vanaf ' + moveLabel(firstDeviation.ply) + ' ' + firstDeviation.san +
      '; er was geen opgeslagen vervolg na de voorafgaande zetten';
  }

  return {
    players,
    result,
    plyCount: history.length,
    bestMatchName: bestMatch.name,
    matchedPlies: bestMatch.length,
    firstDeviation,
    summary: players + ' (' + result + '): ' + matchSummary + '; ' + deviationSummary + '.',
  };
}
