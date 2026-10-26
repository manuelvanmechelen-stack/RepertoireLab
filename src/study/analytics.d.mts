export type RepertoireMetricLine = { id: string; moves: string; note?: string };
export type RepertoireMetricMemory = { seen: number; misses: number; due: number };
export type RepertoireMetricAudit = { moves: string; findings: Array<{ lossCp: number | null }> };
export function calculateRepertoireMetrics(
  lines?: RepertoireMetricLine[],
  moveMemory?: Record<string, RepertoireMetricMemory>,
  now?: number,
  engineLineAudits?: Record<string, RepertoireMetricAudit>,
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
  engineAuditMoves: number;
  engineComparableMoves: number;
  engineConsistency: number | null;
  engineOutliers: number;
};
