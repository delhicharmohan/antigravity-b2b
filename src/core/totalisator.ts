export class Totalisator {
    private static readonly PLATFORM_RAKE = 0.05; // 5% default platform rake if not specified

    /**
     * Calculates the implied odds for a given outcome based on the current pool and rake.
     * Formula: Odds = (Total Pool * (1 - Rake)) / Pool[Outcome]
     */
    public static calculateOdds(
        poolData: { yes: number; no: number },
        outcome: 'yes' | 'no',
        merchantRake?: number
    ): number {
        const totalPool = poolData.yes + poolData.no;

        // Avoid division by zero
        if (totalPool === 0 || poolData[outcome] === 0) {
            return 1.0; // Or some initial starting odds logic
        }

        const rake = merchantRake !== undefined ? merchantRake : this.PLATFORM_RAKE;
        const netPool = totalPool * (1 - rake);

        return netPool / poolData[outcome];
    }

    /**
     * Calculates the potential payout for a specific wager stake.
     */
    public static calculatePotentialPayout(
        stake: number,
        poolData: { yes: number; no: number },
        outcome: 'yes' | 'no',
        merchantRake?: number
    ): number {
        const odds = this.calculateOdds(poolData, outcome, merchantRake);
        return stake * odds;
    }
}
