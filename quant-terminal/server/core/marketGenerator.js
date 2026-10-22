/**
 * Realistic Market Price & Historical OHLCV Generator
 * Implements Geometric Brownian Motion (GBM) with Merton Jump-Diffusion
 * for institutional-grade market simulation.
 */

class MarketGenerator {
  constructor() {
    this.assets = {
      'XAU-USD': { name: 'Spot Gold ($/oz)', initialPrice: 4098, drift: 0.00004, volatility: 0.008, jumpProb: 0.012, jumpScale: 0.009 },
      'BTC-USD': { name: 'Bitcoin', initialPrice: 82500, drift: 0.0001, volatility: 0.018, jumpProb: 0.03, jumpScale: 0.02 },
      'ETH-USD': { name: 'Ethereum', initialPrice: 3850, drift: 0.00012, volatility: 0.022, jumpProb: 0.035, jumpScale: 0.025 },
      'SOL-USD': { name: 'Solana', initialPrice: 195, drift: 0.00015, volatility: 0.030, jumpProb: 0.04, jumpScale: 0.035 },
      'NVDA': { name: 'Nvidia Corp', initialPrice: 128, drift: 0.00018, volatility: 0.020, jumpProb: 0.025, jumpScale: 0.02 },
      'SPY': { name: 'S&P 500 ETF', initialPrice: 565, drift: 0.00005, volatility: 0.007, jumpProb: 0.01, jumpScale: 0.009 },
      'USOIL': { name: 'WTI Crude Oil', initialPrice: 71.50, drift: 0.00003, volatility: 0.014, jumpProb: 0.018, jumpScale: 0.015 },
      'GLD': { name: 'Gold Trust ETF', initialPrice: 245, drift: 0.00003, volatility: 0.006, jumpProb: 0.008, jumpScale: 0.007 },
      'DOGE-USD': { name: 'Dogecoin (Meme Speculative)', initialPrice: 0.125, drift: 0.00008, volatility: 0.055, jumpProb: 0.06, jumpScale: 0.045 },
      'COIN': { name: 'Coinbase Global (Crypto FinTech)', initialPrice: 215.00, drift: 0.00016, volatility: 0.028, jumpProb: 0.035, jumpScale: 0.025 },
      'HOOD': { name: 'Robinhood Markets (FinTech Broker)', initialPrice: 26.50, drift: 0.00014, volatility: 0.025, jumpProb: 0.030, jumpScale: 0.022 },
      'PYPL': { name: 'PayPal Holdings (FinTech Payments)', initialPrice: 78.00, drift: 0.00008, volatility: 0.016, jumpProb: 0.020, jumpScale: 0.015 },
      'EUR-USD': { name: 'EUR/USD (Euro / US Dollar)', initialPrice: 1.0850, drift: 0.00002, volatility: 0.004, jumpProb: 0.008, jumpScale: 0.005 },
      'GBP-USD': { name: 'GBP/USD (British Pound / USD)', initialPrice: 1.3040, drift: 0.000025, volatility: 0.005, jumpProb: 0.010, jumpScale: 0.006 },
      'USD-JPY': { name: 'USD/JPY (US Dollar / Japanese Yen)', initialPrice: 149.60, drift: 0.00003, volatility: 0.006, jumpProb: 0.012, jumpScale: 0.007 },
      'AUD-USD': { name: 'AUD/USD (Australian Dollar / USD)', initialPrice: 0.6720, drift: 0.00002, volatility: 0.005, jumpProb: 0.009, jumpScale: 0.005 }
    };

    // Keep active state for live ticking
    this.livePrices = {};
    for (const [symbol, config] of Object.entries(this.assets)) {
      this.livePrices[symbol] = config.initialPrice;
    }
  }

