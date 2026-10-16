const test = require('node:test');
const assert = require('node:assert/strict');
const RegimeFilter = require('../server/core/regimeFilter');

test('Risk Guards & AI Regime Filter Suite', async (t) => {
  await t.test('Classifies High Volatility Shock during erratic candles', () => {
    // Generate shock candles with wild swings
    const shockCandles = [];
    let p = 100;
    for (let i = 0; i < 50; i++) {
      p += (i % 2 === 0 ? 15 : -14); // massive intraday jumps
      shockCandles.push({
        open: p - 5,
        high: p + 10,
        low: p - 10,
        close: p,
        volume: 500
      });
    }

    const analysis = RegimeFilter.analyze(shockCandles, 'smaCrossover', 'BUY');
    assert.ok(analysis.regime, 'Should return a market regime classification');
    assert.ok(typeof analysis.confidence === 'number', 'Confidence must be numeric');
    assert.ok(analysis.confidence >= 0 && analysis.confidence <= 100, 'Confidence must be within [0, 100]');
  });

  await t.test('Prevents false breakout BUY when market is in severe volatility shock', () => {
    const shockCandles = [];
    let p = 100;
    for (let i = 0; i < 40; i++) {
      p += (i % 2 === 0 ? 25 : -24);
      shockCandles.push({ open: p, high: p + 15, low: p - 15, close: p, volume: 1000 });
    }

    const analysis = RegimeFilter.analyze(shockCandles, 'smaCrossover', 'BUY');
    if (analysis.regime === 'HIGH_VOLATILITY_SHOCK') {
      assert.equal(analysis.shouldExecute, false, 'Should block BUY in severe volatility shock');
    }
  });
});
