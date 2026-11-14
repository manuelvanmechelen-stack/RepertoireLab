export type OpeningMatch = { eco: string; name: string; matchedPlies: number; exact: boolean };
export function identifyOpening(pgnOrMoves?: string | string[]): OpeningMatch | null;
export function listOpeningCatalog(): Array<{ eco: string; name: string; moves: string[] }>;
export function identifyOpeningFull(pgnOrMoves?: string | string[]): Promise<OpeningMatch | null>;
export function listFullOpeningCatalog(): Promise<Array<{ eco: string; name: string; moves: string[] }>>;
