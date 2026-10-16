/**
 * Limit Order Book (L2 Depth) Simulator
 * Real-time order book with bids, asks, spread, cumulative depth, and order book imbalance indicator.
 */

class OrderBook {
  constructor(symbol = 'BTC-USD', midPrice = 65000) {
    this.symbol = symbol;
    this.midPrice = midPrice;
    this.depthLevels = 12;
    this.tickSize = symbol.includes('BTC') ? 1.0 : 0.05;
    this.bids = [];
    this.asks = [];
    this.generateBook(this.midPrice);
  }

  generateBook(mid) {
    this.midPrice = mid;
    const spread = this.tickSize * (1 + Math.floor(Math.random() * 3));
    const bestBid = Number((mid - (spread / 2)).toFixed(2));
    const bestAsk = Number((mid + (spread / 2)).toFixed(2));

    this.bids = [];
    this.asks = [];

    let cumBidVol = 0;
    for (let i = 0; i < this.depthLevels; i++) {
      const price = Number((bestBid - (i * this.tickSize * (1 + i * 0.1))).toFixed(2));
      const size = Number((0.2 + Math.random() * 2.5 * (1 + i * 0.2)).toFixed(4));
      cumBidVol += size;
      this.bids.push({ price, size, total: Number(cumBidVol.toFixed(4)) });
    }

    let cumAskVol = 0;
    for (let i = 0; i < this.depthLevels; i++) {
      const price = Number((bestAsk + (i * this.tickSize * (1 + i * 0.1))).toFixed(2));
      const size = Number((0.2 + Math.random() * 2.5 * (1 + i * 0.2)).toFixed(4));
      cumAskVol += size;
      this.asks.push({ price, size, total: Number(cumAskVol.toFixed(4)) });
    }
  }

  update(newMidPrice) {
    this.generateBook(newMidPrice);
    return this.getState();
  }

  getState() {
    const totalBidVol = this.bids.reduce((sum, b) => sum + b.size, 0);
    const totalAskVol = this.asks.reduce((sum, a) => sum + a.size, 0);
    const spread = Number((this.asks[0].price - this.bids[0].price).toFixed(2));
    const spreadBps = Number(((spread / this.midPrice) * 10000).toFixed(2));
    
    // Order Book Imbalance (OBI): Institutional micro-structure indicator
    // OBI = (V_bid - V_ask) / (V_bid + V_ask), bounds [-1, 1]
    const imbalance = (totalBidVol + totalAskVol) > 0 ? 
      Number(((totalBidVol - totalAskVol) / (totalBidVol + totalAskVol)).toFixed(3)) : 0;

    return {
      symbol: this.symbol,
      midPrice: this.midPrice,
      spread,
      spreadBps,
      imbalance,
      bids: this.bids,
      asks: this.asks
    };
  }
}

module.exports = OrderBook;
