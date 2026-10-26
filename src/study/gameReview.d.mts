export type RepertoireReviewLine = { name: string; color?: 'Wit' | 'Zwart'; moves: string };
export type GameDeviation = { ply: number; san: string; expectedMoves: string[]; side: 'Wit' | 'Zwart'; kind: 'deviation' | 'gap' };
export type GameReviewResult = { players: string; result: string; plyCount: number; bestMatchName: string; matchedPlies: number; transpositionCount: number; firstDeviation: GameDeviation | null; summary: string };
export function analyzeGameAgainstRepertoire(pgn: string, lines: RepertoireReviewLine[]): GameReviewResult;
