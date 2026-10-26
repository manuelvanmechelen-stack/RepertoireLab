export type BackupLine = { id: string; name: string; moves: string; color: 'Wit' | 'Zwart'; tags: string[]; note: string; repertoireId?: string; due: number; seen: number; intervalDays?: number; fsrsCard?: Record<string, unknown> };
export type BackupRepertoire = { id: string; name: string; color: 'Wit' | 'Zwart'; createdAt: number };
export type BackupEngineAudit = { moves: string; depth: number; analyzedAt: number; findings: Array<{ ply: number; san: string; bestMove: string; lossCp: number | null; status: string }> };
export function validateBackup(raw: unknown): {
  lines: BackupLine[];
  repertoires: BackupRepertoire[];
  activeRepertoireId: string;
  missedMoves: Record<string, number>;
  moveMemory: Record<string, { seen: number; misses: number; due: number; intervalDays: number; lastResult?: 'good' | 'miss'; fsrsCard?: Record<string, unknown> }>;
  engineLineAudits: Record<string, BackupEngineAudit>;
};
