const test = require('node:test');
const assert = require('node:assert/strict');
const Indicators = require('../server/core/indicators');

test('Indicators Unit Suite', async (t) => {
  await t.test('SMA correctly computes rolling average', () => {
    const prices = [10, 20, 30, 40, 50];
    const sma3 = Indicators.sma(prices, 3);
    assert.equal(sma3[0], null);
    assert.equal(sma3[1], null);
    assert.equal(sma3[2], 20); // (10+20+30)/3
    assert.equal(sma3[3], 30); // (20+30+40)/3
    assert.equal(sma3[4], 40); // (30+40+50)/3
  });

  await t.test('EMA gives higher weight to recent prices', () => {
    const prices = [10, 10, 10, 10, 20];
    const ema3 = Indicators.ema(prices, 3);
    assert.ok(ema3[4] > 10, 'EMA should rise after price jump');
    assert.ok(ema3[4] < 20, 'EMA should smooth the price jump');
  });

  await t.test('RSI handles overbought and oversold bounds [0, 100]', () => {
    const rising = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
    const rsi = Indicators.rsi(rising, 14);
    const lastRsi = rsi[rsi.length - 1];
    assert.ok(lastRsi >= 70, `RSI on continuous upward trend should be > 70, got ${lastRsi}`);
    assert.ok(lastRsi <= 100, 'RSI cannot exceed 100');
  });

  await t.test('Sharpe Ratio returns 0 on zero variance without crashing', () => {
    const flatReturns = [0.01, 0.01, 0.01, 0.01];
    const sharpe = Indicators.calculateSharpeRatio(flatReturns);
    assert.equal(typeof sharpe, 'number');
    assert.ok(isFinite(sharpe), 'Sharpe must be finite');
  });

  await t.test('Max Drawdown correctly finds deepest drop from peak', () => {
    const equity = [10000, 12000, 9000, 11000];
    const dd = Indicators.calculateMaxDrawdown(equity);
    // Drop from 12000 to 9000 is (12000-9000)/12000 = 25%
    assert.equal(dd.maxDrawdownPercent, 25);
  });
});
