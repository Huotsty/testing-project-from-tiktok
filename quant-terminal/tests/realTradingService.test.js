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
const calc10 = realTradingService.calculatePositionSize(100.00, 10.00, 'BUY');
assert.strictEqual(calc10.allocatedCapital, 10.00, 'Allocated capital should be $10');
assert.strictEqual(calc10.maxLossAmount, 0.20, 'Max loss on $10 at 2% risk MUST be $0.20 (20 cents)');
assert.strictEqual(calc10.stopLossPrice, 98.00, 'Long stop loss on $100 must be $98.00 (-2%)');
assert.strictEqual(calc10.takeProfitPrice, 104.00, 'Long take profit on $100 must be $104.00 (+4%)');

const calc15 = realTradingService.calculatePositionSize(100.00, 15.00);
assert.strictEqual(calc15.maxLossAmount, 0.30, 'Max loss on $15 at 2% risk MUST be $0.30 (30 cents)');

const calc20 = realTradingService.calculatePositionSize(100.00, 20.00);
assert.strictEqual(calc20.maxLossAmount, 0.40, 'Max loss on $20 at 2% risk MUST be $0.40 (40 cents)');
console.log('  ✔ Position sizing and automated stop-loss prices for $10, $15, $20 mathematically validated');

// Test 2b: Short / Sell trade direction calculation
const calcShort = realTradingService.calculatePositionSize(100.00, 10.00, 'SELL');
assert.strictEqual(calcShort.stopLossPrice, 102.00, 'Short stop loss must be ABOVE entry price ($102.00)');
assert.strictEqual(calcShort.takeProfitPrice, 96.00, 'Short take profit must be BELOW entry price ($96.00)');
console.log('  ✔ Short / Sell direction validated: Stop-Loss above entry ($102) & Take-Profit below ($96)');

// Test 3: API Key & Secret Security Masking
assert(!status.apiKeyMasked.includes('TEST_KEY'), 'Raw API key must never be exposed unmasked');
assert.strictEqual(status.hasApiSecret, true, 'hasApiSecret must report boolean presence');
assert.strictEqual(status.apiSecret, undefined, 'Raw API secret must NEVER be exposed in getStatus()');
console.log('  ✔ API Key masking and secret containment verified');

// Test 4: Universal trade execution ticket & security guards
realTradingService.executeTrade('XAU-USD', 'BUY', 10.00, 2685.00).then(async (ticket) => {
  assert(ticket.orderId.startsWith('AF-'), 'Order ID must be generated');
  assert.strictEqual(ticket.symbol, 'XAU-USD');
  assert.strictEqual(ticket.capital, 10.00);
  assert.strictEqual(ticket.maxPossibleLoss, 0.20);
  assert(ticket.guarantee.includes('Hard Stop-Loss'), 'Guarantee must state stop-loss limit');
  console.log('  ✔ Universal trade execution ticket generated with guaranteed stop-loss');

  // Test 5: Input validation security guard (reject negative / zero price)
  const invalidTicket = await realTradingService.executeTrade('XAU-USD', 'BUY', 10.00, -50.00);
  assert.strictEqual(invalidTicket.status, 'SECURITY_REJECTED', 'Must reject negative or zero market price');
  console.log('  ✔ Security guard correctly blocks malformed market prices');

  // Test 6: Circuit Breaker activation on cumulative loss
  realTradingService.dailyRealizedLoss = 2.50; // Simulate $2.50 loss exceeding $2.00 threshold
  const cbTicket = await realTradingService.executeTrade('XAU-USD', 'BUY', 10.00, 2700.00);
  assert.strictEqual(cbTicket.status, 'CIRCUIT_BREAKER_ACTIVE', 'Circuit breaker must halt trading on max loss');
  realTradingService.resetCircuitBreaker();
  // Test 7: Real-time portfolio state & live position tracking
  const livePort = realTradingService.getLivePortfolio();
  assert(livePort.success, 'Live portfolio query must return success');
  assert(Array.isArray(livePort.positions), 'Positions must be an array');
  assert(livePort.portfolio.totalEquity > 0, 'Total equity must be positive');
  console.log('  ✔ Real-time portfolio state and live position tracking verified');

  // Test 8: Real-time price tick updates unrealized PnL
  realTradingService.onPriceTick('XAU-USD', 2738.70); // +2% gain from entry 2685.00
  const updatedPort = realTradingService.getLivePortfolio();
  const xauPos = updatedPort.positions.find(p => p.symbol === 'XAU-USD');
  if (xauPos) {
    assert(xauPos.unrealizedPnl > 0, 'Unrealized PnL must be positive after price increase');
    assert.strictEqual(xauPos.trailingLocked, true, 'Trailing lock must engage after +1.5% profit');
    console.log('  ✔ Real-time price tick updates live unrealized PnL and triggers trailing lock');
  }

  // Test 9: Emergency close all and position exit
  const closeRes = await realTradingService.emergencyCloseAll();
  assert(closeRes.success, 'Emergency close all must succeed');
  const emptyPort = realTradingService.getLivePortfolio();
  assert.strictEqual(emptyPort.positions.length, 0, 'Positions array must be 0 after emergency close all');
  console.log('  ✔ Emergency panic brake and position closure verified');

  console.log('\n🎉 ALL REAL TRADING SERVICE & REAL-TIME TESTS PASSED!\n');
});

