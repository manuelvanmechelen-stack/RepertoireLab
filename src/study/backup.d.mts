export type BackupFsrsCard = Record<string, unknown> & { due: number; last_review: number | null; stability: number; difficulty: number; scheduled_days: number };
export type BackupLine = { id: string; name: string; moves: string; color: 'Wit' | 'Zwart'; tags: string[]; note: string; repertoireId?: string; due: number; seen: number; intervalDays?: number; fsrsCard?: BackupFsrsCard };
export type BackupRepertoire = { id: string; name: string; color: 'Wit' | 'Zwart'; createdAt: number };
export type BackupEngineAudit = { moves: string; depth: number; analyzedAt: number; findings: Array<{ ply: number; san: string; bestMove: string; lossCp: number | null; status: string }> };
export function validateBackup(raw: unknown): {
  lines: BackupLine[];
  repertoires: BackupRepertoire[];
  activeRepertoireId: string;
  missedMoves: Record<string, number>;
  moveMemory: Record<string, { seen: number; misses: number; due: number; intervalDays: number; lastResult?: 'good' | 'miss'; fsrsCard?: BackupFsrsCard }>;
  engineLineAudits: Record<string, BackupEngineAudit>;
};
