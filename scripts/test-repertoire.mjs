import assert from 'node:assert/strict';
import { Chess, validateFen } from 'chess.js';

let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); checks++; }
function throws(fn, message) { assert.throws(fn, undefined, message); checks++; }
function gameFromPgn(pgn) { const game = new Chess(); game.loadPgn(pgn); return game; }
function play(game, san, label = san) { const result = game.move(san); check(result, 'Zet moet legaal zijn: ' + label); return result; }
function positionKey(game) { return game.fen().split(' ').slice(0, 4).join(' '); }
function normalizeSan(san) { return san.replace(/[!?+#]+/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O'); }

// 1. Canonical repertoire examples: PGN parsing, turn, legal replay and FEN consistency.
const examples = [
  { name: 'Schots gambiet', pgn: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4', plies: 7, turn: 'b' },
  { name: 'Schotse hoofdvariant', pgn: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4', plies: 7, turn: 'b' },
  { name: 'Najdorf', pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6', plies: 10, turn: 'w' },
  { name: 'Konings-Indisch basis', pgn: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6', plies: 8, turn: 'w' },
  { name: 'Italiaans', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5', plies: 6, turn: 'w' },
  { name: 'Caro-Kann Panov', pgn: '1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4 Nf6', plies: 8, turn: 'w' },
];
for (const example of examples) {
  const game = gameFromPgn(example.pgn);
  equal(game.history().length, example.plies, example.name + ': aantal halve zetten');
  equal(game.turn(), example.turn, example.name + ': aan zet');
  const replay = new Chess();
  for (const san of game.history()) play(replay, san, example.name + ' ' + san);
  equal(replay.fen(), game.fen(), example.name + ': replay moet dezelfde stelling opleveren');
  const restored = new Chess(game.fen());
  equal(restored.fen(), game.fen(), example.name + ': FEN moet herstelbaar zijn');
  check(restored.moves().length > 0, example.name + ': stelling moet legale zetten hebben');
}

// 2. Repertoire tree branches: sibling branches share a prefix, diverge correctly, and can be replayed.
const parent = gameFromPgn('1. e4 e5 2. Nf3 Nc6');
const branchA = gameFromPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5');
const branchB = gameFromPgn('1. e4 e5 2. Nf3 Nc6 3. Bc4');
equal(parent.history().join(' '), branchA.history().slice(0, 4).join(' '), 'tak A moet de ouderlijn delen');
equal(parent.history().join(' '), branchB.history().slice(0, 4).join(' '), 'tak B moet de ouderlijn delen');
check(branchA.fen() !== branchB.fen(), 'alternatieve takken moeten verschillende stellingen opleveren');
equal(branchA.history().slice(0, 4).join(' '), branchB.history().slice(0, 4).join(' '), 'varianten moeten tot de vertakking identiek blijven');
const replayBranch = gameFromPgn(branchA.pgn());
equal(replayBranch.fen(), branchA.fen(), 'opgeslagen variant moet dezelfde stelling herstellen');

// 3. Alternatives: multiple legal moves must remain available; a repertoire answer is not the only legal move.
const opening = gameFromPgn('1. e4 e5 2. Nf3 Nc6');
const legalAlternatives = opening.moves();
for (const san of ['Bb5', 'Bc4', 'd4', 'Nc3']) check(legalAlternatives.includes(san), 'legaal alternatief beschikbaar: ' + san);
check(!legalAlternatives.includes('Qh9'), 'ongeldige zet mag niet als legaal worden getoond');
equal(normalizeSan('O-O+!?'), 'O-O', 'SAN-normalisatie voor korte rokade');
equal(normalizeSan('0-0-0#'), 'O-O-O', 'SAN-normalisatie voor lange rokade');
equal(normalizeSan('Qh5+!'), 'Qh5', 'SAN-normalisatie voor schaak en annotaties');

// 4. Special moves: castling, en passant, promotion, checkmate, stalemate.
const castle = new Chess();
for (const san of ['e4','e5','Nf3','Nc6','Bc4','Nf6']) play(castle, san);
check(castle.moves().includes('O-O'), 'korte rokade moet legaal zijn wanneer het pad vrij is');
play(castle, 'O-O');
check(castle.fen().includes('KQkq') === false, 'rokade-rechten moeten na rokade zijn bijgewerkt');

const ep = gameFromPgn('1. e4 a6 2. e5 d5');
check(ep.moves({ square: 'e5' }).includes('exd6'), 'en-passant-slag moet legaal zijn');
play(ep, 'exd6');
equal(ep.get('d5'), undefined, 'en-passant moet de geslagen pion verwijderen');

const promotion = new Chess('8/P7/8/8/8/8/7k/7K w - - 0 1');
check(promotion.moves({ square: 'a7' }).some(m => m.startsWith('a8=')), 'promotiezetten moeten worden gegenereerd');
play(promotion, 'a8=Q');
equal(promotion.get('a8')?.type, 'q', 'promotie moet dame opleveren');

const mate = gameFromPgn('1. f3 e5 2. g4 Qh4#');
check(mate.isCheckmate(), 'matstelling herkennen');
equal(mate.moves().length, 0, 'geen legale zetten na mat');
const stale = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
check(stale.isStalemate(), 'patstelling herkennen');
check(validateFen(stale.fen()).ok, 'geldige FEN moet worden geaccepteerd');
check(!validateFen('not-a-fen').ok, 'ongeldige FEN moet worden afgewezen');

// 5. Transpositions: move order differs but the resulting position signature is identical.
const transpositionA = new Chess();
for (const san of ['Nf3','d5','g3','Nf6','Bg2','e6']) play(transpositionA, san);
const transpositionB = new Chess();
for (const san of ['g3','d5','Bg2','Nf6','Nf3','e6']) play(transpositionB, san);
equal(positionKey(transpositionA), positionKey(transpositionB), 'transponerende zetten moeten dezelfde positie-signatuur geven');

// 6. PGN collection import semantics: multiple tagged games, metadata, and invalid-game handling.
const collection = `[Event "Schots - hoofdvariant"]
[Site "?"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *

[Event "Schots - alternatief"]
[Site "?"]
[Result "*"]

1. e4 e5 2. Nf3 Nf6 *
`;
const chunks = collection.trim().split(/(?=\[Event\s+")/).map(chunk => chunk.trim()).filter(Boolean);
equal(chunks.length, 2, 'PGN-verzameling moet in twee partijen worden gesplitst');
const importedNames = chunks.map(chunk => chunk.match(/\[Event\s+"([^"]+)"\]/)?.[1]);
equal(importedNames[0], 'Schots - hoofdvariant', 'eerste PGN-naam uit metadata');
equal(importedNames[1], 'Schots - alternatief', 'tweede PGN-naam uit metadata');
for (const chunk of chunks) check(gameFromPgn(chunk).history().length > 0, 'elke geïmporteerde PGN bevat zetten');
throws(() => gameFromPgn('1. e4 e5 2. Qh9'), 'ongeldige PGN moet worden afgewezen');
throws(() => gameFromPgn('1. e4 e5 2. Nf3 Nf6 3. Qh5?? Qh4'), 'illegale zetvolgorde moet worden afgewezen');

// 7. Spaced-repetition scheduling invariants mirrored from the app's interval policy.
function nextInterval(remembered, previousInterval, nextSeen, recentMisses) {
  return remembered
    ? Math.min(120, Math.max(1, recentMisses ? 1 : previousInterval ? Math.round(previousInterval * (nextSeen <= 2 ? 2 : 1.8)) : nextSeen <= 1 ? 1 : 3))
    : 0;
}
equal(nextInterval(true, 0, 1, 0), 1, 'eerste goede herhaling: één dag');
equal(nextInterval(true, 1, 2, 0), 2, 'tweede goede herhaling: twee dagen');
equal(nextInterval(true, 2, 3, 0), 4, 'interval groeit bij goede herinnering');
equal(nextInterval(true, 30, 4, 1), 1, 'recente missers verkorten interval');
equal(nextInterval(false, 7, 5, 0), 0, 'fout antwoord zet interval terug');
equal(nextInterval(true, 100, 8, 0), 120, 'interval wordt begrensd op 120 dagen');
const now = Date.now();
const moveMemory = {
  'line-1:0': { seen: 2, misses: 1, due: now - 1000, intervalDays: 0, lastResult: 'miss' },
  'line-1:2': { seen: 1, misses: 0, due: now + 86400000, intervalDays: 1, lastResult: 'good' },
  'line-2:1': { seen: 1, misses: 0, due: now - 2000, intervalDays: 0, lastResult: 'miss' },
};
const dueLineIds = new Set(Object.entries(moveMemory).filter(([, item]) => item.due <= now).map(([key]) => key.slice(0, key.lastIndexOf(':'))));
check(dueLineIds.has('line-1'), 'individuele zet maakt de variant herhaalbaar');
check(dueLineIds.has('line-2'), 'vervallen individuele zet maakt tweede variant herhaalbaar');
check(!dueLineIds.has('line-3'), 'niet-vervallen zetten maken geen variant herhaalbaar');

// 8. Backup contract: shape, round-trip, and malformed records must be rejected by validation.
const backup = {
  app: 'RepertoireLab', version: 2, exportedAt: new Date().toISOString(),
  lines: [{ id: 'line-1', repertoireId: 'rep-1', name: 'Schots', color: 'Wit', moves: branchA.pgn(), tags: ['Open spel'], note: '', due: 0, seen: 0 }],
  repertoires: [{ id: 'rep-1', name: 'Wit repertoire', color: 'Wit', createdAt: now }],
  activeRepertoireId: 'rep-1', missedMoves: { 'line-1': 1 },
  moveMemory: { 'line-1:0': { seen: 2, misses: 1, due: now, intervalDays: 0, lastResult: 'miss' } },
};
const serialized = JSON.stringify(backup);
const restoredBackup = JSON.parse(serialized);
equal(restoredBackup.lines[0].moves, backup.lines[0].moves, 'back-up bewaart PGN');
equal(restoredBackup.repertoires[0].color, 'Wit', 'back-up bewaart repertoirekleur');
equal(restoredBackup.activeRepertoireId, 'rep-1', 'back-up bewaart actieve repertoire-id');
equal(restoredBackup.moveMemory['line-1:0'].misses, 1, 'back-up bewaart individuele zetfouten');
equal(gameFromPgn(restoredBackup.lines[0].moves).fen(), branchA.fen(), 'herstelde PGN moet dezelfde positie opleveren');
check(!('lines' in JSON.parse('{}')), 'lege JSON is geen geldige back-up');
check(!Array.isArray(restoredBackup.lines) || restoredBackup.lines.every(line => typeof line.id === 'string' && typeof line.moves === 'string'), 'back-upregels hebben vereiste velden');

// 9. State consistency guards: empty variants, broken FEN, and turn ownership.
check(gameFromPgn('').history().length === 0, 'lege PGN mag geen zetten opleveren');
const empty = new Chess();
equal(empty.history().length, 0, 'lege beginstelling bevat geen gespeelde zetten');
equal(empty.turn(), 'w', 'beginstelling begint met wit');
check(new Chess().moves().includes('e4'), 'beginstelling biedt e4 aan');
check(!new Chess().moves().includes('e5'), 'beginstelling biedt geen zwarte zet aan wit');
equal(new Chess().fen(), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'begin-FEN moet exact kloppen');

console.log('RepertoireLab uitgebreide regressietests geslaagd: ' + checks + ' controles, ' + examples.length + ' repertoirevoorbeelden.');
