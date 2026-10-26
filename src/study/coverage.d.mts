export type CoverageMove = { san: string; uci: string; white?: number; draws?: number; black?: number; averageRating?: number; games: number };
export function rankCoverageMoves(moves: unknown, minGames?: number, limit?: number): CoverageMove[];
export type CoverageSummary = { totalGames: number; coveredGames: number; weightedCoverage: number | null; missingMoves: CoverageMove[]; observedMoves: number; coveredMoves: number };
export function summarizeCoverageMoves(moves: unknown, knownSans?: string[], minGames?: number): CoverageSummary;
