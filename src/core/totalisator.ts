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
     * Returns a comprehensive metrics object for a market outcome.
     * Useful for premium merchant frontends.
     */
    public static getMarketMetrics(
        poolData: { yes: number; no: number },
        outcome: 'yes' | 'no',
        merchantRake?: number
    ) {
        const decimalOdds = this.calculateOdds(poolData, outcome, merchantRake);
        const totalPool = poolData.yes + poolData.no;

        // Implied Probability (based on pool weight)
        const probability = totalPool > 0
            ? Math.round((poolData[outcome] / totalPool) * 100)
            : 50;

        // Share Price (Price for $1.00 payout, 0.00 to 1.00)
        const sharePrice = decimalOdds > 0
            ? Math.round((1 / decimalOdds) * 100) / 100
            : 0.50;

        return {
            decimalOdds: Math.round(decimalOdds * 100) / 100,
            probability: `${probability}%`,
            sharePrice: sharePrice,
            payoutPerTen: this.calculatePotentialPayout(10, poolData, outcome, merchantRake)
        };
    }

    /**
     * Calculates the potential payout for a specific wager stake.
     * Rounds down to 2 decimal places (cents) to ensure platform sanity.
     */
    public static calculatePotentialPayout(
        stake: number,
        poolData: { yes: number; no: number },
        outcome: 'yes' | 'no',
        merchantRake?: number
    ): number {
        const odds = this.calculateOdds(poolData, outcome, merchantRake);
        const rawPayout = stake * odds;
        return Math.floor(rawPayout * 100) / 100;
    }
}
