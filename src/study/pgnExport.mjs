import { Chess } from 'chess.js';

function cleanHeaderValue(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\\/g, '/')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Export saved repertoire lines as a valid multi-game PGN collection.
 * Existing PGN metadata (notably SetUp/FEN and result) is retained, while
 * repertoire labels replace the imported game's display headers.
 */
export function exportRepertoirePgn(lines = []) {
  if (!Array.isArray(lines)) throw new Error('De repertoirevarianten zijn ongeldig.');

  const games = lines.map((line, index) => {
    const name = cleanHeaderValue(line?.name) || 'Naamloze variant ' + (index + 1);
    if (!line || typeof line.moves !== 'string' || !line.moves.trim()) {
      throw new Error('PGN-export gestopt: ' + name + ' bevat geen zetten.');
    }
    if (!['Wit', 'Zwart'].includes(line.color)) {
      throw new Error('PGN-export gestopt: ' + name + ' heeft geen geldige repertoirekleur.');
    }

    const game = new Chess();
    try {
      game.loadPgn(line.moves);
    } catch {
      throw new Error('PGN-export gestopt: ' + name + ' bevat ongeldige zetten.');
    }
    if (!game.history().length) {
      throw new Error('PGN-export gestopt: ' + name + ' bevat geen zetten.');
    }

    const originalHeaders = game.header();
    const headers = {
      ...originalHeaders,
      Event: name,
      Site: 'RepertoireLab',
      White: line.color === 'Wit' ? 'Repertoire' : 'Opponent',
      Black: line.color === 'Zwart' ? 'Repertoire' : 'Opponent',
      Round: String(index + 1),
      Result: originalHeaders.Result || '*',
    };

    const serialized = game.pgn({ maxWidth: 100 });
    const separator = serialized.indexOf('\n\n');
    const movetext = (separator >= 0 ? serialized.slice(separator + 2) : serialized).trim();
    const headerBlock = Object.entries(headers)
      .map(([key, value]) => '[' + key + ' "' + cleanHeaderValue(value) + '"]')
      .join('\n');
    return headerBlock + '\n\n' + movetext;
  });

  return games.length ? games.join('\n\n') + '\n' : '';
}
