export function calculateElo(
    winnerElo: number,
    loserElo: number,
    kFactor: number = 32
): { newWinnerElo: number; newLoserElo: number } {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const expectedLoser = 1 - expectedWinner;
    return {
        newWinnerElo: Math.round(winnerElo + kFactor * (1 - expectedWinner)),
        newLoserElo: Math.round(loserElo + kFactor * (0 - expectedLoser)),
    };
}