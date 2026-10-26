const hasResult = text => /(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)(?:\s|$)/m.test(text);

/**
 * Split a PGN collection without splitting the multiple tag-pairs that belong
 * to one game. Event headers are the strongest boundary; for PGNs without
 * Event tags, a new header after a completed result starts the next game.
 */
export function splitPgnCollection(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return [];
  const eventChunks = trimmed.split(/(?=^\s*\[Event\s+")/m).map(chunk => chunk.trim()).filter(Boolean);
  if (eventChunks.length > 1) return eventChunks;

  const lines = trimmed.split(/\r?\n/);
  const chunks = [];
  let current = [];
  let completed = false;
  for (const line of lines) {
    const isTag = /^\s*\[[A-Za-z0-9_]+\s+"/.test(line);
    if (isTag && completed && current.some(item => item.trim())) {
      chunks.push(current.join('\n').trim());
      current = [];
      completed = false;
    }
    current.push(line);
    if (hasResult(line)) completed = true;
  }
  if (current.some(line => line.trim())) chunks.push(current.join('\n').trim());
  return chunks.filter(Boolean);
}
