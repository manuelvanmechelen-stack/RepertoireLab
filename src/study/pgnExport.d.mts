export type RepertoirePgnExportLine = {
  name?: string;
  color: 'Wit' | 'Zwart';
  moves: string;
};

export function exportRepertoirePgn(lines?: RepertoirePgnExportLine[]): string;
