/**
 * AlphaForge Autonomous Dual-Asset Trading Bot Manager
 * Automatically runs paper/testnet algorithmic trading for Gold (XAU-USD) and Bitcoin (BTC-USD)
 * with institutional risk guards: Hard Stop-Loss (-2%), Take-Profit (+4-5%), and AI Regime Filter.
 */

const Indicators = require('../core/indicators');
const RegimeFilter = require('../core/regimeFilter');

class AutoBotManager {
  constructor(telegramService = null) {
    this.telegramService = telegramService;
    
    const defaultCapital = process.env.INITIAL_CAPITAL ? parseFloat(process.env.INITIAL_CAPITAL) : 20.00;

    // Configured asset-specific bots
    this.bots = {
      'XAU-USD': {
        name: 'Gold Trend Hunter (XAU-USD)',
        symbol: 'XAU-USD',
        strategy: 'smaCrossover',
        params: { fastPeriod: 9, slowPeriod: 21, maType: 'EMA' },
        active: false,
        cash: defaultCapital,
        initialCapital: defaultCapital,
        position: 0,
        entryPrice: 0,
        stopLossPct: 2.0,      // Hard stop at -2%
        takeProfitPct: 4.0,    // Target profit at +4%
        aiFilterEnabled: true,
        trades: [],
        realizedPnL: 0,
        unrealizedPnL: 0,
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRatePct: 0
      },
      'BTC-USD': {
        name: 'Bitcoin Volatility Reversion (BTC-USD)',
        symbol: 'BTC-USD',
        strategy: 'bollingerReversion',
        params: { period: 20, multiplier: 2 },
        active: false,
        cash: defaultCapital,
        initialCapital: defaultCapital,
        position: 0,
        entryPrice: 0,
        stopLossPct: 2.0,      // Hard stop at -2%
        takeProfitPct: 5.0,    // Target profit at +5%
        aiFilterEnabled: true,
        trades: [],
        realizedPnL: 0,
        unrealizedPnL: 0,
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRatePct: 0
      }
    };

    this.listeners = new Set();
  }

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  broadcast(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {}
    }
  }

  startBot(symbol) {
    if (this.bots[symbol]) {
      this.bots[symbol].active = true;
      this.broadcast({ type: 'BOT_STARTED', symbol, bot: this.getBotStatus(symbol) });
      return true;
    }
    return false;
  }

  stopBot(symbol) {
    if (this.bots[symbol]) {
      this.bots[symbol].active = false;
      this.broadcast({ type: 'BOT_STOPPED', symbol, bot: this.getBotStatus(symbol) });
      return true;
    }
    return false;
  }

  startAll() {
    for (const symbol of Object.keys(this.bots)) {
      this.bots[symbol].active = true;
    }
    this.broadcast({ type: 'ALL_BOTS_STARTED', bots: this.getStatus() });
    return this.getStatus();
  }

  stopAll() {
    for (const symbol of Object.keys(this.bots)) {
      this.bots[symbol].active = false;
    }
    this.broadcast({ type: 'ALL_BOTS_STOPPED', bots: this.getStatus() });
    return this.getStatus();
  }

  reset(symbol) {
    if (this.bots[symbol]) {
      const b = this.bots[symbol];
      b.cash = b.initialCapital;
      b.position = 0;
      b.entryPrice = 0;
      b.realizedPnL = 0;
      b.unrealizedPnL = 0;
      b.totalTrades = 0;
      b.winTrades = 0;
      b.lossTrades = 0;
      b.winRatePct = 0;
      b.trades = [];
      return true;
    }
    return false;
  }

  getBotStatus(symbol) {
    const b = this.bots[symbol];
    if (!b) return null;
    const currentPrice = b.lastPrice || b.entryPrice || 0;
    const equity = b.cash + (b.position * currentPrice);
    const returnPct = ((equity - b.initialCapital) / b.initialCapital) * 100;

    return {
      name: b.name,
      symbol: b.symbol,
      strategy: b.strategy,
      params: b.params,
      active: b.active,
      cash: Number(b.cash.toFixed(2)),
      equity: Number(equity.toFixed(2)),
      position: Number(b.position.toFixed(4)),
      entryPrice: Number(b.entryPrice.toFixed(2)),
      lastPrice: Number(currentPrice.toFixed(2)),
      unrealizedPnL: Number(b.unrealizedPnL.toFixed(2)),
      realizedPnL: Number(b.realizedPnL.toFixed(2)),
      totalNetProfit: Number((equity - b.initialCapital).toFixed(2)),
      returnPct: Number(returnPct.toFixed(2)),
      totalTrades: b.totalTrades,
      winTrades: b.winTrades,
      lossTrades: b.lossTrades,
      winRatePct: Number(b.winRatePct.toFixed(1)),
      stopLossPct: b.stopLossPct,
      takeProfitPct: b.takeProfitPct,
      aiFilterEnabled: b.aiFilterEnabled,
      recentTrades: b.trades.slice(-5).reverse()
    };
  }

  getStatus() {
    const res = {};
    for (const symbol of Object.keys(this.bots)) {
      res[symbol] = this.getBotStatus(symbol);
    }
    return res;
  }

  /**
   * Main evaluation loop called upon each market price tick
   */
  onTick(symbol, currentPrice, candles) {
    const bot = this.bots[symbol];
    if (!bot || !bot.active) return;
    if (!candles || candles.length < 25) return;

    bot.lastPrice = currentPrice;
    const closes = candles.map(c => c.close);

    // 1. Calculate Unrealized PnL & Position Metrics
    let unrealizedPnL = 0;
    let pnlPct = 0;
    let stopLossPrice = 0;
    let takeProfitPrice = 0;

    if (bot.position > 0 && bot.entryPrice > 0) {
      unrealizedPnL = (currentPrice - bot.entryPrice) * bot.position;
      pnlPct = ((currentPrice - bot.entryPrice) / bot.entryPrice) * 100;
      stopLossPrice = bot.entryPrice * (1 - bot.stopLossPct / 100);
      takeProfitPrice = bot.entryPrice * (1 + bot.takeProfitPct / 100);
      bot.unrealizedPnL = unrealizedPnL;
    } else {
      bot.unrealizedPnL = 0;
    }

    // 2. Classify Current Market Regime with AI
    const regimeInfo = RegimeFilter.analyze(candles, bot.strategy, 'BUY');

    // 3. Emergency Guard 1: Hard Stop-Loss Trigger (-2%)
    if (bot.position > 0 && pnlPct <= -bot.stopLossPct) {
      this.executeSell(bot, currentPrice, `🚨 HARD STOP-LOSS HIT (-${Math.abs(pnlPct).toFixed(2)}%) - Capital Protected`);
      return;
    }

    // 4. Emergency Guard 2: Take-Profit Target Trigger (+4% or +5%)
    if (bot.position > 0 && pnlPct >= bot.takeProfitPct) {
      this.executeSell(bot, currentPrice, `🎯 TAKE-PROFIT TARGET HIT (+${pnlPct.toFixed(2)}%) - Profit Secured`);
      return;
    }

    // 5. Evaluate Strategy Signals
    let signal = 'HOLD';
    let reason = '';

    if (bot.strategy === 'smaCrossover') {
      const fastP = bot.params.fastPeriod || 9;
      const slowP = bot.params.slowPeriod || 21;
      const maType = bot.params.maType || 'EMA';
      const fastMA = maType === 'EMA' ? Indicators.ema(closes, fastP) : Indicators.sma(closes, fastP);
      const slowMA = maType === 'EMA' ? Indicators.ema(closes, slowP) : Indicators.sma(closes, slowP);
      const i = closes.length - 1;

      if (fastMA[i - 1] <= slowMA[i - 1] && fastMA[i] > slowMA[i]) {
        signal = 'BUY';
        reason = `${maType}(${fastP}) crossed ABOVE ${maType}(${slowP}) (Golden Cross)`;
      } else if (fastMA[i - 1] >= slowMA[i - 1] && fastMA[i] < slowMA[i]) {
        signal = 'SELL';
        reason = `${maType}(${fastP}) crossed BELOW ${maType}(${slowP}) (Death Cross)`;
      }
    } else if (bot.strategy === 'bollingerReversion') {
      const period = bot.params.period || 20;
      const multiplier = bot.params.multiplier || 2;
      const bb = Indicators.bollingerBands(closes, period, multiplier);
      const i = closes.length - 1;

      if (bb.lower[i] && closes[i - 1] <= bb.lower[i - 1] && closes[i] > bb.lower[i]) {
        signal = 'BUY';
        reason = `Bounced off Lower Bollinger Band (${bb.lower[i].toFixed(2)})`;
      } else if (bb.upper[i] && closes[i - 1] >= bb.upper[i - 1] && closes[i] < bb.upper[i]) {
        signal = 'SELL';
        reason = `Rejected Upper Bollinger Band (${bb.upper[i].toFixed(2)})`;
      }
    }

    // 6. AI Regime Filter Guard on BUY signals
    if (signal === 'BUY' && bot.aiFilterEnabled) {
      if (!regimeInfo.shouldExecute) {
        this.broadcast({
          type: 'AI_FILTER_BLOCKED',
          symbol,
          reason: regimeInfo.reason,
          regime: regimeInfo.regime,
          confidence: regimeInfo.confidence,
          timestamp: Date.now()
        });
        return; // Protect capital from entering during crash/chop
      }
    }

    // 7. Order Execution
    if (signal === 'BUY' && bot.position === 0 && bot.cash > 100) {
      this.executeBuy(bot, currentPrice, reason, regimeInfo);
    } else if (signal === 'SELL' && bot.position > 0) {
      this.executeSell(bot, currentPrice, reason);
    }
  }

  executeBuy(bot, currentPrice, reason, regimeInfo) {
    const slippage = currentPrice * 0.0005; // 0.05% slippage simulation
    const fillPrice = currentPrice + slippage;
    const alloc = bot.cash * 0.99; // 99% allocation
    const units = alloc / fillPrice;

    bot.position = Number(units.toFixed(4));
    bot.entryPrice = fillPrice;
    bot.cash = Number((bot.cash - alloc).toFixed(2));

    const tradeRecord = {
      id: bot.trades.length + 1,
      type: 'BUY',
      symbol: bot.symbol,
      fillPrice: Number(fillPrice.toFixed(2)),
      units: bot.position,
      allocated: Number(alloc.toFixed(2)),
      timestamp: Date.now(),
      reason,
      regime: regimeInfo ? regimeInfo.regime : 'NORMAL'
    };

    bot.trades.push(tradeRecord);

    const alertMsg = `🤖 [${bot.name}] 🟢 BUY FILLED\n` +
                     `Asset: ${bot.symbol}\n` +
                     `Price: $${fillPrice.toFixed(2)}\n` +
                     `Size: ${bot.position} units\n` +
                     `Stop-Loss: $${(fillPrice * (1 - bot.stopLossPct / 100)).toFixed(2)} (-${bot.stopLossPct}%)\n` +
                     `Target: $${(fillPrice * (1 + bot.takeProfitPct / 100)).toFixed(2)} (+${bot.takeProfitPct}%)\n` +
                     `Reason: ${reason}`;

    console.log(alertMsg);

    if (this.telegramService && this.telegramService.enabled) {
      this.telegramService.sendCustomAlert(alertMsg);
    }

    this.broadcast({ type: 'ORDER_FILLED', action: 'BUY', trade: tradeRecord, bot: this.getBotStatus(bot.symbol) });
  }

  executeSell(bot, currentPrice, reason) {
    const slippage = currentPrice * 0.0005;
    const fillPrice = currentPrice - slippage;
    const proceeds = bot.position * fillPrice;
    const costBasis = bot.position * bot.entryPrice;
    const tradePnL = proceeds - costBasis;
    const returnPct = ((fillPrice - bot.entryPrice) / bot.entryPrice) * 100;

    bot.cash = Number((bot.cash + proceeds).toFixed(2));
    bot.realizedPnL = Number((bot.realizedPnL + tradePnL).toFixed(2));
    bot.totalTrades++;

    if (tradePnL >= 0) {
      bot.winTrades++;
    } else {
      bot.lossTrades++;
    }

    bot.winRatePct = (bot.winTrades / bot.totalTrades) * 100;

    const tradeRecord = {
      id: bot.trades.length + 1,
      type: 'SELL',
      symbol: bot.symbol,
      fillPrice: Number(fillPrice.toFixed(2)),
      units: bot.position,
      proceeds: Number(proceeds.toFixed(2)),
      pnl: Number(tradePnL.toFixed(2)),
      returnPct: Number(returnPct.toFixed(2)),
      timestamp: Date.now(),
      reason
    };

    bot.trades.push(tradeRecord);
    bot.position = 0;
    bot.entryPrice = 0;
    bot.unrealizedPnL = 0;

    const emoji = tradePnL >= 0 ? '🟢 TAKE-PROFIT / EXIT' : '🔴 STOP-LOSS / EXIT';
    const alertMsg = `🤖 [${bot.name}] ${emoji}\n` +
                     `Asset: ${bot.symbol}\n` +
                     `Exit Price: $${fillPrice.toFixed(2)}\n` +
                     `Trade PnL: $${tradePnL >= 0 ? '+' : ''}${tradePnL.toFixed(2)} (${returnPct.toFixed(2)}%)\n` +
                     `Total Win Rate: ${bot.winRatePct.toFixed(1)}% (${bot.winTrades}/${bot.totalTrades})\n` +
                     `Reason: ${reason}`;

    console.log(alertMsg);

    if (this.telegramService && this.telegramService.enabled) {
      this.telegramService.sendCustomAlert(alertMsg);
    }

    this.broadcast({ type: 'ORDER_FILLED', action: 'SELL', trade: tradeRecord, bot: this.getBotStatus(bot.symbol) });
  }
}

module.exports = AutoBotManager;
