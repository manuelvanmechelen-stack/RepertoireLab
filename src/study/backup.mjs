import { Chess } from 'chess.js';
import { isValidFsrsCardState } from './scheduling.mjs';

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
      !Array.isArray(item.tags) || !item.tags.every(tag => typeof tag === 'string') || typeof item.note !== 'string' ||
      (item.repertoireId !== undefined && item.repertoireId !== null && typeof item.repertoireId !== 'string')) {
      throw new Error('Variant ' + (index + 1) + ' heeft ongeldige gegevens. Er is niets gewijzigd.');
    }
    if (lineIds.has(item.id)) throw new Error('Dubbel variant-ID gevonden: ' + item.id + '. Er is niets gewijzigd.');
    lineIds.add(item.id);
    try { strictPgn(item.moves); } catch { throw new Error('Ongeldige of lege zetten in variant: ' + item.name + '. Er is niets gewijzigd.'); }
    if (item.fsrsCard !== undefined && !isValidFsrsCardState(item.fsrsCard)) {
      throw new Error('Variant ' + item.name + ' bevat een ongeldige FSRS-herhalingskaart. Er is niets gewijzigd.');
    }
    return {
      id: item.id, name: item.name, moves: item.moves, color: item.color, tags: item.tags,
      note: item.note, repertoireId: typeof item.repertoireId === 'string' && item.repertoireId.trim() ? item.repertoireId.trim() : undefined,
      due: Number.isFinite(item.due) && item.due >= 0 ? item.due : 0,
      seen: Number.isFinite(item.seen) && item.seen >= 0 ? item.seen : 0,
      intervalDays: Number.isFinite(item.intervalDays) && item.intervalDays >= 0 ? item.intervalDays : undefined,
      fsrsCard: item.fsrsCard,
    };
  });
  const rawReps = raw.repertoires === undefined ? [] : raw.repertoires;
  if (!Array.isArray(rawReps)) throw new Error('De repertoirelijst in deze back-up is ongeldig. Er is niets gewijzigd.');
  const repIds = new Set();
  const repertoires = rawReps.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || typeof item.name !== 'string' || !item.name.trim() ||
      !['Wit', 'Zwart'].includes(item.color)) throw new Error('Repertoire ' + (index + 1) + ' heeft ongeldige gegevens. Er is niets gewijzigd.');
    if (repIds.has(item.id)) throw new Error('Dubbel repertoire-ID gevonden: ' + item.id + '. Er is niets gewijzigd.');
    repIds.add(item.id);
    return { id: item.id, name: item.name, color: item.color, createdAt: Number.isFinite(item.createdAt) && item.createdAt >= 0 ? item.createdAt : Date.now() };
  });
  // Keep restored lines reachable from the workspace. An orphaned repertoire ID
  // otherwise leaves a valid PGN hidden because the UI filters by active repertoire.
  for (const line of lines) {
    if (repertoires.length === 0) {
      // Legacy backups without repertoire records are migrated by the app on restore.
      line.repertoireId = undefined;
      continue;
    }
    if (line.repertoireId) {
      if (!repIds.has(line.repertoireId)) {
        throw new Error('Variant ' + line.name + ' verwijst naar een onbekend repertoire. Er is niets gewijzigd.');
      }
      continue;
    }
    const colorMatches = repertoires.filter(repertoire => repertoire.color === line.color);
    if (colorMatches.length !== 1) {
      const reason = colorMatches.length === 0
        ? 'heeft geen bestaand repertoire van dezelfde kleur'
        : 'kan niet eenduidig aan één repertoire worden gekoppeld';
      throw new Error('Variant ' + line.name + ' ' + reason + '. Er is niets gewijzigd.');
    }
    line.repertoireId = colorMatches[0].id;
  }
  const validCounterMap = value => isRecord(value) && Object.entries(value).every(([key, count]) => key.length > 0 && typeof count === 'number' && Number.isFinite(count) && count >= 0);
  const validMemoryMap = value => isRecord(value) && Object.entries(value).every(([key, entry]) =>
    key.length > 0 && isRecord(entry) && Number.isFinite(entry.seen) && entry.seen >= 0 &&
    Number.isFinite(entry.misses) && entry.misses >= 0 && Number.isFinite(entry.due) && entry.due >= 0 &&
    Number.isFinite(entry.intervalDays) && entry.intervalDays >= 0 &&
    (entry.lastResult === undefined || entry.lastResult === 'good' || entry.lastResult === 'miss') &&
    (entry.fsrsCard === undefined || isValidFsrsCardState(entry.fsrsCard)));
  if (raw.missedMoves !== undefined && !validCounterMap(raw.missedMoves)) throw new Error('De foutenteller in deze back-up is ongeldig.');
  if (raw.moveMemory !== undefined && !validMemoryMap(raw.moveMemory)) throw new Error('De herhalingsgegevens in deze back-up zijn ongeldig.');
  const validEngineAuditMap = value => isRecord(value) && Object.entries(value).every(([key, audit]) =>
    key.length > 0 && isRecord(audit) && typeof audit.moves === 'string' &&
    Number.isInteger(audit.depth) && audit.depth >= 1 && audit.depth <= 30 &&
    Number.isFinite(audit.analyzedAt) && audit.analyzedAt >= 0 &&
    Array.isArray(audit.findings) && audit.findings.length <= 40 &&
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
