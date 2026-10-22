const { describe, it } = require('node:test');
const assert = require('node:assert');
const KronosPredictor = require('../server/core/kronosPredictor');
const Strategies = require('../server/core/strategies');

describe('Kronos Foundation Model Forecaster Suite (AAAI 2026)', () => {
  const sampleCandles = [];
  let basePrice = 82000.00;

  for (let i = 0; i < 60; i++) {
    const change = (Math.sin(i * 0.3) * 120) + (Math.random() - 0.48) * 80;
    const close = basePrice + change;
    const open = basePrice;
    const high = Math.max(open, close) + 40;
    const low = Math.min(open, close) - 40;
    sampleCandles.push({
      timestamp: new Date(Date.now() - (60 - i) * 60000).toISOString(),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 120 + Math.floor(Math.random() * 50)
    });
    basePrice = close;
  }

  it('Tokenizes continuous K-lines via Binary Spherical Quantization (BSQ)', () => {
    const tokenResult = KronosPredictor.tokenizeCandle(sampleCandles[10], sampleCandles[9], 120);
    assert.ok(typeof tokenResult.token === 'number', 'Token index should be a numeric integer');
    assert.ok(tokenResult.token >= 0, 'Token should be non-negative');
    assert.strictEqual(tokenResult.vector.length, KronosPredictor.dimension, 'Vector dimension matches model specification');
  });

  it('Generates 12-bar forward probabilistic candlestick cones with median and bounds', () => {
    const forecast = KronosPredictor.predict(sampleCandles, { horizon: 12, numSimulations: 30 });
    
    assert.strictEqual(forecast.horizon, 12, 'Forecast horizon should be 12');
    assert.strictEqual(forecast.medianPath.length, 12, 'Median path should contain 12 steps');
    assert.strictEqual(forecast.upperCone90.length, 12, 'Upper 90% boundary should contain 12 steps');
    assert.strictEqual(forecast.lowerCone10.length, 12, 'Lower 10% boundary should contain 12 steps');
    assert.strictEqual(forecast.forecastCandles.length, 12, 'Generates 12 synthetic phantom candles');
    
    // Mathematical invariants: Upper bound >= Median >= Lower bound
    for (let i = 0; i < 12; i++) {
      assert.ok(forecast.upperCone90[i] >= forecast.medianPath[i], `Upper bound must exceed median at step ${i}`);
      assert.ok(forecast.medianPath[i] >= forecast.lowerCone10[i], `Median must exceed lower bound at step ${i}`);
    }

    assert.ok(typeof forecast.expectedReturnPct === 'number', 'Expected return is numeric');
    assert.ok(typeof forecast.rankIC === 'number', 'RankIC is numeric');
    assert.ok(forecast.recommendedSL > 0, 'Dynamic Stop-Loss target price generated');
    assert.ok(forecast.recommendedTP > 0, 'Dynamic Take-Profit target price generated');
  });

  it('Executes Kronos Foundation Alpha strategy without errors', () => {
    const result = Strategies.kronosFoundationAlpha(sampleCandles, { horizon: 12 });
    assert.strictEqual(result.signals.length, sampleCandles.length, 'Generates one signal entry per input candle');
    const validActions = new Set(['BUY', 'SELL', 'HOLD']);
    for (const s of result.signals) {
      assert.ok(validActions.has(s.action), `Action ${s.action} is recognized`);
    }
  });
});
