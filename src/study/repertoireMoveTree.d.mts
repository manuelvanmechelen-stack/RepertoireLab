export type RepertoireMoveTreeNode = {
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion: string | null;
  ply: number;
  moveNumber: number;
  color: 'w' | 'b';
  positionKey: string;
  fen: string;
  lineIds: string[];
  lineNames: string[];
  children: RepertoireMoveTreeNode[];
};
export type RepertoireMoveTreeRoot = {
  key: string;
  fen: string;
  isStandard: boolean;
  turn: 'w' | 'b';
  moveNumber: number;
  lineIds: string[];
  lineNames: string[];
  moves: RepertoireMoveTreeNode[];
};
export type RepertoireMoveTree = {
  validLines: number;
  invalidLines: number;
  totalPlies: number;
  roots: RepertoireMoveTreeRoot[];
};
export function buildRepertoireMoveTree(lines?: Array<{ id: string; name?: string; moves: string }>): RepertoireMoveTree;
