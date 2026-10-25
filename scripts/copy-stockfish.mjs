import fs from 'node:fs';
import path from 'node:path';

const packageRoot = path.resolve('node_modules/stockfish');
const outputDir = path.resolve('public/stockfish');
const requiredFiles = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

function findFile(directory, filename) {
  if (!fs.existsSync(directory)) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === filename) return fullPath;
    if (entry.isDirectory()) {
      const found = findFile(fullPath, filename);
      if (found) return found;
    }
  }
  return null;
}

fs.mkdirSync(outputDir, { recursive: true });
for (const filename of requiredFiles) {
  const source = findFile(packageRoot, filename);
  if (!source) throw new Error('Stockfish-bestand ontbreekt in npm-pakket: ' + filename);
  fs.copyFileSync(source, path.join(outputDir, filename));
}
console.log('Stockfish Lite browserbestanden gekopieerd naar public/stockfish.');
