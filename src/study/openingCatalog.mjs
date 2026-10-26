import { Chess } from 'chess.js';

// Compact offline ECO recognition catalogue. Move sequences are replayed by chess.js;
// only a position reached by the supplied line can match. Online Explorer remains
// the source for broad statistics and full ECO coverage.
const OPENINGS = [
  ['C45','Schots – hoofdvariant','1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4'],
  ['C44','Schots gambiet','1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4'],
  ['C50','Italiaans','1. e4 e5 2. Nf3 Nc6 3. Bc4'],
  ['C54','Italiaans – Giuoco Pianissimo','1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3'],
  ['C60','Spaans (Ruy Lopez)','1. e4 e5 2. Nf3 Nc6 3. Bb5'],
  ['C65','Spaans – Berlijnse verdediging','1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6'],
  ['C42','Petrov-verdediging','1. e4 e5 2. Nf3 Nf6'],
  ['C00','Franse verdediging','1. e4 e6'],
  ['C02','Frans – doorschuifvariant','1. e4 e6 2. d4 d5 3. e5'],
  ['C01','Frans – ruilvariant','1. e4 e6 2. d4 d5 3. exd5 exd5'],
  ['B10','Caro-Kann-verdediging','1. e4 c6'],
  ['B12','Caro-Kann – klassieke opbouw','1. e4 c6 2. d4 d5 3. e5 Bf5'],
  ['B20','Siciliaanse verdediging','1. e4 c5'],
  ['B22','Siciliaans – Alapin','1. e4 c5 2. c3'],
  ['B30','Siciliaans – Rossolimo','1. e4 c5 2. Nf3 Nc6 3. Bb5'],
  ['B50','Siciliaans – Moskou','1. e4 c5 2. Nf3 d6 3. Bb5+'],
  ['B90','Siciliaans – Najdorf','1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6'],
  ['B70','Siciliaans – Draak','1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6'],
  ['B33','Siciliaans – Svesjnikov','1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5'],
  ['B21','Siciliaans – Smith-Morra-gambiet','1. e4 c5 2. d4 cxd4 3. c3'],
  ['B06','Moderne verdediging','1. e4 g6'],
  ['B07','Pirc-verdediging','1. e4 d6 2. d4 Nf6 3. Nc3 g6'],
  ['B01','Scandinavische verdediging','1. e4 d5'],
  ['C20','Open spel – koningspionopening','1. e4 e5'],
  ['D00','Damespionopening','1. d4 d5'],
  ['D06','Queen’s Gambit','1. d4 d5 2. c4'],
  ['D10','Slavische verdediging','1. d4 d5 2. c4 c6'],
  ['D30','Queen’s Gambit – geweigerd','1. d4 d5 2. c4 e6'],
  ['E20','Nimzo-Indische verdediging','1. d4 Nf6 2. c4 e6 3. Nc3 Bb4'],
  ['E60','Konings-Indische verdediging','1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6'],
  ['A60','Moderne Benoni','1. d4 Nf6 2. c4 c5 3. d5 e6'],
  ['E00','Catalaanse opening','1. d4 Nf6 2. c4 e6 3. g3'],
  ['A10','Engelse opening','1. c4'],
  ['A20','Engels – koningsvleugel-fianchetto','1. c4 e5'],
  ['A04','Réti-opening','1. Nf3'],
  ['A07','Réti – koningsvleugel-fianchetto','1. Nf3 d5 2. g3'],
  ['A45','Indische verdediging','1. d4 Nf6'],
  ['A80','Hollandse verdediging','1. d4 f5'],
  ['A40','Engelse verdediging','1. d4 e6 2. c4 b6'],
  ['C46','Vierpaardenspel','1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6'],
];

const NORMALIZE = san => String(san ?? '').replace(/[!?+#]+/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');

const compiled = OPENINGS.map(([eco, name, pgn]) => {
  const game = new Chess();
  try { game.loadPgn(pgn); return { eco, name, moves: game.history().map(NORMALIZE) }; }
  catch { return null; }
}).filter(Boolean);

/** Return the most specific offline ECO match for a PGN or SAN sequence. */
export function identifyOpening(pgnOrMoves = '') {
  let moves;
  try {
    if (Array.isArray(pgnOrMoves)) moves = pgnOrMoves.map(NORMALIZE);
    else {
      const game = new Chess();
      game.loadPgn(String(pgnOrMoves ?? ''));
      moves = game.history().map(NORMALIZE);
    }
  } catch { return null; }
  const matches = compiled.filter(opening =>
    opening.moves.length <= moves.length && opening.moves.every((move, index) => moves[index] === move)
  ).sort((a, b) => b.moves.length - a.moves.length || a.eco.localeCompare(b.eco));
  if (!matches.length) return null;
  const match = matches[0];
  return { eco: match.eco, name: match.name, matchedPlies: match.moves.length, exact: match.moves.length === moves.length };
}

export function listOpeningCatalog() {
  return compiled.map(({ eco, name, moves }) => ({ eco, name, moves: [...moves] }));
}
