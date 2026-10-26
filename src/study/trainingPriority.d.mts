export type TrainingPriorityLine = {
  id: string;
  due?: number;
  intervalDays?: number;
};
export type TrainingPriorityMemory = {
  seen?: number;
  misses?: number;
  due?: number;
};
export function rankTrainingLines<T extends TrainingPriorityLine>(
  lines: T[],
  moveMemory?: Record<string, TrainingPriorityMemory>,
  missedMoves?: Record<string, number>,
  now?: number,
): T[];
