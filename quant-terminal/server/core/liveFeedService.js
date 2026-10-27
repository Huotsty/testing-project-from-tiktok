/**
 * Real-World Market Data Feed Service
 * Connects directly to Binance Public Institutional WebSockets (100% Free, zero keys required).
 * Streams real-time live market trades for:
 *  - Spot Gold (PAXG/USDT - 1:1 physically backed by 1 oz gold in London vaults)
 *  - Bitcoin (BTC/USDT)
 *  - Ethereum (ETH/USDT)
 *  - Solana (SOL/USDT)
 */

const WebSocket = require('ws');

class LiveFeedService {
  constructor() {
    this.ws = null;
    this.isLive = false;
    this.latestPrices = {
      'XAU-USD': 4098.00,
      'BTC-USD': 82500.00,
      'ETH-USD': 3850.00,
      'SOL-USD': 195.00,
      'DOGE-USD': 0.125
    };
    this.listeners = new Set();
    this.symbolMap = {
      'XAU-USD': 'paxgusdt',
      'BTC-USD': 'btcusdt',
      'ETH-USD': 'ethusdt',
      'SOL-USD': 'solusdt',
      'DOGE-USD': 'dogeusdt'
    };
    this.reverseMap = {
      'paxgusdt': 'XAU-USD',
      'btcusdt': 'BTC-USD',
      'ethusdt': 'ETH-USD',
      'solusdt': 'SOL-USD',
      'dogeusdt': 'DOGE-USD'
    };
  }

  start() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isLive = true;
    // Multi-stream WebSocket connection for real live Gold, BTC, ETH, SOL trades
    const streams = Object.values(this.symbolMap).map(s => `${s}@trade`).join('/');
    const url = `wss://data-stream.binance.vision/ws/${streams}`;

    console.log(`🔌 Connecting to Real Live Exchange Market Feed: ${url}`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('✅ CONNECTED TO REAL LIVE MARKET FEED (Real Gold & Crypto streaming live!)');
    });

    this.ws.on('message', (data) => {
      try {
        const raw = JSON.parse(data);
        // Binance returns { stream: "...", data: {...} } on combined streams, or raw {...} on direct streams
        const payload = raw.data || raw;
        const streamSymbol = (payload.s || '').toLowerCase();
        const appSymbol = this.reverseMap[streamSymbol];

        if (appSymbol && payload.p) {
          const livePrice = Number(parseFloat(payload.p).toFixed(2));
          this.latestPrices[appSymbol] = livePrice;

          const tickEvent = {
            symbol: appSymbol,
            price: livePrice,
            volume: parseFloat(payload.q || 0),
            timestamp: payload.T || raw.E || Date.now(),
            isLiveExchange: true
          };

          // Notify all subscribers (charts, bots, order books)
          for (const callback of this.listeners) {
            callback(tickEvent);
          }
        }
      } catch (err) {
        // Silently handle tick parse
      }
    });

    this.ws.on('close', () => {
      console.log('⚠️ Live Exchange feed disconnected. Reconnecting in 3s...');
      if (this.isLive) {
        setTimeout(() => this.start(), 3000);
      }
    });

    this.ws.on('error', (err) => {
      console.error('Live Feed WS error:', err.message);
    });
  }

  stop() {
    this.isLive = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  onTick(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getPrice(symbol) {
    return this.latestPrices[symbol] || 0;
  }
}

module.exports = new LiveFeedService();
