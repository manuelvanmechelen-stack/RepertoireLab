export type MoveResult = { seen: number; misses: number; due: number; intervalDays: number; lastResult: 'good' | 'miss' };
export type LineResult = { seen: number; intervalDays: number; due: number };
export function scheduleMoveResult(previous: Partial<MoveResult> | undefined, remembered: boolean, now?: number): MoveResult;
export function scheduleLineResult(previous: { seen?: number; intervalDays?: number }, remembered: boolean, recentMoveMisses?: number, now?: number): LineResult;
export function isDue(due: number | undefined, now?: number): boolean;
export function selectDueOwnPly(historyLength: number, color: 'Wit' | 'Zwart', moveMemory: Record<string, { due: number }>, lineId: string, lineDue: number, now?: number): number;

export type LineGrade = 'again' | 'hard' | 'good' | 'easy';
export type GradedLineResult = { seen: number; intervalDays: number; due: number; lastGrade: LineGrade };
export function scheduleLineGrade(previous: { seen?: number; intervalDays?: number } | undefined, grade: LineGrade, recentMoveMisses?: number, now?: number): GradedLineResult;

export type FsrsCardState = Record<string, unknown> & {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3 | 'New' | 'Learning' | 'Review' | 'Relearning';
  last_review?: number | null;
};
export function isValidFsrsCardState(value: unknown): value is FsrsCardState;
export type FsrsMoveResult = { seen: number; misses: number; due: number; intervalDays: number; lastResult: 'good' | 'miss'; fsrsCard: FsrsCardState };
export type FsrsLineResult = { seen: number; intervalDays: number; due: number; lastGrade: LineGrade; fsrsCard: FsrsCardState };
export function scheduleFsrsMoveResult(previous: (Partial<MoveResult> & { fsrsCard?: FsrsCardState }) | undefined, remembered: boolean, now?: number): FsrsMoveResult;
export function scheduleFsrsLineGrade(previous: ({ seen?: number; intervalDays?: number; fsrsCard?: FsrsCardState }) | undefined, grade: LineGrade, now?: number): FsrsLineResult;
