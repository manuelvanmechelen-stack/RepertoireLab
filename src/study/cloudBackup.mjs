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

/**
 * Write a cloud backup only against the exact version the user last restored
 * or synchronized. This prevents a stale tab/device from silently replacing
 * a newer cloud copy, and uses a conditional PATCH to close the read/write race.
 */
export async function syncCloudBackup({
  payload,
  userId,
  expectedUpdatedAt = null,
  request,
  token,
  now = () => new Date().toISOString(),
}) {
  if (typeof userId !== 'string' || !userId.trim() || typeof request !== 'function') {
    throw new Error('Cloudsynchronisatie mist een geldige gebruiker of requestfunctie.');
  }

  validateCloudBackupPayload(payload);
  const serialized = JSON.stringify(payload);
  if (serialized.length > 8_000_000) {
    throw new Error('Deze back-up is groter dan 8 MB. Exporteer hem lokaal en verklein de inhoud voordat je synchroniseert.');
  }

  const userFilter = 'user_id=eq.' + encodeURIComponent(userId);
  const currentRows = await request(
    '/rest/v1/repertoirelab_backups?select=updated_at&' + userFilter + '&limit=1',
    {},
    token,
  );
  if (!Array.isArray(currentRows) || currentRows.length > 1) {
    throw new Error('De huidige cloudversie kon niet veilig worden gecontroleerd.');
  }

  const current = currentRows[0];
  if (current) {
    if (typeof current.updated_at !== 'string' || !Number.isFinite(Date.parse(current.updated_at))) {
      throw new Error('De bestaande cloudback-up heeft geen geldige versiemarkering. Er is niets overschreven.');
    }
    if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt) {
      throw new Error('Er staat al een cloudback-up. Herstel die eerst op dit apparaat voordat je deze overschrijft.');
    }
    if (current.updated_at !== expectedUpdatedAt) {
      throw new Error('De cloudback-up is ondertussen op een ander apparaat gewijzigd. Herstel de nieuwste versie voordat je opnieuw synchroniseert.');
    }

    const candidateTime = typeof now === 'function' ? now() : now;
    const candidateMs = Date.parse(candidateTime);
    const currentMs = Date.parse(current.updated_at);
    if (!Number.isFinite(candidateMs)) throw new Error('De nieuwe cloudversie heeft geen geldige tijdstempel.');
    const updatedAt = new Date(Math.max(candidateMs, currentMs + 1)).toISOString();
    const updatedRows = await request(
      '/rest/v1/repertoirelab_backups?' + userFilter + '&updated_at=eq.' + encodeURIComponent(current.updated_at),
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ payload, updated_at: updatedAt }),
      },
      token,
    );
    if (!Array.isArray(updatedRows) || updatedRows.length !== 1 ||
      typeof updatedRows[0]?.updated_at !== 'string') {
      throw new Error('De cloudback-up is tijdens het synchroniseren gewijzigd. Er is niets overschreven; herstel de nieuwste versie en probeer opnieuw.');
    }
    return { created: false, updatedAt: updatedRows[0].updated_at };
  }

  if (expectedUpdatedAt) {
    throw new Error('De cloudback-up is verwijderd sinds je laatste herstel. Controleer eerst je lokale gegevens voordat je opnieuw synchroniseert.');
  }

  const candidateTime = typeof now === 'function' ? now() : now;
  const candidateMs = Date.parse(candidateTime);
  if (!Number.isFinite(candidateMs)) throw new Error('De nieuwe cloudversie heeft geen geldige tijdstempel.');
  const updatedAt = new Date(candidateMs).toISOString();
  const createdRows = await request(
    '/rest/v1/repertoirelab_backups?on_conflict=user_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ user_id: userId, payload, updated_at: updatedAt }),
    },
    token,
  );
  if (!Array.isArray(createdRows) || createdRows.length !== 1 ||
    typeof createdRows[0]?.updated_at !== 'string') {
    throw new Error('Er is tegelijk een cloudback-up aangemaakt. Herstel die eerst voordat je synchroniseert.');
  }
  return { created: true, updatedAt: createdRows[0].updated_at };
}
