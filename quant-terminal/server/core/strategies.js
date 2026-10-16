/**
 * Quantitative Trading Strategies Library
 * Implements algorithmic trade signal generation on OHLCV series.
 */
const Indicators = require('./indicators');

class Strategies {
  /**
   * 1. Dual Moving Average Crossover (Trend Following)
   * Classic quantitative trend-following strategy.
   * Long when Fast MA crosses above Slow MA (Golden Cross).
   * Exit/Short when Fast MA crosses below Slow MA (Death Cross).
   */
  static smaCrossover(candles, params = {}) {
    const fastPeriod = Number(params.fastPeriod) || 9;
    const slowPeriod = Number(params.slowPeriod) || 21;
    const maType = params.maType || 'EMA'; // 'SMA' or 'EMA'

    const closes = candles.map(c => c.close);
    const fastMA = maType === 'EMA' ? Indicators.ema(closes, fastPeriod) : Indicators.sma(closes, fastPeriod);
    const slowMA = maType === 'EMA' ? Indicators.ema(closes, slowPeriod) : Indicators.sma(closes, slowPeriod);

    const signals = [];

    for (let i = 0; i < candles.length; i++) {
      if (i === 0 || fastMA[i] === null || slowMA[i] === null || fastMA[i - 1] === null || slowMA[i - 1] === null) {
        signals.push({ action: 'HOLD', reason: 'Insufficient data' });
        continue;
      }

      const prevFast = fastMA[i - 1];
      const prevSlow = slowMA[i - 1];
      const currFast = fastMA[i];
      const currSlow = slowMA[i];

      // Bullish crossover
      if (prevFast <= prevSlow && currFast > currSlow) {
        signals.push({ action: 'BUY', reason: `${maType}(${fastPeriod}) crossed ABOVE ${maType}(${slowPeriod})` });
      }
      // Bearish crossover
      else if (prevFast >= prevSlow && currFast < currSlow) {
        signals.push({ action: 'SELL', reason: `${maType}(${fastPeriod}) crossed BELOW ${maType}(${slowPeriod})` });
      } else {
        signals.push({ action: 'HOLD' });
      }
    }

    return {
      name: `Dual ${maType} Crossover (${fastPeriod}/${slowPeriod})`,
      signals,
      indicatorData: { fastMA, slowMA }
    };
  }

  /**
   * 2. RSI Mean-Reversion Strategy
   * Assumes asset prices oscillate around an equilibrium mean.
   * Buy when oversold (RSI < oversold threshold).
   * Sell when overbought (RSI > overbought threshold).
   */
  static rsiMeanReversion(candles, params = {}) {
    const period = Number(params.period) || 14;
    const oversold = Number(params.oversold) || 30;
    const overbought = Number(params.overbought) || 70;

    const closes = candles.map(c => c.close);
    const rsiValues = Indicators.rsi(closes, period);
    const signals = [];

    for (let i = 0; i < candles.length; i++) {
      if (i === 0 || rsiValues[i] === null || rsiValues[i - 1] === null) {
        signals.push({ action: 'HOLD', reason: 'Insufficient data' });
        continue;
      }

      const prevRsi = rsiValues[i - 1];
      const currRsi = rsiValues[i];

      // Crosses back up out of oversold territory
      if (prevRsi < oversold && currRsi >= oversold) {
        signals.push({ action: 'BUY', reason: `RSI(${period}) recovered above ${oversold} (Oversold bounce)` });
      }
      // Crosses back down out of overbought territory
      else if (prevRsi > overbought && currRsi <= overbought) {
        signals.push({ action: 'SELL', reason: `RSI(${period}) fell below ${overbought} (Overbought exhaustion)` });
      } else {
        signals.push({ action: 'HOLD' });
      }
    }

    return {
      name: `RSI Mean Reversion (${period}, ${oversold}/${overbought})`,
      signals,
      indicatorData: { rsi: rsiValues }
    };
  }

