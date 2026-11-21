export function firstChangedPly(previousPgn: string, nextPgn: string): number | null;
export function pruneLineMoveMemoryFromPly<T>(
  moveMemory: Record<string, T> | undefined,
  lineId: string,
  firstPly: number,
): Record<string, T>;
