import { Totalisator } from '../src/core/totalisator';
import assert from 'assert';

console.log('Running Totalisator Logic Verifications...');

// Test 1: Basic Odds Calculation
const pool1 = { yes: 50, no: 50 }; // Total 100
const oddsYes1 = Totalisator.calculateOdds(pool1, 'yes', 0.1); // 10% Rake
// Net Pool = 90. Odds Yes = 90 / 50 = 1.8
assert.strictEqual(oddsYes1, 1.8, 'Test 1 Failed: Expected 1.8');
console.log('Test 1 Passed: Basic Odds (50/50 split, 10% rake) -> 1.8');

// Test 2: Skewed Pool
const pool2 = { yes: 80, no: 20 }; // Total 100
const oddsNo2 = Totalisator.calculateOdds(pool2, 'no', 0); // 0% Rake
// Net Pool = 100. Odds No = 100 / 20 = 5.0
assert.strictEqual(oddsNo2, 5.0, 'Test 2 Failed: Expected 5.0');
console.log('Test 2 Passed: Skewed Pool (80/20 split, 0% rake, bet on No) -> 5.0');

// Test 3: Zero Pool Handling
const pool3 = { yes: 0, no: 0 };
const oddsZero = Totalisator.calculateOdds(pool3, 'yes');
assert.strictEqual(oddsZero, 1.0, 'Test 3 Failed: Expected 1.0 for empty pool');
console.log('Test 3 Passed: Zero Pool Handling');

console.log('All Totalisator Tests Passed!');
