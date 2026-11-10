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

export function getLineMoveMemoryEntries<T extends TrainingPriorityMemory>(
  moveMemory: Record<string, T> | undefined,
  lineId: string,
): Array<[string, T]>;
export function getDueMoveLineIds(
  lines: TrainingPriorityLine[],
  moveMemory?: Record<string, TrainingPriorityMemory>,
  now?: number,
): Set<string>;
