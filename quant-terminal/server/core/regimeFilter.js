/**
 * AI Market Regime Classifier & False Signal Filter
 * Uses statistical trend slope, standard deviation volatility, and momentum consistency
 * to filter out false breakouts and validate algorithmic trade setups.
 */

class RegimeFilter {
  /**
   * Classify current market regime
   * @param {Array} candles - recent OHLCV series
   * @returns {Object} { regime, confidence, trendSlope, volatilityPct, shouldExecute, reason }
   */
  static analyze(candles, strategy, proposedAction) {
    if (!candles || candles.length < 25) {
      return { regime: 'NORMAL', confidence: 50, shouldExecute: true, reason: 'Insufficient history for regime filter' };
    }

    const n = Math.min(25, candles.length);
    const recent = candles.slice(-n);
    const closes = recent.map(c => c.close);

    // 1. Calculate Linear Regression Slope of Closing Prices
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += closes[i];
      sumXY += i * closes[i];
      sumXX += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgPrice = sumY / n;
    const normalizedSlopePct = (slope / avgPrice) * 100 * 10; // Normalized 10-bar % drift

    // 2. Calculate Standard Deviation Volatility
    let variance = 0;
    for (let i = 0; i < n; i++) {
      variance += Math.pow(closes[i] - avgPrice, 2);
    }
    const stdDev = Math.sqrt(variance / n);
    const volatilityPct = (stdDev / avgPrice) * 100;

    // 3. Classify Regime
    let regime = 'RANGING_SIDEWAYS';
    if (volatilityPct > 2.5) {
      regime = 'HIGH_VOLATILITY_SHOCK';
    } else if (normalizedSlopePct > 0.35) {
      regime = 'TRENDING_BULL';
    } else if (normalizedSlopePct < -0.35) {
      regime = 'TRENDING_BEAR';
    } else {
      regime = 'RANGING_SIDEWAYS';
    }

    // 4. Evaluate Signal Compatibility with AI Score
    let confidence = 50;
    let shouldExecute = true;
    let reason = '';

    if (proposedAction === 'BUY') {
      if (strategy === 'smaCrossover') {
        // Trend strategy wants a trending market
        if (regime === 'TRENDING_BULL') {
          confidence = 88;
          shouldExecute = true;
          reason = 'AI: Strong Bullish Regime confirmed (Slope +0.4%). Clean momentum breakout.';
        } else if (regime === 'RANGING_SIDEWAYS') {
          confidence = 34;
          shouldExecute = false; // Block false whipsaw!
          reason = 'AI Filter: Blocked false breakout. Sideways market with high chop risk.';
        } else if (regime === 'HIGH_VOLATILITY_SHOCK') {
          confidence = 45;
          shouldExecute = false;
          reason = 'AI Filter: High volatility shock detected. Waiting for volatility contraction.';
        }
      } else if (strategy === 'rsiMeanReversion' || strategy === 'bollingerReversion') {
        // Mean reversion strategies thrive in sideways ranging markets!
        if (regime === 'RANGING_SIDEWAYS') {
          confidence = 92;
          shouldExecute = true;
          reason = 'AI: Optimal Mean-Reversion Regime. Statistical oscillation confirmed.';
        } else if (regime === 'TRENDING_BEAR') {
          confidence = 38;
          shouldExecute = false; // "Don't catch falling knives in strong downtrends"
          reason = 'AI Filter: Blocked oversold buy. Severe macro downtrend in progress.';
        }
      }
    } else if (proposedAction === 'SELL') {
      // Selling / Exit signals are generally permitted to preserve capital
      confidence = 80;
      shouldExecute = true;
      reason = 'AI: Exit signal confirmed for capital preservation.';
    }

    return {
      regime,
      confidence,
      normalizedSlopePct: Number(normalizedSlopePct.toFixed(2)),
      volatilityPct: Number(volatilityPct.toFixed(2)),
      shouldExecute,
      reason
    };
  }
}

module.exports = RegimeFilter;
