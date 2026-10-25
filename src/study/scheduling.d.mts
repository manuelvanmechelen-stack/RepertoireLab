export type MoveResult = { seen: number; misses: number; due: number; intervalDays: number; lastResult: 'good' | 'miss' };
export type LineResult = { seen: number; intervalDays: number; due: number };
export function scheduleMoveResult(previous: Partial<MoveResult> | undefined, remembered: boolean, now?: number): MoveResult;
export function scheduleLineResult(previous: { seen?: number; intervalDays?: number }, remembered: boolean, recentMoveMisses?: number, now?: number): LineResult;
export function isDue(due: number | undefined, now?: number): boolean;
export function selectDueOwnPly(historyLength: number, color: 'Wit' | 'Zwart', moveMemory: Record<string, { due: number }>, lineId: string, lineDue: number, now?: number): number;
