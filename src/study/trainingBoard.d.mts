export type TrainingColor = 'Wit' | 'Zwart';
export type TrainingStartTurn = 'w' | 'b';
export type LoadedTrainingLine = {
  san: string[];
  startFen: string;
  startTurn: TrainingStartTurn;
};
export function loadTrainingLine(pgn: string): LoadedTrainingLine;
export function isOwnTrainingPly(ply: number, color: TrainingColor, startingTurn?: TrainingStartTurn): boolean;
