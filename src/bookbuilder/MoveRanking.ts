/**
 * RepertoireLab BookBuilder adapter.
 * Implements a small browser-native adapter following BookBuilder's
 * statistical move-selection workflow (popular-game data + conservative
 * confidence-aware ranking). It is not a copy of BookBuilder source.
 *
 * Upstream reference: https://github.com/raccrompton/BookBuilder
 * Upstream license: GPL-3.0-or-later (see the upstream repository).
 */
export type BookBuilderCandidate = {
  san: string;
  white: number;
  black: number;
  draws: number;
  uci?: string;
  averageRating?: number;
};

export function rankBookBuilderCandidates(
  candidates: BookBuilderCandidate[],
  perspective: 'white' | 'black',
  minGames = 20,
) {
  const totalAtPosition = candidates.reduce(
    (sum, move) => sum + move.white + move.black + move.draws,
    0,
  );
  return candidates
    .map(move => {
      const games = move.white + move.black + move.draws;
      const wins = perspective === 'white' ? move.white : move.black;
      const losses = perspective === 'white' ? move.black : move.white;
      const score = games ? (wins + move.draws * 0.5) / games : 0.5;
      const playRate = totalAtPosition ? games / totalAtPosition : 0;
      // Wilson lower confidence bound discourages overrating tiny samples.
      const z = 1.96;
      const denominator = 1 + (z * z) / Math.max(games, 1);
      const center = score + (z * z) / (2 * Math.max(games, 1));
      const margin = z * Math.sqrt(
        (score * (1 - score) + (z * z) / (4 * Math.max(games, 1))) /
        Math.max(games, 1),
      );
      const lowerBound = (center - margin) / denominator;
      return {
        ...move,
        games,
        playRate,
        score,
        lowerBound,
        recommended: games >= minGames,
        // Practical value balances reliable results and moves actually played.
        practicalValue: lowerBound * 0.8 + Math.min(playRate * 20, 1) * 0.2,
      };
    })
    .sort((a, b) =>
      Number(b.recommended) - Number(a.recommended) ||
      b.practicalValue - a.practicalValue ||
      b.games - a.games,
    );
}
