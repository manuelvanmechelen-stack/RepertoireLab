import { validateBackup } from './backup.mjs';

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate the complete backup before it is uploaded to or restored from cloud.
 * A top-level shape check alone is insufficient: a malformed local payload
 * could otherwise replace a previously valid cloud backup.
 */
export function validateCloudBackupPayload(raw) {
  if (!isRecord(raw) || raw.app !== 'RepertoireLab' ||
    !Array.isArray(raw.lines) || !Array.isArray(raw.repertoires)) {
    throw new Error('De cloudback-up heeft geen geldige RepertoireLab-structuur.');
  }
  validateBackup(raw);
  return raw;
}
