import { Chess } from 'chess.js';

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function strictPgn(pgn) {
  const game = new Chess();
  game.loadPgn(pgn);
  if (!game.history().length) throw new Error('bevat geen zetten');
}

export function validateBackup(raw) {
  if (!isRecord(raw) || !Array.isArray(raw.lines)) throw new Error('Dit bestand is geen geldige RepertoireLab-back-up.');
  const lineIds = new Set();
  const lines = raw.lines.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || typeof item.name !== 'string' || !item.name.trim() ||
      typeof item.moves !== 'string' || !['Wit', 'Zwart'].includes(item.color) ||
      !Array.isArray(item.tags) || !item.tags.every(tag => typeof tag === 'string') || typeof item.note !== 'string') {
      throw new Error('Variant ' + (index + 1) + ' heeft ongeldige gegevens. Er is niets gewijzigd.');
    }
    if (lineIds.has(item.id)) throw new Error('Dubbel variant-ID gevonden: ' + item.id + '. Er is niets gewijzigd.');
    lineIds.add(item.id);
    try { strictPgn(item.moves); } catch { throw new Error('Ongeldige of lege zetten in variant: ' + item.name + '. Er is niets gewijzigd.'); }
    return {
      id: item.id, name: item.name, moves: item.moves, color: item.color, tags: item.tags,
      note: item.note, repertoireId: typeof item.repertoireId === 'string' ? item.repertoireId : undefined,
      due: Number.isFinite(item.due) && item.due >= 0 ? item.due : 0,
      seen: Number.isFinite(item.seen) && item.seen >= 0 ? item.seen : 0,
      intervalDays: Number.isFinite(item.intervalDays) && item.intervalDays >= 0 ? item.intervalDays : undefined,
    };
  });
  const rawReps = Array.isArray(raw.repertoires) ? raw.repertoires : [];
  const repIds = new Set();
  const repertoires = rawReps.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || typeof item.name !== 'string' || !item.name.trim() ||
      !['Wit', 'Zwart'].includes(item.color)) throw new Error('Repertoire ' + (index + 1) + ' heeft ongeldige gegevens. Er is niets gewijzigd.');
    if (repIds.has(item.id)) throw new Error('Dubbel repertoire-ID gevonden: ' + item.id + '. Er is niets gewijzigd.');
    repIds.add(item.id);
    return { id: item.id, name: item.name, color: item.color, createdAt: Number.isFinite(item.createdAt) && item.createdAt >= 0 ? item.createdAt : Date.now() };
  });
  const validCounterMap = value => isRecord(value) && Object.entries(value).every(([key, count]) => key.length > 0 && typeof count === 'number' && Number.isFinite(count) && count >= 0);
  const validMemoryMap = value => isRecord(value) && Object.entries(value).every(([key, entry]) =>
    key.length > 0 && isRecord(entry) && Number.isFinite(entry.seen) && entry.seen >= 0 &&
    Number.isFinite(entry.misses) && entry.misses >= 0 && Number.isFinite(entry.due) && entry.due >= 0 &&
    Number.isFinite(entry.intervalDays) && entry.intervalDays >= 0 &&
    (entry.lastResult === undefined || entry.lastResult === 'good' || entry.lastResult === 'miss'));
  if (raw.missedMoves !== undefined && !validCounterMap(raw.missedMoves)) throw new Error('De foutenteller in deze back-up is ongeldig.');
  if (raw.moveMemory !== undefined && !validMemoryMap(raw.moveMemory)) throw new Error('De herhalingsgegevens in deze back-up zijn ongeldig.');
  const validEngineAuditMap = value => isRecord(value) && Object.entries(value).every(([key, audit]) =>
    key.length > 0 && isRecord(audit) && typeof audit.moves === 'string' &&
    Number.isInteger(audit.depth) && audit.depth >= 1 && audit.depth <= 30 &&
    Number.isFinite(audit.analyzedAt) && audit.analyzedAt >= 0 &&
    Array.isArray(audit.findings) && audit.findings.length <= 10 &&
    audit.findings.every(item => isRecord(item) && Number.isInteger(item.ply) && item.ply >= 1 &&
      typeof item.san === 'string' && typeof item.bestMove === 'string' && typeof item.status === 'string' &&
      (item.lossCp === null || (typeof item.lossCp === 'number' && Number.isFinite(item.lossCp) && item.lossCp >= 0))));
  if (raw.engineLineAudits !== undefined && !validEngineAuditMap(raw.engineLineAudits)) throw new Error('De opgeslagen Stockfish-analyses in deze back-up zijn ongeldig.');
  const activeRepertoireId = typeof raw.activeRepertoireId === 'string' && repertoires.some(item => item.id === raw.activeRepertoireId)
    ? raw.activeRepertoireId : repertoires[0]?.id ?? '';
  return {
    lines, repertoires, activeRepertoireId,
    missedMoves: raw.missedMoves ?? {}, moveMemory: raw.moveMemory ?? {},
    engineLineAudits: raw.engineLineAudits ?? {},
  };
}
