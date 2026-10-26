/** Calculate evaluation loss from the side-to-move player's perspective. Scores are white-relative centipawns. */
export function evaluationLossCp(bestWhiteScore, playedWhiteScore, moverColor) {
  if (!Number.isFinite(bestWhiteScore) || !Number.isFinite(playedWhiteScore)) return null;
  const bestForMover = moverColor === 'w' ? bestWhiteScore : -bestWhiteScore;
  const playedForMover = moverColor === 'w' ? playedWhiteScore : -playedWhiteScore;
  return Math.max(0, Math.round(bestForMover - playedForMover));
}
