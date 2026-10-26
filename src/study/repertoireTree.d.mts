export type RepertoireTreeEdge = {
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion: string | null;
  nextPositionKey: string;
  lineIds: string[];
  lineNames: string[];
};
export type RepertoireTreeNode = {
  key: string;
  fen: string;
  ply: number;
  pathCount: number;
  incoming: Array<{ fromKey: string; san: string }>;
  moves: RepertoireTreeEdge[];
  lineIds: string[];
};
export type RepertoireTree = {
  rootKey: string;
  validLines: number;
  invalidLines: number;
  totalPlies: number;
  positionCount: number;
  edgeCount: number;
  branchingPositions: number;
  transpositionPositions: number;
  nodes: RepertoireTreeNode[];
};
export function buildRepertoireTree(lines?: Array<{ id: string; name?: string; moves: string }>): RepertoireTree;
export function getRepertoireContinuations(tree: RepertoireTree, fen: string): RepertoireTreeEdge[];
