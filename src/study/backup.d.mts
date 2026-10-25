export type BackupLine = { id: string; name: string; moves: string; color: 'Wit' | 'Zwart'; tags: string[]; note: string; repertoireId?: string; due: number; seen: number; intervalDays?: number };
export type BackupRepertoire = { id: string; name: string; color: 'Wit' | 'Zwart'; createdAt: number };
export function validateBackup(raw: unknown): { lines: BackupLine[]; repertoires: BackupRepertoire[]; activeRepertoireId: string; missedMoves: Record<string, number>; moveMemory: Record<string, { seen: number; misses: number; due: number; intervalDays: number; lastResult?: 'good' | 'miss' }> };
