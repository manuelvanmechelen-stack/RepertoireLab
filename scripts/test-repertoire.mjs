import assert from 'node:assert/strict';
import { Chess, validateFen } from 'chess.js';
import { scheduleMoveResult, scheduleLineResult, scheduleLineGrade, isDue, selectDueOwnPly } from '../src/study/scheduling.mjs';
import { splitPgnCollection } from '../src/study/pgn.mjs';
import { analyzeGameAgainstRepertoire } from '../src/study/gameReview.mjs';
import { validateBackup } from '../src/study/backup.mjs';
import { rankCoverageMoves } from '../src/study/coverage.mjs';
import { calculateRepertoireMetrics } from '../src/study/analytics.mjs';
import { buildRepertoireTree, getRepertoireContinuations } from '../src/study/repertoireTree.mjs';
import { rankTrainingLines } from '../src/study/trainingPriority.mjs';
import { identifyOpening, listOpeningCatalog } from '../src/study/openingCatalog.mjs';

let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); checks++; }
function throws(fn, message) { assert.throws(fn, undefined, message); checks++; }
function gameFromPgn(pgn) { const game = new Chess(); game.loadPgn(pgn); return game; }
function play(game, san, label = san) { const result = game.move(san); check(result, 'Zet moet legaal zijn: ' + label); return result; }
function positionKey(game) { return game.fen().split(' ').slice(0, 4).join(' '); }
function normalizeSan(san) { return san.replace(/[!?+#]+/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O'); }

// 0b. Adaptive training priority inspired by Tabia's MIT-licensed due-line picker.
const priorityNow = 1_800_000_000_000;
const priorityLines = [
  { id: 'future', due: priorityNow + 2 * 86_400_000, intervalDays: 1 },
  { id: 'old-strong', due: priorityNow - 5 * 86_400_000, intervalDays: 12 },
  { id: 'weak-due', due: priorityNow - 86_400_000, intervalDays: 0 },
  { id: 'same-interval-old', due: priorityNow - 4 * 86_400_000, intervalDays: 3 },
  { id: 'same-interval-new', due: priorityNow - 86_400_000, intervalDays: 3 },
];
const priorityOrder = rankTrainingLines(priorityLines, {
  'same-interval-old:0': { seen: 4, misses: 3, due: priorityNow - 4 * 86_400_000 },
}, {}, priorityNow).map(line => line.id);
equal(priorityOrder[0], 'weak-due', 'zwakste vervallen variant komt eerst');
equal(priorityOrder[1], 'same-interval-old', 'bij gelijk interval komt de meest vervallen variant eerst');
equal(priorityOrder[priorityOrder.length - 1], 'future', 'toekomstige variant komt na vervallen varianten');
equal(rankTrainingLines(priorityLines, {}, {}, priorityNow).length, priorityLines.length, 'prioritering verliest geen varianten');

// 0c. Offline ECO/opening recognition: exact matches, prefix matches, and unknown inputs.
const scotchOpening = identifyOpening('1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4');
equal(scotchOpening?.eco, 'C45', 'Schots wordt offline herkend met ECO-code');
equal(scotchOpening?.name, 'Schots – hoofdvariant', 'Schotse hoofdvariant krijgt de juiste naam');
check(scotchOpening?.exact, 'exacte openingslijn wordt als exact gemarkeerd');
const scotchPrefix = identifyOpening('1. e4 e5 2. Nf3 Nc6');
check(typeof scotchPrefix?.eco === 'string', 'kortere lijn krijgt een ECO-herkenning uit de offline catalogus');
check(scotchPrefix?.exact === false, 'onvolledige opening krijgt voorlopige herkenning');
equal(identifyOpening('ongeldige PGN'), null, 'ongeldige PGN geeft geen opening');
check(listOpeningCatalog().length >= 35, 'offline catalogus bevat een bruikbare basisset');
check(listOpeningCatalog().length >= 3800, 'offline catalogus bevat de volledige Lichess ECO-basisset');
const najdorfOpening = identifyOpening('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6');
equal(najdorfOpening?.eco, 'B90', 'Najdorf wordt offline herkend met de verwachte ECO-code');
check(najdorfOpening?.name.toLowerCase().includes('najdorf'), 'Najdorf-herkenning bevat de openingsnaam');
const catalanOpening = identifyOpening('1. d4 Nf6 2. c4 e6 3. g3');
check(catalanOpening?.name.toLowerCase().includes('catalan') || catalanOpening?.name.toLowerCase().includes('catalaans'), 'Catalaans wordt offline herkend');


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

const promotion = new Chess('8/P7/8/8/8/7k/8/7K w - - 0 1');
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

// 5b. Position-based repertoire graph merges shared branches and transpositions.
const tree = buildRepertoireTree([
  { id: 'scotch-bb5', name: 'Schots met Bb5', moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
  { id: 'scotch-bc4', name: 'Schots met Bc4', moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4' },
  { id: 'fianchetto-a', name: 'Fianchetto volgorde A', moves: '1. Nf3 d5 2. g3 Nf6 3. Bg2 g6' },
  { id: 'fianchetto-b', name: 'Fianchetto volgorde B', moves: '1. g3 d5 2. Nf3 Nf6 3. Bg2 g6' },
]);
equal(tree.validLines, 4, 'repertoireboom verwerkt alle geldige varianten');
equal(tree.invalidLines, 0, 'repertoireboom rapporteert geen ongeldige varianten');
const startMoves = getRepertoireContinuations(tree, new Chess().fen());
check(startMoves.some(move => move.san === 'e4') && startMoves.some(move => move.san === 'Nf3') && startMoves.some(move => move.san === 'g3'), 'boom toont verschillende beginzetten als aparte takken');
const afterE4 = new Chess();
afterE4.move('e4');
const afterE5 = new Chess(afterE4.fen());
afterE5.move('e5');
afterE5.move('Nf3');
afterE5.move('Nc6');
const scotchBranches = getRepertoireContinuations(tree, afterE5.fen());
check(scotchBranches.some(move => move.san === 'Bb5') && scotchBranches.some(move => move.san === 'Bc4'), 'gedeelde stelling behoudt beide Schotse takken');
const fianchettoPositionA = new Chess();
for (const san of ['Nf3','d5','g3','Nf6','Bg2','g6']) fianchettoPositionA.move(san);
const fianchettoNode = tree.nodes.find(node => node.key === positionKey(fianchettoPositionA));
check(fianchettoNode, 'transpositiepositie staat als één gedeelde node in de boom');
check(fianchettoNode.pathCount >= 2, 'transpositiepositie bewaart beide verschillende zettenvolgordes');
check(tree.transpositionPositions >= 1, 'boom telt transpositieposities');
equal(getRepertoireContinuations(tree, 'invalid fen').length, 0, 'onbekende stelling geeft geen repertoirezetten');

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
  engineLineAudits: { 'line-1': { moves: branchA.pgn(), depth: 12, analyzedAt: now, findings: [{ ply: 3, san: 'Nf3', bestMove: 'Nc3', lossCp: 100, status: 'Mogelijk onnauwkeurig' }] } },
};
const serialized = JSON.stringify(backup);
const restoredBackup = JSON.parse(serialized);
equal(restoredBackup.lines[0].moves, backup.lines[0].moves, 'back-up bewaart PGN');
equal(restoredBackup.repertoires[0].color, 'Wit', 'back-up bewaart repertoirekleur');
equal(restoredBackup.activeRepertoireId, 'rep-1', 'back-up bewaart actieve repertoire-id');
equal(restoredBackup.moveMemory['line-1:0'].misses, 1, 'back-up bewaart individuele zetfouten');
equal(restoredBackup.engineLineAudits['line-1'].findings[0].lossCp, 100, 'back-up bewaart Stockfish-evaluatie');
throws(() => validateBackup({ ...backup, engineLineAudits: { 'line-1': { moves: 'bad', depth: 99, analyzedAt: now, findings: [] } } }), 'ongeldige Stockfish-back-updata wordt afgewezen');
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

// 10. Test the exact scheduling and PGN-splitting modules imported by the application.
const fixedNow = 1_800_000_000_000;
const firstGood = scheduleMoveResult(undefined, true, fixedNow);
equal(firstGood.seen, 1, 'eerste correcte zet telt als gezien');
equal(firstGood.misses, 0, 'eerste correcte zet heeft geen fout');
equal(firstGood.intervalDays, 1, 'eerste correcte zet komt na een dag terug');
equal(firstGood.due, fixedNow + 86_400_000, 'eerste correcte zet krijgt correcte vervaldatum');
const repeatedGood = scheduleMoveResult({ seen: 4, misses: 2, due: 0, intervalDays: 5, lastResult: 'miss' }, true, fixedNow);
equal(repeatedGood.intervalDays, 9, 'goede zet vergroot interval met factor 1,8 en afronding');
equal(repeatedGood.misses, 2, 'goede zet wist historische fouten niet');
const miss = scheduleMoveResult(firstGood, false, fixedNow);
equal(miss.seen, 2, 'foute zet telt als poging');
equal(miss.misses, 1, 'foute zet verhoogt foutenteller');
equal(miss.intervalDays, 0, 'foute zet reset interval');
equal(miss.due, fixedNow + 300_000, 'foute zet komt na vijf minuten terug');
equal(miss.lastResult, 'miss', 'foute zet wordt als fout gemarkeerd');
const firstLine = scheduleLineResult({ seen: 0, intervalDays: 0 }, true, 0, fixedNow);
equal(firstLine.intervalDays, 1, 'eerste bekende variant krijgt een dag');
const secondLine = scheduleLineResult({ seen: 1, intervalDays: 1 }, true, 0, fixedNow);
equal(secondLine.intervalDays, 2, 'tweede bekende variant verdubbelt interval');
const shakyLine = scheduleLineResult({ seen: 8, intervalDays: 21 }, true, 1, fixedNow);
equal(shakyLine.intervalDays, 1, 'recente individuele fouten verkorten variantinterval');
const forgottenLine = scheduleLineResult({ seen: 3, intervalDays: 5 }, false, 0, fixedNow);
equal(forgottenLine.due, fixedNow + 300_000, 'niet onthouden variant komt na vijf minuten terug');
const gradeAgain = scheduleLineGrade({ seen: 2, intervalDays: 3 }, 'again', 0, fixedNow);
equal(gradeAgain.intervalDays, 0, 'Opnieuw reset de herhaalinterval');
equal(gradeAgain.due, fixedNow + 300_000, 'Opnieuw plant een korte herhaling na vijf minuten');
equal(gradeAgain.seen, 3, 'elke beoordeling telt als trainingsbeurt');
const gradeHard = scheduleLineGrade({ seen: 4, intervalDays: 10 }, 'hard', 0, fixedNow);
equal(gradeHard.intervalDays, 12, 'Moeilijk vergroot het interval voorzichtig');
const gradeGood = scheduleLineGrade({ seen: 4, intervalDays: 10 }, 'good', 0, fixedNow);
equal(gradeGood.intervalDays, 18, 'Goed vergroot het interval met factor 1,8');
const gradeEasy = scheduleLineGrade({ seen: 4, intervalDays: 10 }, 'easy', 0, fixedNow);
equal(gradeEasy.intervalDays, 25, 'Makkelijk vergroot het interval met factor 2,5');
const gradeEasyFirst = scheduleLineGrade(undefined, 'easy', 0, fixedNow);
equal(gradeEasyFirst.intervalDays, 4, 'een nieuw makkelijk item krijgt vier dagen');
const gradeHardWithErrors = scheduleLineGrade({ seen: 5, intervalDays: 20 }, 'hard', 2, fixedNow);
equal(gradeHardWithErrors.intervalDays, 1, 'recente zetfouten beperken het interval van Moeilijk');
const cappedGrade = scheduleLineGrade({ seen: 12, intervalDays: 100 }, 'easy', 0, fixedNow);
equal(cappedGrade.intervalDays, 120, 'interval heeft een veilige bovengrens');
throws(() => scheduleLineGrade(undefined, 'unknown', 0, fixedNow), 'onbekende beoordeling wordt afgewezen');
check(isDue(undefined, fixedNow), 'ontbrekende vervaldatum wordt als direct verschuldigd behandeld');
check(isDue(0, fixedNow), 'nulvervaldatum wordt als direct verschuldigd behandeld');
check(isDue(fixedNow - 1, fixedNow), 'verlopen datum is verschuldigd');
check(!isDue(fixedNow + 1, fixedNow), 'toekomstige datum is niet verschuldigd');
equal(selectDueOwnPly(6, 'Wit', { 'x:0': { due: fixedNow + 100 }, 'x:2': { due: fixedNow - 1 } }, 'x', fixedNow + 50, fixedNow), 2, 'wit herhaalt eerste eigen zet die verschuldigd is');
equal(selectDueOwnPly(6, 'Zwart', { 'x:1': { due: fixedNow - 1 } }, 'x', fixedNow + 50, fixedNow), 1, 'zwart herhaalt eerste eigen zet die verschuldigd is');
equal(selectDueOwnPly(6, 'Wit', {}, 'x', fixedNow - 1, fixedNow), 0, 'verlopen hele variant start vanaf begin');
equal(selectDueOwnPly(6, 'Wit', {}, 'x', fixedNow + 100, fixedNow), 0, 'geen vervallen zet valt terug op beginstelling');

const gameOne = '[Event "Game one"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';
const gameTwo = '[Event "Game two"]\n[Site "Club"]\n\n1. d4 d5 0-1';
const splitCollection = splitPgnCollection(gameOne + '\n\n' + gameTwo);
equal(splitCollection.length, 2, 'PGN-verzameling wordt op Event-header gesplitst');
check(splitCollection[0].includes('Game one') && splitCollection[1].includes('Game two'), 'splitsen behoudt partijvolgorde en headers');
equal(splitPgnCollection('   ').length, 0, 'lege PGN levert geen partijen op');
equal(splitPgnCollection('1. e4 e5').length, 1, 'PGN zonder Event-header blijft één invoer');
equal(splitPgnCollection(gameOne).length, 1, 'één PGN-partij blijft één invoer');
const noEventCollection = '1. e4 e5 2. Nf3 Nc6 1-0\n[Site "Club"]\n[White "A"]\n[Black "B"]\n\n1. d4 d5 0-1';
equal(splitPgnCollection(noEventCollection).length, 2, 'PGN zonder Event-tags wordt op voltooide partijgrens gesplitst');
check(splitPgnCollection(noEventCollection)[1].includes('[White "A"]'), 'splitsen zonder Event behoudt de volgende partijheaders');
equal(splitPgnCollection('[Event "Eén"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 *').length, 1, 'meerdere headers binnen één partij worden niet gesplitst');

// 11. Exercise the exact backup validator used by the restore UI.
const checkedBackup = validateBackup(backup);
equal(checkedBackup.lines.length, 1, 'validator accepteert geldige variant');
equal(checkedBackup.repertoires.length, 1, 'validator accepteert geldig repertoire');
equal(checkedBackup.activeRepertoireId, 'rep-1', 'validator bewaart geldig actieve repertoire');
equal(checkedBackup.moveMemory['line-1:0'].misses, 1, 'validator bewaart herhalingsgegevens');
throws(() => validateBackup({ lines: [backup.lines[0], backup.lines[0]] }), 'dubbele variant-ID wordt afgewezen');
throws(() => validateBackup({ ...backup, lines: [{ ...backup.lines[0], moves: '1. e4 Qh9' }] }), 'ongeldige PGN in back-up wordt afgewezen');
throws(() => validateBackup({ ...backup, repertoires: [{ ...backup.repertoires[0] }, { ...backup.repertoires[0] }] }), 'dubbele repertoire-ID wordt afgewezen');
throws(() => validateBackup({ ...backup, missedMoves: { broken: -1 } }), 'negatieve foutenteller wordt afgewezen');
throws(() => validateBackup({ ...backup, moveMemory: { broken: { seen: -1, misses: 0, due: 0, intervalDays: 0 } } }), 'negatieve geheugenwaarde wordt afgewezen');
throws(() => validateBackup({ lines: [{ ...backup.lines[0], color: 'Paars' }] }), 'onbekende kleur wordt afgewezen');
const fallbackBackup = validateBackup({ ...backup, activeRepertoireId: 'missing-id' });
equal(fallbackBackup.activeRepertoireId, 'rep-1', 'ongeldige actieve repertoirekeuze valt terug op bestaand repertoire');
const emptyBackup = validateBackup({ lines: [], repertoires: [] });
equal(emptyBackup.lines.length, 0, 'lege maar geldige back-up kan worden hersteld');
equal(emptyBackup.activeRepertoireId, '', 'lege back-up heeft geen actief repertoire');

const coverageSample = [
  { san: 'Nf6', uci: 'g8f6', white: 20, draws: 30, black: 50 },
  { san: 'Nc6', uci: 'b8c6', white: 90, draws: 80, black: 130 },
  { san: 'd6', uci: 'd7d6', white: 2, draws: 4, black: 5 },
  { san: 'e6', uci: 'e7e6', white: 10, draws: 5, black: 5 },
];
const rankedCoverage = rankCoverageMoves(coverageSample);
equal(rankedCoverage.length, 3, 'coverage toont maximaal drie vervolgen boven de minimumsteekproef');
equal(rankedCoverage[0].san, 'Nc6', 'coverage sorteert op grootste partijsteekproef');
equal(rankedCoverage[0].games, 300, 'coverage telt alle partijresultaten op');
equal(rankedCoverage[2].san, 'e6', 'coverage neemt de grens van twintig partijen mee');
equal(rankCoverageMoves(coverageSample, 40, 1)[0].san, 'Nc6', 'coverage ondersteunt eigen drempel en limiet');

equal(rankCoverageMoves(null).length, 0, 'ongeldige invoer geeft geen suggesties');

const dashboardMetrics = calculateRepertoireMetrics([
  { id: 'a', name: 'Hoofdvariant', moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5', note: 'Plan' },
  { id: 'b', name: 'Italiaans', moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4', note: '' },
  { id: 'invalid', moves: '1. e4 Qh9', note: 'Ongeldig' },
], {
  'a:0': { seen: 4, misses: 1, due: 100 },
  'a:2': { seen: 2, misses: 0, due: 9_000_000_000_000 },
  'unknown:0': { seen: 100, misses: 0, due: 0 },
}, 1_000, {
  a: { moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5', findings: [{ lossCp: 0 }, { lossCp: 100 }, { lossCp: null }, { lossCp: 220 }] },
  b: { moves: 'stale line', findings: [{ lossCp: 0 }] },
});
equal(dashboardMetrics.validLines, 2, 'dashboard sluit ongeldige lijnen uit');
equal(dashboardMetrics.moveCount, 10, 'dashboard telt halve zetten uit geldige lijnen');
equal(dashboardMetrics.uniquePositions, 5, 'dashboard dedupliceert gedeelde stellingen');
equal(dashboardMetrics.branchingPositions, 1, 'dashboard vindt een stelling met meerdere vervolgen');
equal(dashboardMetrics.notedLines, 1, 'dashboard telt alleen lijnen met een plan');
equal(dashboardMetrics.noteCoverage, 50, 'dashboard berekent plannotities-dekking');
equal(dashboardMetrics.totalAttempts, 6, 'dashboard negeert trainingsdata van onbekende lijnen');
equal(dashboardMetrics.totalMisses, 1, 'dashboard telt historische fouten veilig');
equal(dashboardMetrics.accuracy, 83, 'dashboard berekent nauwkeurigheid uit pogingen');
equal(dashboardMetrics.dueMoves, 1, 'dashboard telt vervallen individuele zetten');
equal(dashboardMetrics.engineAuditMoves, 4, 'dashboard telt alleen analyses van ongewijzigde lijnen');
equal(dashboardMetrics.engineComparableMoves, 3, 'dashboard sluit niet-vergelijkbare enginezetten uit');
equal(dashboardMetrics.engineConsistency, 33, 'dashboard berekent beperkte engineconsistentie transparant');
equal(dashboardMetrics.engineOutliers, 1, 'dashboard telt grote engine-afwijkingen');
equal(calculateRepertoireMetrics([{ id: 'a', moves: '1. e4 e5' }], {}, 1_000).engineConsistency, null, 'geen engine-score zonder geldige screening');
equal(calculateRepertoireMetrics([], {}).accuracy, null, 'dashboard toont geen verzonnen nauwkeurigheid zonder pogingen');


// 12. Game review: identify the first concrete repertoire deviation.
const savedLines = [
  { id: 'main', name: 'Open Spaans', color: 'Wit', moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
  { id: 'italian', name: 'Italiaans', color: 'Wit', moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4' },
];
const deviatingGame = '[Event "Testpartij"]\n[White "Speler"]\n[Black "Tegenstander"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 d6 3. d4 *';
const review = analyzeGameAgainstRepertoire(deviatingGame, savedLines);
equal(review.players, 'Speler – Tegenstander', 'review gebruikt partijheaders');
equal(review.matchedPlies, 3, 'review vindt de langste gedeelde zettenprefix');
equal(review.firstDeviation?.ply, 3, 'review markeert de eerste afwijkende halve zet');
equal(review.firstDeviation?.san, 'd6', 'review toont de daadwerkelijk gespeelde afwijkende zet');
equal(review.firstDeviation?.expectedMoves.join(','), 'Nc6', 'review toont de opgeslagen antwoorden');
check(review.summary.includes('eerste afwijking bij 2... d6'), 'review maakt afwijking begrijpelijk met zetnummer');
const coveredGame = analyzeGameAgainstRepertoire('1. e4 e5 2. Nf3 Nc6 3. Bc4', savedLines);
equal(coveredGame.firstDeviation, null, 'een volledige match tot het einde van de partij heeft geen afwijking');
check(coveredGame.summary.includes('Italiaans'), 'review herkent welke repertoirelijn gevolgd is');
const uncoveredGame = analyzeGameAgainstRepertoire('1. e4 e5 2. Nf3', [{ name: 'Korte lijn', color: 'Wit', moves: '1. e4 e5' }]);
equal(uncoveredGame.firstDeviation?.kind, 'gap', 'review herkent wanneer een gespeelde voortzetting buiten de opgeslagen lijn valt');
const transpositionReview = analyzeGameAgainstRepertoire(
  '1. g3 d5 2. Nf3 Nf6 3. Bg2 g6 4. O-O',
  [{ id: 'fianchetto', name: 'Fianchetto-opbouw', color: 'Wit', moves: '1. Nf3 d5 2. g3 Nf6 3. Bg2 g6 4. O-O' }],
);
equal(transpositionReview.firstDeviation, null, 'review herkent een transpositie met andere zettenvolgorde');
equal(transpositionReview.transpositionCount, 3, 'review registreert de halve zetten tot de transpositie');
check(transpositionReview.summary.includes('transpositie herkend'), 'review benoemt de transpositie in het verslag');
throws(() => analyzeGameAgainstRepertoire('geen geldige PGN', savedLines), 'review weigert een partij zonder geldige zetten');

console.log('RepertoireLab uitgebreide regressietests geslaagd: ' + checks + ' controles, ' + examples.length + ' repertoirevoorbeelden.');
