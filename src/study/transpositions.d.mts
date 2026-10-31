export type TranspositionSummary = {
  fen: string;
  paths: number;
  names: string[];
  ply: number;
};
export function analyzeTranspositions(
  lines?: Array<{ id?: string; name?: string; moves: string }>
): TranspositionSummary[];
