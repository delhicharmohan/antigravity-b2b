import { describe, expect, it } from "bun:test";
import { Totalisator } from "../src/core/totalisator";

describe("Totalisator", () => {
    describe("calculateOdds", () => {
        it("should calculate basic odds with default rake (5%)", () => {
            const poolData = { yes: 50, no: 50 };
            const odds = Totalisator.calculateOdds(poolData, 'yes');
            // Total: 100, Net: 100 * 0.95 = 95, Odds: 95 / 50 = 1.9
            expect(odds).toBe(1.9);
        });

        it("should calculate odds with custom merchant rake", () => {
            const poolData = { yes: 50, no: 50 };
            const odds = Totalisator.calculateOdds(poolData, 'yes', 0.1);
            // Total: 100, Net: 100 * 0.90 = 90, Odds: 90 / 50 = 1.8
            expect(odds).toBe(1.8);
        });

        it("should return 1.0 if the total pool is zero", () => {
            const poolData = { yes: 0, no: 0 };
            const odds = Totalisator.calculateOdds(poolData, 'yes');
            expect(odds).toBe(1.0);
        });

        it("should return 1.0 if the outcome pool is zero", () => {
            const poolData = { yes: 0, no: 100 };
            const odds = Totalisator.calculateOdds(poolData, 'yes');
            expect(odds).toBe(1.0);
        });

        it("should handle skewed pools correctly", () => {
            const poolData = { yes: 80, no: 20 };
            const odds = Totalisator.calculateOdds(poolData, 'no', 0);
            // Total: 100, Net: 100, Odds: 100 / 20 = 5.0
            expect(odds).toBe(5.0);
        });
    });

    describe("calculatePotentialPayout", () => {
        it("should calculate potential payout correctly", () => {
            const poolData = { yes: 50, no: 50 };
            const payout = Totalisator.calculatePotentialPayout(10, poolData, 'yes', 0.1);
            // Odds: 1.8, Stake: 10, Payout: 18.0
            expect(payout).toBe(18.0);
        });

        it("should round down to 2 decimal places", () => {
            const poolData = { yes: 3, no: 7 };
            // Total: 10, Net (5% rake): 9.5, Odds Yes: 9.5 / 3 = 3.1666...
            // Stake: 10, Raw Payout: 31.6666...
            // Expected rounded down: 31.66
            const payout = Totalisator.calculatePotentialPayout(10, poolData, 'yes');
            expect(payout).toBe(31.66);
        });

        it("should handle zero stake", () => {
            const poolData = { yes: 50, no: 50 };
            const payout = Totalisator.calculatePotentialPayout(0, poolData, 'yes');
            expect(payout).toBe(0);
        });

        it("should return stake amount if odds are 1.0 (e.g. empty pool)", () => {
            const poolData = { yes: 0, no: 0 };
            const payout = Totalisator.calculatePotentialPayout(10, poolData, 'yes');
            expect(payout).toBe(10.0);
        });
    });

    describe("getMarketMetrics", () => {
        it("should return comprehensive metrics", () => {
            const poolData = { yes: 50, no: 50 };
            const metrics = Totalisator.getMarketMetrics(poolData, 'yes', 0.1);

            expect(metrics).toEqual({
                decimalOdds: 1.8,
                probability: "50%",
                sharePrice: 0.56, // 1 / 1.8 = 0.5555... -> rounded to 0.56
                payoutPerTen: 18.0
            });
        });

        it("should handle zero pool in metrics", () => {
            const poolData = { yes: 0, no: 0 };
            const metrics = Totalisator.getMarketMetrics(poolData, 'yes');

            expect(metrics).toEqual({
                decimalOdds: 1.0,
                probability: "50%",
                sharePrice: 1.0,
                payoutPerTen: 10.0
            });
        });
    });
});
