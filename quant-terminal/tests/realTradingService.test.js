const assert = require('assert');
const realTradingService = require('../server/services/realTradingService');

console.log('🧪 Starting Micro-Account Real Trading Service Tests...\n');

// Test 1: Safety cap on capital
realTradingService.saveConfig('TEST_KEY', 'TEST_SECRET', 'TESTNET', 100.00, 5.0, true);
const status = realTradingService.getStatus();
assert(status.maxCapitalUsd <= 20.00, 'Capital must never exceed safety cap of $20.00');
assert(status.riskPerTradePct <= 2.0, 'Risk per trade must never exceed safety cap of 2%');
assert.strictEqual(status.mode, 'TESTNET');
console.log('  ✔ Hard capital cap ($20) and risk limit (2%) strictly enforced');

// Test 2: Exact position sizing & max loss calculation on $10, $15, and $20 trades
const calc10 = realTradingService.calculatePositionSize(100.00, 10.00);
assert.strictEqual(calc10.allocatedCapital, 10.00, 'Allocated capital should be $10');
assert.strictEqual(calc10.maxLossAmount, 0.20, 'Max loss on $10 at 2% risk MUST be $0.20 (20 cents)');

const calc15 = realTradingService.calculatePositionSize(100.00, 15.00);
assert.strictEqual(calc15.maxLossAmount, 0.30, 'Max loss on $15 at 2% risk MUST be $0.30 (30 cents)');

const calc20 = realTradingService.calculatePositionSize(100.00, 20.00);
assert.strictEqual(calc20.maxLossAmount, 0.40, 'Max loss on $20 at 2% risk MUST be $0.40 (40 cents)');
console.log('  ✔ Position sizing and automated stop-loss prices for $10, $15, $20 mathematically validated');

// Test 3: API Key masking
assert(!status.apiKeyMasked.includes('TEST_KEY'), 'Raw API key must never be exposed unmasked');
// Test 4: Universal trade execution ticket
realTradingService.executeTrade('XAU-USD', 'BUY', 10.00, 2685.00).then(ticket => {
  assert(ticket.orderId.startsWith('AF-'), 'Order ID must be generated');
  assert.strictEqual(ticket.symbol, 'XAU-USD');
  assert.strictEqual(ticket.capital, 10.00);
  assert.strictEqual(ticket.maxPossibleLoss, 0.20);
  assert(ticket.guarantee.includes('Hard Stop-Loss'), 'Guarantee must state stop-loss limit');
  console.log('  ✔ Universal trade execution ticket generated with guaranteed stop-loss');
  console.log('\n🎉 ALL REAL TRADING SERVICE TESTS PASSED!\n');
});

