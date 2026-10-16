const test = require('node:test');
const assert = require('node:assert/strict');
const Backtester = require('../server/core/backtester');

test('Backtester Unit Suite', async (t) => {
  await t.test('Executes BUY and SELL signals and calculates net PnL with fees', () => {
    // 5 simple candles
    const candles = [
      { timestamp: 1000, open: 100, high: 105, low: 95, close: 100, volume: 10 },
      { timestamp: 2000, open: 100, high: 110, low: 99, close: 105, volume: 10 },
      { timestamp: 3000, open: 105, high: 115, low: 104, close: 110, volume: 10 },
      { timestamp: 4000, open: 110, high: 125, low: 109, close: 120, volume: 10 },
      { timestamp: 5000, open: 120, high: 122, low: 115, close: 118, volume: 10 }
    ];

    const strategyResult = {
      name: 'Test Strategy',
      signals: [
        { action: 'BUY', reason: 'Signal Buy' },  // Buy at 100
        { action: 'HOLD' },
        { action: 'HOLD' },
        { action: 'SELL', reason: 'Signal Sell' }, // Sell at 120
        { action: 'HOLD' }
      ],
      indicatorData: {}
    };

    const res = Backtester.run(candles, strategyResult, {
      initialCapital: 10000,
      slippagePct: 0.001,
      commissionPct: 0.001
    });

    assert.equal(res.summary.totalTrades, 1, 'Should execute exactly 1 trade');
    assert.ok(res.summary.totalNetProfit > 1500, 'Trade bought at ~100 and sold at ~120 should be profitable');
    assert.ok(res.summary.winRatePct === 100, 'Winning trade should result in 100% win rate');
    assert.equal(res.trades.length, 1);
    assert.equal(res.trades[0].id, 1);
  });

  await t.test('Prevents trade execution when capital is zero or negative', () => {
    const candles = [
      { timestamp: 1000, open: 100, high: 105, low: 95, close: 100, volume: 10 },
      { timestamp: 2000, open: 100, high: 105, low: 95, close: 100, volume: 10 }
    ];

    const strategyResult = {
      name: 'Zero Cap Test',
      signals: [{ action: 'BUY' }, { action: 'SELL' }],
      indicatorData: {}
    };

    const res = Backtester.run(candles, strategyResult, { initialCapital: 0 });
    assert.equal(res.summary.totalTrades, 0, 'Zero capital cannot execute trades');
  });
});