  /**
   * Box-Muller transform for generating standard normal random variables ~ N(0, 1)
   */
  static normalRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Generate next price tick using Geometric Brownian Motion + Poisson Jumps
   */
  nextPrice(symbol) {
    const config = this.assets[symbol] || this.assets['BTC-USD'];
    const currentPrice = this.livePrices[symbol] || config.initialPrice;

    const dt = 1 / 3600; // Small time increment
    const z = MarketGenerator.normalRandom();
    
    // Diffusion step
    let returnPct = (config.drift - 0.5 * Math.pow(config.volatility, 2)) * dt + 
                    config.volatility * Math.sqrt(dt) * z;

    // Merton Jump Diffusion check
    if (Math.random() < config.jumpProb) {
      const jumpDirection = Math.random() > 0.48 ? 1 : -1;
      const jumpMagnitude = MarketGenerator.normalRandom() * config.jumpScale;
      returnPct += jumpDirection * Math.abs(jumpMagnitude);
    }

    const nextP = Math.max(0.0001, currentPrice * Math.exp(returnPct));
    const decimals = (symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('AUD')) ? 4 : (symbol.includes('DOGE') ? 4 : 2);
    this.livePrices[symbol] = Number(nextP.toFixed(decimals));
    return this.livePrices[symbol];
  }

  /**
   * Generate historical OHLCV series (Open, High, Low, Close, Volume)
   * count: number of candles
   * timeframeMinutes: candle duration in minutes (e.g. 1, 5, 15, 60, 1440)
   */
  generateHistory(symbol = 'BTC-USD', count = 200, timeframeMinutes = 15) {
    let tf = 15;
    if (typeof timeframeMinutes === 'string') {
      if (timeframeMinutes.endsWith('h') || timeframeMinutes.endsWith('H')) {
        tf = (parseInt(timeframeMinutes) || 1) * 60;
      } else if (timeframeMinutes.endsWith('d') || timeframeMinutes.endsWith('D')) {
        tf = (parseInt(timeframeMinutes) || 1) * 1440;
      } else {
        tf = parseInt(timeframeMinutes) || 15;
      }
    } else if (typeof timeframeMinutes === 'number' && !isNaN(timeframeMinutes) && timeframeMinutes > 0) {
      tf = timeframeMinutes;
    }
    timeframeMinutes = tf;

    const config = this.assets[symbol] || this.assets['BTC-USD'];
    const candles = [];
    const now = Date.now();
    const intervalMs = timeframeMinutes * 60 * 1000;
    const startTime = now - (count * intervalMs);

    let price = config.initialPrice * (0.85 + Math.random() * 0.15); // Slightly randomized starting level

    for (let i = 0; i < count; i++) {
      const timestamp = startTime + (i * intervalMs);
      const open = price;
      
      // Simulate intra-candle path (5 micro ticks)
      let high = open;
      let low = open;
      let current = open;

      const subTicks = 8;
      for (let t = 0; t < subTicks; t++) {
        const z = MarketGenerator.normalRandom();
        const tickRet = (config.drift * (timeframeMinutes / 60)) + 
                        (config.volatility * Math.sqrt(timeframeMinutes / 60) * z / Math.sqrt(subTicks));
        current = current * Math.exp(tickRet);
        if (current > high) high = current;
        if (current < low) low = current;
      }

      // Add occasional jump
      if (Math.random() < (config.jumpProb * (timeframeMinutes / 15))) {
        const shock = (Math.random() > 0.5 ? 1 : -1) * (0.01 + Math.random() * config.jumpScale);
        current *= (1 + shock);
        if (current > high) high = current;
        if (current < low) low = current;
      }

      const close = current;
      price = close;

      // Realistic volume correlation: higher volatility = higher volume
      const rangeRatio = (high - low) / (open || 1);
      const baseVol = 10000 / (close || 1) * 50;
      const volume = Math.round(baseVol * (1 + rangeRatio * 15 + Math.random() * 2));

      candles.push({
        time: Math.floor(timestamp / 1000), // Unix seconds for TradingView compatibility
        timestamp,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume
      });
    }

    // Anchor history to current live real price if available
    const livePrice = this.livePrices[symbol];
    if (livePrice && candles.length > 0) {
      const generatedClose = candles[candles.length - 1].close || 1;
      const ratio = livePrice / generatedClose;
      for (const c of candles) {
        c.open = Number((c.open * ratio).toFixed(2));
        c.high = Number((c.high * ratio).toFixed(2));
        c.low = Number((c.low * ratio).toFixed(2));
        c.close = Number((c.close * ratio).toFixed(2));
      }
      candles[candles.length - 1].close = livePrice;
    }

    return candles;
  }
}

module.exports = MarketGenerator;