  /**
   * 3. Bollinger Bands Mean Reversion
   * Buy when price touches or dips below lower band and closes back inside.
   * Sell when price reaches upper band.
   */
  static bollingerReversion(candles, params = {}) {
    const period = Number(params.period) || 20;
    const stdDevMultiplier = Number(params.multiplier) || 2;

    const closes = candles.map(c => c.close);
    const bb = Indicators.bollingerBands(closes, period, stdDevMultiplier);
    const signals = [];

    for (let i = 0; i < candles.length; i++) {
      if (i === 0 || bb.lower[i] === null || bb.upper[i] === null) {
        signals.push({ action: 'HOLD' });
        continue;
      }

      const price = closes[i];
      const prevPrice = closes[i - 1];
      const lower = bb.lower[i];
      const upper = bb.upper[i];

      if (prevPrice <= lower && price > lower) {
        signals.push({ action: 'BUY', reason: `Price bounced off Lower Bollinger Band (${lower})` });
      } else if (prevPrice >= upper && price < upper) {
        signals.push({ action: 'SELL', reason: `Price rejected Upper Bollinger Band (${upper})` });
      } else {
        signals.push({ action: 'HOLD' });
      }
    }

    return {
      name: `Bollinger Bands Reversion (${period}, ${stdDevMultiplier}σ)`,
      signals,
      indicatorData: bb
    };
  }

  /**
   * 4. MACD Momentum Strategy
   * MACD histogram turns positive (MACD crosses Signal) -> Buy
   * MACD histogram turns negative (MACD crosses below Signal) -> Sell
   */
  static macdMomentum(candles, params = {}) {
    const fast = Number(params.fast) || 12;
    const slow = Number(params.slow) || 26;
    const signalPeriod = Number(params.signal) || 9;

    const closes = candles.map(c => c.close);
    const macdData = Indicators.macd(closes, fast, slow, signalPeriod);
    const signals = [];

    for (let i = 0; i < candles.length; i++) {
      if (i === 0 || macdData.macd[i] === null || macdData.signal[i] === null ||
          macdData.macd[i - 1] === null || macdData.signal[i - 1] === null) {
        signals.push({ action: 'HOLD' });
        continue;
      }

      const prevHist = macdData.histogram[i - 1];
      const currHist = macdData.histogram[i];

      if (prevHist <= 0 && currHist > 0) {
        signals.push({ action: 'BUY', reason: 'MACD crossed above Signal Line (Bullish momentum)' });
      } else if (prevHist >= 0 && currHist < 0) {
        signals.push({ action: 'SELL', reason: 'MACD crossed below Signal Line (Bearish momentum)' });
      } else {
        signals.push({ action: 'HOLD' });
      }
    }

    return {
      name: `MACD Momentum (${fast}/${slow}/${signalPeriod})`,
      signals,
      indicatorData: macdData
    };
  }

  /**
   * 5. Custom Algorithmic Script Runner
   * Safely executes user-defined JavaScript strategy logic with indicator context
   */
  static customScript(candles, customCode) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    const rsi14 = Indicators.rsi(closes, 14);
    const sma20 = Indicators.sma(closes, 20);
    const ema50 = Indicators.ema(closes, 50);
    const macd = Indicators.macd(closes);
    const bb = Indicators.bollingerBands(closes);

    const signals = [];

    // Security Check: Block dangerous Node.js / system access in sandbox
    const forbidden = ['require', 'process', 'global', 'child_process', 'fs', 'eval', 'Function', 'window', 'document', 'fetch', 'XMLHttpRequest', 'import'];
    for (const word of forbidden) {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(customCode)) {
        throw new Error(`Security Violation: Keyword "${word}" is forbidden in quantitative sandbox.`);
      }
    }

    // Construct evaluation function
    // Expects: return 'BUY' | 'SELL' | 'HOLD'
    let evalFn;
    try {
      evalFn = new Function('candle', 'index', 'closes', 'indicators', `
        'use strict';
        try {
          ${customCode}
        } catch (e) {
          return 'HOLD';
        }
      `);
    } catch (err) {
      throw new Error(`Syntax Error in Custom Strategy: ${err.message}`);
    }

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const indicatorsAtI = {
        rsi: rsi14[i],
        sma20: sma20[i],
        ema50: ema50[i],
        bbUpper: bb.upper[i],
        bbLower: bb.lower[i],
        macd: macd.macd[i],
        macdSignal: macd.signal[i],
        macdHist: macd.histogram[i]
      };

      try {
        const action = evalFn(candle, i, closes, indicatorsAtI);
        if (action === 'BUY' || action === 'SELL') {
          signals.push({ action, reason: 'Custom Algo Rule Triggered' });
        } else {
          signals.push({ action: 'HOLD' });
        }
      } catch (e) {
        signals.push({ action: 'HOLD' });
      }
    }

    return {
      name: 'Custom User Algorithm',
      signals,
      indicatorData: { rsi: rsi14, sma20, ema50, bb }
    };
  }
}

module.exports = Strategies;
