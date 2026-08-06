import { Totalisator } from '../src/core/totalisator';

console.log('Running Totalisator.enhanceMarketWithMetrics Verifications...');

// Test 1: Standard case
const market1 = {
    id: '1',
    pool_yes: '100',
    pool_no: '100'
};
const rake1 = 0.1; // 10% rake
const enhanced1 = Totalisator.enhanceMarketWithMetrics(market1, rake1);

if (enhanced1.odds.yes === 1.8 && enhanced1.odds.no === 1.8) {
    console.log('Test 1 Passed: Standard case odds');
} else {
    console.error('Test 1 Failed: Standard case odds', enhanced1.odds);
    process.exit(1);
}

if (enhanced1.probabilities.yes === 0.5 && enhanced1.probabilities.no === 0.5) {
    console.log('Test 1 Passed: Standard case probabilities');
} else {
    console.error('Test 1 Failed: Standard case probabilities', enhanced1.probabilities);
    process.exit(1);
}

// Test 2: Skewed pool
const market2 = {
    id: '2',
    pool_yes: '80',
    pool_no: '20'
};
const rake2 = 0; // 0% rake
const enhanced2 = Totalisator.enhanceMarketWithMetrics(market2, rake2);

if (enhanced2.odds.yes === 1.25 && enhanced2.odds.no === 5.0) {
    console.log('Test 2 Passed: Skewed pool odds');
} else {
    console.error('Test 2 Failed: Skewed pool odds', enhanced2.odds);
    process.exit(1);
}

if (enhanced2.probabilities.yes === 0.8 && enhanced2.probabilities.no === 0.2) {
    console.log('Test 2 Passed: Skewed pool probabilities');
} else {
    console.error('Test 2 Failed: Skewed pool probabilities', enhanced2.probabilities);
    process.exit(1);
}

// Test 3: Zero pool
const market3 = {
    id: '3',
    pool_yes: '0',
    pool_no: '0'
};
const enhanced3 = Totalisator.enhanceMarketWithMetrics(market3);

if (enhanced3.odds.yes === 1.0 && enhanced3.odds.no === 1.0) {
    console.log('Test 3 Passed: Zero pool odds');
} else {
    console.error('Test 3 Failed: Zero pool odds', enhanced3.odds);
    process.exit(1);
}

if (enhanced3.probabilities.yes === 0.5 && enhanced3.probabilities.no === 0.5) {
    console.log('Test 3 Passed: Zero pool probabilities');
} else {
    console.error('Test 3 Failed: Zero pool probabilities', enhanced3.probabilities);
    process.exit(1);
}

console.log('All Totalisator.enhanceMarketWithMetrics Tests Passed!');
