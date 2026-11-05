const TAG_PAIR = /^\s*\[([A-Za-z0-9_]+)\s+"(?:[^"\\]|\\.)*"\s*\]\s*$/;
const RESULT_MARKERS = ["1/2-1/2", "1-0", "0-1", "*"];
const isDelimiter = char => !char || /\s/.test(char) || "(){};[]".includes(char);

function inspectMovetextLine(line, state) {
  let hasMovetext = false;
  let hasResult = false;

  // PGN escape lines are ignored by readers and must not create game boundaries.
  if (line.startsWith("%") && state.braceDepth === 0) {
    return { hasMovetext, hasResult };
  }

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (state.braceDepth > 0) {
      if (char === "{") state.braceDepth += 1;
      else if (char === "}") state.braceDepth -= 1;
      continue;
    }

    if (char === ";") break;
    if (char === "{") {
      state.braceDepth = 1;
      continue;
    }
    if (char === "(") {
      state.variationDepth += 1;
      hasMovetext = true;
      continue;
    }
    if (char === ")") {
      if (state.variationDepth > 0) state.variationDepth -= 1;
      hasMovetext = true;
      continue;
    }
    if (/\s/.test(char)) continue;

    hasMovetext = true;
    if (state.variationDepth > 0 || hasResult) continue;

    const previous = line[index - 1];
    if (!isDelimiter(previous)) continue;

    const marker = RESULT_MARKERS.find(candidate =>
      line.startsWith(candidate, index) && isDelimiter(line[index + candidate.length]),
    );
    if (marker) {
      hasResult = true;
      index += marker.length - 1;
    }
  }

  return { hasMovetext, hasResult };
}

/**
 * Split a PGN collection while keeping each game's tag pairs together.
 * Results inside brace/semicolon comments or recursive annotation variations
 * are ignored. Event tags can also separate games that omit a result marker.
 */
export function splitPgnCollection(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return [];

  const chunks = [];
  let current = [];
  let completed = false;
  let sawMovetext = false;
  const state = { braceDepth: 0, variationDepth: 0 };

  for (const line of trimmed.split(/\r?\n/)) {
    const tag = state.braceDepth === 0 && state.variationDepth === 0 && !line.startsWith("%")
      ? TAG_PAIR.exec(line)
      : null;

    const startsNextGame = tag && current.some(item => item.trim()) && (
      completed || (tag[1] === "Event" && sawMovetext)
    );

    if (startsNextGame) {
      chunks.push(current.join("\n").trim());
      current = [];
      completed = false;
      sawMovetext = false;
      state.braceDepth = 0;
      state.variationDepth = 0;
    }

    current.push(line);
    if (tag) continue;

    const scanned = inspectMovetextLine(line, state);
    sawMovetext ||= scanned.hasMovetext;
    completed ||= scanned.hasResult;
  }

  if (current.some(line => line.trim())) chunks.push(current.join("\n").trim());
  return chunks.filter(Boolean);
}
