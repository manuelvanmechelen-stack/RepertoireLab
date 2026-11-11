export type EngineAuditPosition = {
  ply: number;
  san: string;
  uci: string;
  color: 'w' | 'b';
  fen: string;
};

export function getEngineAuditPositions(
  pgn: string,
  repertoireColor: 'Wit' | 'Zwart',
  maxOwnMoves?: number,
): EngineAuditPosition[];

export function evaluationLossCp(
  bestWhiteScore: number,
  playedWhiteScore: number,
  moverColor: 'w' | 'b',
): number | null;
