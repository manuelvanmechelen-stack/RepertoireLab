export type CoverageMove = { san: string; uci: string; white?: number; draws?: number; black?: number; averageRating?: number; games: number };
export function rankCoverageMoves(moves: unknown, minGames?: number, limit?: number): CoverageMove[];
