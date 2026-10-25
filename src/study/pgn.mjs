export function splitPgnCollection(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return [];
  const chunks = trimmed.split(/(?=^\s*\[Event\s+")/m).map(chunk => chunk.trim()).filter(Boolean);
  return chunks.length ? chunks : [trimmed];
}
