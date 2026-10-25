import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

const examples = [
  { name: 'Schots gambiet', pgn: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4', plies: 7, turn: 'b' },
  { name: 'Schotse hoofdvariant', pgn: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4', plies: 7, turn: 'b' },
  { name: 'Najdorf', pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6', plies: 10, turn: 'w' },
  { name: 'Konings-Indisch basis', pgn: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6', plies: 8, turn: 'w' },
];
for (const example of examples) {
  const game = new Chess();
  game.loadPgn(example.pgn);
  assert.equal(game.history().length, example.plies, example.name + ': aantal halve zetten');
  assert.equal(game.turn(), example.turn, example.name + ': aan zet');
  const replay = new Chess();
  for (const san of game.history()) assert.ok(replay.move(san), example.name + ': zet ' + san + ' moet legaal zijn');
  assert.equal(replay.fen(), game.fen(), example.name + ': replay moet dezelfde stelling opleveren');
}

const branching = new Chess();
branching.move('e4'); branching.move('e5'); branching.move('Nf3');
const fenBefore = branching.fen();
branching.move('Nc6');
assert.notEqual(branching.fen(), fenBefore, 'een zet verandert de stelling');
const restored = new Chess(fenBefore);
assert.equal(restored.turn(), 'b', 'FEN-herstel moet aan zet correct behouden');
assert.ok(restored.moves().includes('Nc6'), 'FEN-herstel moet legale zetten kunnen genereren');

const transpositionA = new Chess();
for (const san of ['Nf3','d5','g3','Nf6','Bg2','e6']) transpositionA.move(san);
const transpositionB = new Chess();
for (const san of ['g3','d5','Bg2','Nf6','Nf3','e6']) transpositionB.move(san);
assert.equal(transpositionA.fen().split(' ').slice(0,4).join(' '), transpositionB.fen().split(' ').slice(0,4).join(' '), 'transponerende zetten moeten dezelfde positie-signatuur geven');

assert.throws(() => { const invalid = new Chess(); invalid.loadPgn('1. e4 e5 2. Qh9'); }, 'ongeldige PGN moet worden afgewezen');
console.log('RepertoireLab checks geslaagd: ' + examples.length + ' voorbeeldlijnen, replay/FEN, legale zetten, transpositie en foutieve PGN.');
