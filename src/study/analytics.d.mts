export type RepertoireMetricLine = { id: string; moves: string; note?: string };
export type RepertoireMetricMemory = { seen: number; misses: number; due: number };
export function calculateRepertoireMetrics(
  lines?: RepertoireMetricLine[],
  moveMemory?: Record<string, RepertoireMetricMemory>,
  now?: number,
): {
  validLines: number;
  moveCount: number;
  uniquePositions: number;
  branchingPositions: number;
  transpositionPotential: number;
  notedLines: number;
  noteCoverage: number | null;
  totalAttempts: number;
  totalMisses: number;
  accuracy: number | null;
  dueMoves: number;
};
