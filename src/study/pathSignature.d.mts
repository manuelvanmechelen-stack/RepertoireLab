import type { Chess } from 'chess.js';

export function loadFenPosition(fen: string): Chess;
export function movePathSignature(game: Chess): string;
export function pathSignatureFromPgn(pgn: string): string;
