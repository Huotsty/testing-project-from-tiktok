/**
 * Quant & Financial Math Indicator Library
 * Clean, verified formulas for technical analysis and portfolio performance metrics.
 */

class Indicators {
  /**
   * Simple Moving Average (SMA)
   * Formula: SMA_t = (P_t + P_t-1 + ... + P_t-n+1) / n
   */
  static sma(prices, period) {
    if (!prices || prices.length < period) return [];
    const result = new Array(prices.length).fill(null);
    let sum = 0;
    
    for (let i = 0; i < prices.length; i++) {
      sum += prices[i];
      if (i >= period) {
        sum -= prices[i - period];
      }
      if (i >= period - 1) {
        result[i] = Number((sum / period).toFixed(4));
      }
    }
    return result;
  }

  /**
   * Exponential Moving Average (EMA)
   * Formula: Multiplier = 2 / (period + 1)
   * EMA_t = (Price_t * Multiplier) + (EMA_t-1 * (1 - Multiplier))
   */
  static ema(prices, period) {
    if (!prices || prices.length < period) return [];
    const result = new Array(prices.length).fill(null);
    const k = 2 / (period + 1);

    // Initial SMA as starting seed
    let initialSum = 0;
    for (let i = 0; i < period; i++) {
      initialSum += prices[i];
    }
    let prevEma = initialSum / period;
    result[period - 1] = Number(prevEma.toFixed(4));

    for (let i = period; i < prices.length; i++) {
      const currentEma = (prices[i] * k) + (prevEma * (1 - k));
      result[i] = Number(currentEma.toFixed(4));
      prevEma = currentEma;
    }
    return result;
  }

