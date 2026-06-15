// Single source of truth for Elo math. Used by both debate finalization paths
// (finalize.ts for scored debates, forfeit.ts for resign/ghost cleanup).

// K-factor: higher volatility for newer players (< 30 games), lower once
// established. Matches the rating behavior used across the app.
export function kFactor(games: number): number {
    return games < 30 ? 32 : 16;
}

/**
 * Compute updated Elo ratings for a win.
 * @param winnerElo current rating of the winner
 * @param loserElo  current rating of the loser
 * @param winnerGames TOTAL games played by the winner (wins + losses); drives
 *                    the winner's K-factor. Must be the full game count, not
 *                    just wins, or the < 30-game volatility band is wrong.
 * @param loserGames  TOTAL games played by the loser (wins + losses); drives
 *                    the loser's K-factor.
 */
export function calculateElo(
    winnerElo: number,
    loserElo: number,
    winnerGames = 0,
    loserGames = 0
): { newWinnerElo: number; newLoserElo: number } {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    return {
        newWinnerElo: Math.round(winnerElo + kFactor(winnerGames) * (1 - expectedWinner)),
        newLoserElo: Math.round(loserElo + kFactor(loserGames) * (0 - (1 - expectedWinner))),
    };
}