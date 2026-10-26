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

export type RepertoireQualityCoverage = { games: number; white?: number; draws?: number; black?: number };
export function calculateRepertoireQuality(
  lines?: RepertoireMetricLine[],
  moveMemory?: Record<string, RepertoireMetricMemory>,
  engineLineAudits?: Record<string, RepertoireMetricAudit>,
  coverage?: Record<string, RepertoireQualityCoverage>,
): {
  effectivenessScore: number | null; practicalRate: number | null; effectivenessGames: number;
  soundnessScore: number | null; averageLossCp: number | null; auditedMoves: number;
  learnabilityScore: number | null; recallRate: number | null; reviewAttempts: number; structuralEase: number | null;
  confidence: { effectiveness: string; soundness: string; learnability: string };
};