  /**
   * Relative Strength Index (RSI)
   * Formula: RSI = 100 - (100 / (1 + RS))
   * RS = Average Gain / Average Loss over n periods (Wilder's Smoothing)
   */
  static rsi(prices, period = 14) {
    if (!prices || prices.length <= period) return [];
    const result = new Array(prices.length).fill(null);

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[period] = Number((100 - (100 / (1 + rs))).toFixed(2));

    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      const currentGain = diff > 0 ? diff : 0;
      const currentLoss = diff < 0 ? Math.abs(diff) : 0;

      avgGain = (avgGain * (period - 1) + currentGain) / period;
      avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

      if (avgLoss === 0) {
        result[i] = 100;
      } else {
        rs = avgGain / avgLoss;
        result[i] = Number((100 - (100 / (1 + rs))).toFixed(2));
      }
    }
    return result;
  }

  /**
   * MACD (Moving Average Convergence Divergence)
   * MACD Line = 12-period EMA - 26-period EMA
   * Signal Line = 9-period EMA of MACD Line
   * Histogram = MACD Line - Signal Line
   */
  static macd(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!prices || prices.length < slowPeriod) {
      return { macd: [], signal: [], histogram: [] };
    }

    const fastEMA = this.ema(prices, fastPeriod);
    const slowEMA = this.ema(prices, slowPeriod);

    const macdLine = new Array(prices.length).fill(null);
    for (let i = 0; i < prices.length; i++) {
      if (fastEMA[i] !== null && slowEMA[i] !== null) {
        macdLine[i] = Number((fastEMA[i] - slowEMA[i]).toFixed(4));
      }
    }

    // Extract valid points for signal line EMA
    const validMacdValues = [];
    const validIndices = [];
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== null) {
        validMacdValues.push(macdLine[i]);
        validIndices.push(i);
      }
    }

    const signalRaw = this.ema(validMacdValues, signalPeriod);
    const signalLine = new Array(prices.length).fill(null);
    const histogram = new Array(prices.length).fill(null);

    for (let j = 0; j < validIndices.length; j++) {
      const originalIdx = validIndices[j];
      const sigVal = signalRaw[j];
      signalLine[originalIdx] = sigVal;
      if (macdLine[originalIdx] !== null && sigVal !== null) {
        histogram[originalIdx] = Number((macdLine[originalIdx] - sigVal).toFixed(4));
      }
    }

    return { macd: macdLine, signal: signalLine, histogram };
  }

  /**
   * Bollinger Bands
   * Middle Band = 20-day SMA
   * Upper Band = 20-day SMA + (20-day Standard Deviation * 2)
   * Lower Band = 20-day SMA - (20-day Standard Deviation * 2)
   */
  static bollingerBands(prices, period = 20, multiplier = 2) {
    if (!prices || prices.length < period) {
      return { upper: [], middle: [], lower: [], bandwidth: [] };
    }

    const upper = new Array(prices.length).fill(null);
    const middle = new Array(prices.length).fill(null);
    const lower = new Array(prices.length).fill(null);
    const bandwidth = new Array(prices.length).fill(null);

    for (let i = period - 1; i < prices.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += prices[j];
      }
      const mean = sum / period;

      let varianceSum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        varianceSum += Math.pow(prices[j] - mean, 2);
      }
      const stdDev = Math.sqrt(varianceSum / period);

      const up = mean + (multiplier * stdDev);
      const low = mean - (multiplier * stdDev);

      upper[i] = Number(up.toFixed(4));
      middle[i] = Number(mean.toFixed(4));
      lower[i] = Number(low.toFixed(4));
      bandwidth[i] = mean !== 0 ? Number(((up - low) / mean * 100).toFixed(2)) : 0;
    }

    return { upper, middle, lower, bandwidth };
  }

  /**
   * Average True Range (ATR)
   * Measures market volatility
   * TR = max(high - low, abs(high - prevClose), abs(low - prevClose))
   */
  static atr(candles, period = 14) {
    if (!candles || candles.length < period + 1) return [];
    const result = new Array(candles.length).fill(null);
    const trValues = [candles[0].high - candles[0].low];

    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i];
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        cur.high - cur.low,
        Math.abs(cur.high - prevClose),
        Math.abs(cur.low - prevClose)
      );
      trValues.push(tr);
    }

    let initialAtr = 0;
    for (let i = 0; i < period; i++) {
      initialAtr += trValues[i];
    }
    let prevAtr = initialAtr / period;
    result[period - 1] = Number(prevAtr.toFixed(4));

    for (let i = period; i < candles.length; i++) {
      const currentAtr = (prevAtr * (period - 1) + trValues[i]) / period;
      result[i] = Number(currentAtr.toFixed(4));
      prevAtr = currentAtr;
    }

    return result;
  }

  /**
   * Volume Weighted Average Price (VWAP)
   * Cumulative (Typical Price * Volume) / Cumulative Volume
   */
  static vwap(candles) {
    if (!candles || candles.length === 0) return [];
    const result = [];
    let cumTypicalVol = 0;
    let cumVol = 0;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const typicalPrice = (c.high + c.low + c.close) / 3;
      const vol = c.volume || 1;
      cumTypicalVol += typicalPrice * vol;
      cumVol += vol;

      result.push(Number((cumTypicalVol / cumVol).toFixed(4)));
    }
    return result;
  }

  /**
   * Institutional Quant Metrics
   */
  static calculateSharpeRatio(returns, riskFreeAnnualRate = 0.02, periodsPerYear = 252) {
    if (!returns || returns.length < 2) return 0;
    const n = returns.length;
    const avgDailyReturn = returns.reduce((a, b) => a + b, 0) / n;
    const dailyRf = riskFreeAnnualRate / periodsPerYear;
    const excessReturns = returns.map(r => r - dailyRf);

    const meanExcess = excessReturns.reduce((a, b) => a + b, 0) / n;
    const variance = excessReturns.reduce((sum, r) => sum + Math.pow(r - meanExcess, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0 || !isFinite(stdDev)) return 0;
    const annualizedSharpe = (meanExcess / stdDev) * Math.sqrt(periodsPerYear);
    if (!isFinite(annualizedSharpe) || isNaN(annualizedSharpe)) return 0;
    return Number(Math.max(-10, Math.min(10, annualizedSharpe)).toFixed(2));
  }

  static calculateSortinoRatio(returns, riskFreeAnnualRate = 0.02, periodsPerYear = 252) {
    if (!returns || returns.length < 2) return 0;
    const n = returns.length;
    const dailyRf = riskFreeAnnualRate / periodsPerYear;
    const excessReturns = returns.map(r => r - dailyRf);
    const meanExcess = excessReturns.reduce((a, b) => a + b, 0) / n;

    // Downside deviation only considers negative returns
    const downsideDiffs = excessReturns.map(r => r < 0 ? Math.pow(r, 2) : 0);
    const downsideVariance = downsideDiffs.reduce((a, b) => a + b, 0) / n;
    const downsideStdDev = Math.sqrt(downsideVariance);

    if (downsideStdDev === 0 || !isFinite(downsideStdDev)) return 0;
    const annualizedSortino = (meanExcess / downsideStdDev) * Math.sqrt(periodsPerYear);
    if (!isFinite(annualizedSortino) || isNaN(annualizedSortino)) return 0;
    return Number(Math.max(-10, Math.min(10, annualizedSortino)).toFixed(2));
  }

  static calculateMaxDrawdown(equityCurve) {
    if (!equityCurve || equityCurve.length === 0) return { maxDrawdownPercent: 0, peakIndex: 0, valleyIndex: 0 };
    let peak = equityCurve[0];
    let peakIdx = 0;
    let maxDd = 0;
    let bestPeakIdx = 0;
    let valleyIdx = 0;

    for (let i = 1; i < equityCurve.length; i++) {
      const val = equityCurve[i];
      if (val > peak) {
        peak = val;
        peakIdx = i;
      }
      const dd = (peak - val) / peak;
      if (dd > maxDd) {
        maxDd = dd;
        bestPeakIdx = peakIdx;
        valleyIdx = i;
      }
    }

    return {
      maxDrawdownPercent: Number((maxDd * 100).toFixed(2)),
      peakIndex: bestPeakIdx,
      valleyIndex: valleyIdx
    };
  }
}

module.exports = Indicators;
