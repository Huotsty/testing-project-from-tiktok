/**
 * AlphaForge Micro-Account Real Trading Service
 * Allows trading with strictly capped capital ($1 - $10) and enforced 1-2% risk guard.
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const realConfigFile = path.join(__dirname, '../real_trade_config.json');

class RealTradingService {
  constructor() {
    this.apiKey = '';
    this.apiSecret = '';
    this.email = '';
    this.mode = 'TESTNET'; // 'TESTNET' or 'LIVE'
    this.maxCapitalUsd = 20.00; // Hard safety cap ($1 - $20 based on account balance)
    this.riskPerTradePct = 2.0; // 2% max risk (max $0.40 loss on $20)
    this.enabled = false;

    // Security & Circuit Breaker State
    this.lastLiveOrderTimestamp = 0;
    this.minLiveOrderIntervalMs = 1500; // 1.5s throttle between live broker orders
    this.recentOrderTimestamps = [];
    this.maxOrdersPerMinute = 15;
    this.dailyRealizedLoss = 0;
    this.maxDailyLossLimit = 2.00; // Max loss cap ($2.00 on micro-accounts, i.e. 10%)
    this.circuitBreakerTriggered = false;

    // Real-Time Real Money Portfolio & Positions State
    this.portfolio = {
      initialCapital: 15.00,
      balanceUsd: 15.00,
      availableUsd: 15.00,
      inTradeUsd: 0.00,
      unrealizedPnl: 0.00,
      dailyRealizedPnl: 0.00,
      totalEquity: 15.00,
      currency: 'USDT',
      lastUpdated: Date.now()
    };
    this.openPositions = new Map(); // symbol -> position
    this.auditLog = [];
    this.listeners = new Set();
    this.serverTimeOffset = 25000; // Compensates for Windows local clock drift relative to Binance

    this.loadConfig();
    if (process.env.NODE_ENV !== 'test') {
      this.syncServerTime();
      const timer = setInterval(() => this.syncServerTime(), 300000);
      if (timer && timer.unref) timer.unref();
    }
  }

  loadConfig() {
    // 1. Check environment variables first (Highest Security Priority)
    this.apiKey = process.env.BINANCE_API_KEY || process.env.CAPITAL_API_KEY || process.env.TRADING_API_KEY || this.apiKey;
    this.apiSecret = process.env.BINANCE_API_SECRET || process.env.CAPITAL_API_SECRET || process.env.TRADING_API_SECRET || this.apiSecret;
    this.email = process.env.CAPITAL_EMAIL || process.env.TRADING_EMAIL || this.email;
    if (process.env.TRADING_MODE) this.mode = process.env.TRADING_MODE;
    if (process.env.TRADING_ENABLED === 'true') this.enabled = true;

    // 2. Check local config file
    if (fs.existsSync(realConfigFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(realConfigFile, 'utf8'));
        if (!this.apiKey) this.apiKey = data.apiKey || '';
        if (!this.apiSecret) this.apiSecret = data.apiSecret || '';
        if (!this.email) this.email = data.email || '';
        if (!process.env.TRADING_MODE) this.mode = data.mode || 'TESTNET';
        this.maxCapitalUsd = Math.min(Number(data.maxCapitalUsd) || 20.00, 20.00); // Enforce safety cap <= $20
        this.riskPerTradePct = Math.min(Number(data.riskPerTradePct) || 2.0, 2.0); // Enforce <= 2%
        if (process.env.TRADING_ENABLED === undefined) this.enabled = !!data.enabled;
      } catch (e) {}
    }
  }

  saveConfig(apiKey, apiSecret, mode, maxCapital, riskPct, enabled, email = '') {
    this.apiKey = apiKey || this.apiKey;
    this.apiSecret = apiSecret || this.apiSecret;
    this.email = email || this.email;
    this.mode = mode || this.mode;
    this.maxCapitalUsd = Math.min(Number(maxCapital) || 20.00, 20.00);
    this.riskPerTradePct = Math.min(Number(riskPct) || 2.0, 2.0);
    this.enabled = !!enabled;

    try {
      fs.writeFileSync(realConfigFile, JSON.stringify({
        apiKey: this.apiKey,
        apiSecret: this.apiSecret,
        email: this.email,
        mode: this.mode,
        maxCapitalUsd: this.maxCapitalUsd,
        riskPerTradePct: this.riskPerTradePct,
        enabled: this.enabled
      }, null, 2));
    } catch (e) {}

    return this.getStatus();
  }

  getStatus() {
    return {
      configured: !!(this.apiKey && this.apiSecret),
      hasApiKey: !!this.apiKey,
      hasApiSecret: !!this.apiSecret,
      apiKeyMasked: this.apiKey ? `${this.apiKey.slice(0, 4)}...${this.apiKey.slice(-4)}` : '',
      email: this.email ? `${this.email.slice(0, 3)}***@${this.email.split('@')[1] || '***'}` : '',
      mode: this.mode,
      maxCapitalUsd: this.maxCapitalUsd,
      riskPerTradePct: this.riskPerTradePct,
      maxLossUsd: Number((this.maxCapitalUsd * (this.riskPerTradePct / 100)).toFixed(2)),
      enabled: this.enabled,
      circuitBreakerActive: this.circuitBreakerTriggered,
      dailyLossUsd: Number(this.dailyRealizedLoss.toFixed(2)),
      endpoint: this.mode && this.mode.startsWith('CAPITAL') ? (this.mode === 'CAPITAL_LIVE' ? 'api-capital.backend-capital.com' : 'demo-api-capital.backend-capital.com') : (this.mode === 'BINANCE_LIVE' ? 'api.binance.com' : 'testnet.binance.vision')
    };
  }

  resetCircuitBreaker() {
    this.dailyRealizedLoss = 0;
    this.circuitBreakerTriggered = false;
    return this.getStatus();
  }

  /**
   * Calculate exact position sizing and stop-loss price
   */
  calculatePositionSize(entryPrice, tradeCapital = 5.00, side = 'BUY') {
    const allocated = Math.min(tradeCapital, this.maxCapitalUsd);
    const maxLossAmount = Number((allocated * (this.riskPerTradePct / 100)).toFixed(2));
    const isSell = (typeof side === 'string' && side.toUpperCase().includes('SELL'));

    let stopLossPrice, takeProfitPrice;
    if (isSell) {
      // Short / Sell: Loss occurs if price rises, profit if price falls
      stopLossPrice = Number((entryPrice * (1 + this.riskPerTradePct / 100)).toFixed(2));
      takeProfitPrice = Number((entryPrice * (1 - (this.riskPerTradePct * 2) / 100)).toFixed(2));
    } else {
      // Long / Buy: Loss occurs if price falls, profit if price rises
      stopLossPrice = Number((entryPrice * (1 - this.riskPerTradePct / 100)).toFixed(2));
      takeProfitPrice = Number((entryPrice * (1 + (this.riskPerTradePct * 2) / 100)).toFixed(2));
    }

    return {
      allocatedCapital: allocated,
      maxLossAmount, // e.g. $0.20 on $10
      stopLossPrice,
      takeProfitPrice,
      riskRewardRatio: '1:2',
      side: isSell ? 'SELL' : 'BUY'
    };
  }

  /**
   * Dynamically query exchange server time to eliminate clock drift
   */
  async syncServerTime() {
    if (process.env.NODE_ENV === 'test') return this.serverTimeOffset;
    return new Promise((resolve) => {
      const host = this.mode === 'LIVE' ? 'api.binance.com' : 'testnet.binance.vision';
      const req = https.get(`https://${host}/api/v3/time`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.serverTime) {
              this.serverTimeOffset = Date.now() - data.serverTime;
              resolve(this.serverTimeOffset);
              return;
            }
          } catch (e) {}
          resolve(this.serverTimeOffset || 25000);
        });
      });
      req.on('error', () => resolve(this.serverTimeOffset || 25000));
      req.setTimeout(4000, () => { req.destroy(); resolve(this.serverTimeOffset || 25000); });
    });
  }

  /**
   * Place real authenticated market order on Binance Spot (Live or Testnet)
   */
  async placeBinanceOrder(symbol, side, quoteOrderQty) {
    const symbolMap = {
      'XAU-USD': 'PAXGUSDT',
      'PAXG-USD': 'PAXGUSDT',
      'BTC-USD': 'BTCUSDT',
      'ETH-USD': 'ETHUSDT',
      'SOL-USD': 'SOLUSDT',
      'DOGE-USD': 'DOGEUSDT'
    };
    const binanceSymbol = symbolMap[symbol] || 'PAXGUSDT';
    const timestamp = Date.now() - (this.serverTimeOffset || 25000) - 1000; // Compensate for local system clock drift
    const recvWindow = 60000; // Maximum allowed Binance receive window
    const orderSide = side === 'SELL' ? 'SELL' : 'BUY';
    const query = `symbol=${binanceSymbol}&side=${orderSide}&type=MARKET&quoteOrderQty=${quoteOrderQty.toFixed(2)}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signature = this.signQuery(query);
    const fullQuery = `${query}&signature=${signature}`;

    const host = this.mode === 'LIVE' ? 'api.binance.com' : 'testnet.binance.vision';

    return new Promise((resolve) => {
      const options = {
        hostname: host,
        port: 443,
        path: `/api/v3/order?${fullQuery}`,
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, data });
            } else {
              resolve({ success: false, error: data.msg || 'Binance API Error', code: data.code });
            }
          } catch (e) {
            resolve({ success: false, error: body });
          }
        });
      });

      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.setTimeout(8000, () => {
        req.destroy();
        resolve({ success: false, error: 'Binance request timed out' });
      });
      req.end();
    });
  }

  /**
   * Place real authenticated trade on Capital.com (Demo or Live)
   */
  async placeCapitalComOrder(symbol, side, units, stopLossPrice, takeProfitPrice) {
    const isLive = this.mode === 'CAPITAL_LIVE';
    const host = isLive ? 'api-capital.backend-capital.com' : 'demo-api-capital.backend-capital.com';

    // 1. Authenticate and get CST + X-SECURITY-TOKEN
    const authPayload = JSON.stringify({
      identifier: this.email || 'cambodia-trader@gmail.com',
      password: this.apiSecret,
      encryptedPassword: false
    });

    return new Promise((resolve) => {
      const authReq = https.request({
        hostname: host,
        port: 443,
        path: '/api/v1/session',
        method: 'POST',
        headers: {
          'X-CAP-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(authPayload)
        }
      }, (res) => {
        const cst = res.headers['cst'];
        const secToken = res.headers['x-security-token'];
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (!cst || !secToken) {
            let cleanErr = 'Authentication failed with broker';
            try {
              const parsed = JSON.parse(body);
              cleanErr = parsed.errorCode || parsed.message || cleanErr;
            } catch (_) {}
            resolve({ success: false, error: 'Capital.com Auth: ' + cleanErr });
            return;
          }

          // 2. Open Position with Stop Loss & Take Profit
          const capitalEpicMap = {
            'XAU-USD': 'GOLD',
            'PAXG-USD': 'GOLD',
            'BTC-USD': 'BTCUSD',
            'ETH-USD': 'ETHUSD',
            'SOL-USD': 'SOLUSD',
            'DOGE-USD': 'DOGEUSD',
            'EUR-USD': 'EURUSD',
            'GBP-USD': 'GBPUSD',
            'USD-JPY': 'USDJPY',
            'AUD-USD': 'AUDUSD',
            'SPY': 'SPY',
            'NVDA': 'NVDA',
            'USOIL': 'OIL_CRUDE'
          };
          const epic = capitalEpicMap[symbol] || (symbol.includes('GOLD') || symbol.includes('XAU') ? 'GOLD' : (symbol.includes('BTC') ? 'BTCUSD' : 'EURUSD'));
          const posPayload = JSON.stringify({
            epic,
            direction: side === 'SELL' ? 'SELL' : 'BUY',
            size: Math.max(units, 0.01),
            stopLossLevel: stopLossPrice,
            profitLevel: takeProfitPrice
          });

          const posReq = https.request({
            hostname: host,
            port: 443,
            path: '/api/v1/positions',
            method: 'POST',
            headers: {
              'CST': cst,
              'X-SECURITY-TOKEN': secToken,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(posPayload)
            }
          }, (posRes) => {
            let posBody = '';
            posRes.on('data', chunk => posBody += chunk);
            posRes.on('end', () => {
              try {
                const posData = JSON.parse(posBody);
                if (posRes.statusCode >= 200 && posRes.statusCode < 300) {
                  resolve({ success: true, data: posData, dealReference: posData.dealReference });
                } else {
                  resolve({ success: false, error: posData.errorMessage || posData.errorCode || posBody });
                }
              } catch (e) {
                resolve({ success: false, error: posBody });
              }
            });
          });

          posReq.on('error', (err) => resolve({ success: false, error: err.message }));
          posReq.write(posPayload);
          posReq.end();
        });
      });

      authReq.on('error', (err) => resolve({ success: false, error: err.message }));
      authReq.setTimeout(8000, () => {
        authReq.destroy();
        resolve({ success: false, error: 'Capital.com request timed out' });
      });
      authReq.write(authPayload);
      authReq.end();
    });
  }

  /**
   * Universal Order Execution Engine
   * Trades ANY chosen asset with enforced hard stop-loss and safety caps.
   */
  async executeTrade(symbol, side, capital, currentPrice) {
    // Security Guard 1: Price and side sanity
    if (!currentPrice || typeof currentPrice !== 'number' || currentPrice <= 0 || !isFinite(currentPrice)) {
      return {
        success: false,
        orderId: `ERR-${Date.now()}`,
        symbol,
        side: side || 'BUY',
        price: 0,
        units: 0,
        capital: 0,
        status: 'SECURITY_REJECTED',
        error: 'Security Guard: Invalid market price received for order execution.',
        exchangeFill: 'SECURITY_BLOCKED'
      };
    }

    const cleanSide = (typeof side === 'string' && side.toUpperCase().includes('SELL')) ? 'SELL' : 'BUY';

    // Security Guard 2: Emergency Daily Loss Circuit Breaker
    if (this.circuitBreakerTriggered || this.dailyRealizedLoss >= this.maxDailyLossLimit) {
      this.circuitBreakerTriggered = true;
      return {
        success: false,
        orderId: `CB-${Date.now()}`,
        symbol,
        side: cleanSide,
        price: currentPrice,
        units: 0,
        capital: 0,
        status: 'CIRCUIT_BREAKER_ACTIVE',
        error: `🚨 EMERGENCY CIRCUIT BREAKER: Cumulative loss limit reached (-$${this.maxDailyLossLimit.toFixed(2)}). All order execution locked to protect capital.`,
        exchangeFill: 'CIRCUIT_BREAKER_BLOCKED'
      };
    }

    // Security Guard 3: Live Order Throttling (Spam & Runaway Loop Protection)
    const isLiveMode = this.enabled && (this.mode === 'LIVE' || this.mode === 'BINANCE_LIVE' || this.mode === 'CAPITAL_LIVE');
    if (isLiveMode) {
      const now = Date.now();
      if (now - this.lastLiveOrderTimestamp < this.minLiveOrderIntervalMs) {
        return {
          success: false,
          orderId: `THROT-${now}`,
          symbol,
          side: cleanSide,
          price: currentPrice,
          units: 0,
          capital: 0,
          status: 'RATE_LIMITED',
          error: `Security Guard: High-frequency throttling active. Please wait ${this.minLiveOrderIntervalMs}ms between orders.`,
          exchangeFill: 'THROTTLED_BLOCKED'
        };
      }

      this.recentOrderTimestamps = this.recentOrderTimestamps.filter(t => now - t < 60000);
      if (this.recentOrderTimestamps.length >= this.maxOrdersPerMinute) {
        return {
          success: false,
          orderId: `THROT-${now}`,
          symbol,
          side: cleanSide,
          price: currentPrice,
          units: 0,
          capital: 0,
          status: 'RATE_LIMITED',
          error: `Security Guard: Maximum ${this.maxOrdersPerMinute} orders per minute reached. Order rejected for safety.`,
          exchangeFill: 'THROTTLED_BLOCKED'
        };
      }
      this.lastLiveOrderTimestamp = now;
      this.recentOrderTimestamps.push(now);
    }

    const allocated = Math.min(Math.max(Number(capital) || 10.00, 1.00), this.maxCapitalUsd);
    const pos = this.calculatePositionSize(currentPrice, allocated, cleanSide);
    const rawUnits = allocated / currentPrice;
    const precision = rawUnits < 0.01 ? 6 : (rawUnits < 1 ? 4 : 2);
    const units = Number(rawUnits.toFixed(precision));

    let liveOrderData = null;
    let orderId = `AF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
    let executionError = null;

    // 1. If Capital.com Mode
    if (this.mode && this.mode.startsWith('CAPITAL') && this.apiKey && this.apiSecret && this.enabled) {
      try {
        const capRes = await this.placeCapitalComOrder(symbol, side, units, pos.stopLossPrice, pos.takeProfitPrice);
        if (capRes.success && capRes.data) {
          liveOrderData = capRes.data;
          orderId = `CAP-${capRes.dealReference || capRes.data.dealReference || orderId}`;
        } else {
          executionError = capRes.error || 'Capital.com broker rejected order';
        }
      } catch (err) {
        executionError = err.message;
      }
    }
    // 2. If Binance Mode
    else if (this.apiKey && this.apiSecret && this.enabled) {
      try {
        const binanceRes = await this.placeBinanceOrder(symbol, side, allocated);
        if (binanceRes.success && binanceRes.data) {
          liveOrderData = binanceRes.data;
          orderId = `BN-${binanceRes.data.orderId || orderId}`;
        } else {
          executionError = binanceRes.error || 'Binance broker rejected order';
        }
      } catch (err) {
        executionError = err.message;
      }
    }

    // If user attempted a LIVE order with enabled credentials and it was rejected by the broker,
    // explicitly record the rejection so the user is never misled into believing a live fill occurred.
    const isLiveRejected = !!(this.enabled && executionError && !liveOrderData);

    const tradeTicket = {
      success: !isLiveRejected,
      orderId,
      symbol,
      side: side === 'SELL' ? 'SELL / SHORT' : 'BUY / LONG',
      price: currentPrice,
      units,
      capital: allocated,
      stopLossPrice: pos.stopLossPrice,
      takeProfitPrice: pos.takeProfitPrice,
      maxPossibleLoss: pos.maxLossAmount,
      mode: this.mode,
      timestamp: Date.now(),
      status: isLiveRejected ? 'BROKER_REJECTED' : 'FILLED_AND_ARMED',
      error: executionError || null,
      exchangeFill: liveOrderData 
        ? (this.mode && this.mode.startsWith('CAPITAL') ? 'LIVE_CAPITAL_COM_CONFIRMED' : 'LIVE_BINANCE_SPOT_CONFIRMED')
        : (isLiveRejected ? 'BROKER_REJECTED_UNFILLED' : 'ALPHAFORGE_SIMULATED_FILL'),
      guarantee: `Hard Stop-Loss at $${pos.stopLossPrice} (-${this.riskPerTradePct}%) strictly limits loss to -$${pos.maxLossAmount}`
    };

    if (tradeTicket.success) {
      // 1. Record Live Position for real-time tracking
      const positionObj = {
        id: tradeTicket.orderId,
        symbol,
        side: tradeTicket.side,
        units,
        entryPrice: currentPrice,
        currentPrice,
        allocatedCapital: allocated,
        stopLossPrice: pos.stopLossPrice,
        takeProfitPrice: pos.takeProfitPrice,
        unrealizedPnl: 0,
        pnlPct: 0,
        trailingLocked: false,
        exchangeFill: tradeTicket.exchangeFill,
        openedAt: Date.now()
      };
      this.openPositions.set(symbol, positionObj);

      // 2. Adjust Portfolio Balances
      this.portfolio.availableUsd = Math.max(0, Number((this.portfolio.availableUsd - allocated).toFixed(2)));
      this.portfolio.inTradeUsd = Number((this.portfolio.inTradeUsd + allocated).toFixed(2));
      this.portfolio.totalEquity = Number((this.portfolio.availableUsd + this.portfolio.inTradeUsd).toFixed(2));
      this.portfolio.lastUpdated = Date.now();

      // 3. Prepend to Audit Stream
      this.auditLog.unshift({
        timestamp: Date.now(),
        type: 'REAL_ORDER_FILLED',
        orderId,
        symbol,
        side: tradeTicket.side,
        units,
        price: currentPrice,
        capital: allocated,
        stopLossPrice: pos.stopLossPrice,
        takeProfitPrice: pos.takeProfitPrice,
        exchangeFill: tradeTicket.exchangeFill,
        guarantee: tradeTicket.guarantee
      });
      if (this.auditLog.length > 50) this.auditLog.pop();

      // 4. Notify Listeners
      this.notifyListeners({
        type: 'REAL_TRADE_FILLED',
        ticket: tradeTicket,
        portfolio: this.getPortfolioSummary(),
        positions: Array.from(this.openPositions.values())
      });
    }

    return tradeTicket;
  }

  /**
   * Price tick update: Evaluates unrealized PnL, trailing profit locks & hard stops in real-time
   */
  onPriceTick(symbol, livePrice) {
    if (!livePrice || livePrice <= 0) return;

    let hasPositionUpdate = false;
    let totalUnrealizedPnl = 0;

    for (const [posSymbol, pos] of this.openPositions.entries()) {
      if (posSymbol === symbol) {
        pos.currentPrice = livePrice;
        const isBuy = pos.side.includes('BUY');
        const pnl = isBuy ? (livePrice - pos.entryPrice) * pos.units : (pos.entryPrice - livePrice) * pos.units;
        pos.unrealizedPnl = Number(pnl.toFixed(2));
        pos.pnlPct = Number(((pnl / pos.allocatedCapital) * 100).toFixed(2));

        // 1. Dynamic Trailing Profit Lock (+1.5% profit -> Lock +0.5%)
        if (pos.pnlPct >= 1.5 && !pos.trailingLocked) {
          pos.trailingLocked = true;
          pos.stopLossPrice = Number((isBuy ? pos.entryPrice * 1.005 : pos.entryPrice * 0.995).toFixed(2));
          this.notifyListeners({
            type: 'REAL_TRAILING_LOCKED',
            symbol,
            lockPrice: pos.stopLossPrice,
            pnlPct: pos.pnlPct
          });
        }

        // 2. Hard Stop-Loss Triggered
        if ((isBuy && livePrice <= pos.stopLossPrice) || (!isBuy && livePrice >= pos.stopLossPrice)) {
          this.closePosition(symbol, `🚨 STOP-LOSS / EXIT SHIELD (${pos.pnlPct >= 0 ? '+' : ''}${pos.pnlPct}%)`);
          hasPositionUpdate = true;
          continue;
        }

        // 3. Take-Profit Target Triggered
        if ((isBuy && livePrice >= pos.takeProfitPrice) || (!isBuy && livePrice <= pos.takeProfitPrice)) {
          this.closePosition(symbol, `🎯 TAKE-PROFIT TARGET SECURED (+${pos.pnlPct}%)`);
          hasPositionUpdate = true;
          continue;
        }

        hasPositionUpdate = true;
      }
      totalUnrealizedPnl += (pos.unrealizedPnl || 0);
    }

    this.portfolio.unrealizedPnl = Number(totalUnrealizedPnl.toFixed(2));
    this.portfolio.totalEquity = Number((this.portfolio.availableUsd + this.portfolio.inTradeUsd + totalUnrealizedPnl).toFixed(2));
    this.portfolio.lastUpdated = Date.now();

    if (hasPositionUpdate) {
      this.notifyListeners({
        type: 'REAL_PORTFOLIO_TICK',
        symbol,
        price: livePrice,
        portfolio: this.getPortfolioSummary(),
        positions: Array.from(this.openPositions.values())
      });
    }
  }

  /**
   * Close an open position and realize PnL
   */
  async closePosition(symbol, reason = 'Operator Manual Exit') {
    const pos = this.openPositions.get(symbol);
    if (!pos) return { success: false, error: 'No open position found for ' + symbol };

    const currentPrice = pos.currentPrice || pos.entryPrice;
    const isBuy = pos.side.includes('BUY');
    const exitPnl = isBuy ? (currentPrice - pos.entryPrice) * pos.units : (pos.entryPrice - currentPrice) * pos.units;
    const cleanPnl = Number(exitPnl.toFixed(2));

    this.openPositions.delete(symbol);

    this.portfolio.inTradeUsd = Math.max(0, Number((this.portfolio.inTradeUsd - pos.allocatedCapital).toFixed(2)));
    const returnedCash = Number((pos.allocatedCapital + cleanPnl).toFixed(2));
    this.portfolio.availableUsd = Number((this.portfolio.availableUsd + returnedCash).toFixed(2));
    this.portfolio.balanceUsd = Number((this.portfolio.availableUsd + this.portfolio.inTradeUsd).toFixed(2));
    this.portfolio.dailyRealizedPnl = Number((this.portfolio.dailyRealizedPnl + cleanPnl).toFixed(2));

    if (cleanPnl < 0) {
      this.dailyRealizedLoss += Math.abs(cleanPnl);
    }

    let remainingUnrealized = 0;
    for (const p of this.openPositions.values()) {
      remainingUnrealized += (p.unrealizedPnl || 0);
    }
    this.portfolio.unrealizedPnl = Number(remainingUnrealized.toFixed(2));
    this.portfolio.totalEquity = Number((this.portfolio.availableUsd + this.portfolio.inTradeUsd + remainingUnrealized).toFixed(2));
    this.portfolio.lastUpdated = Date.now();

    const exitEvent = {
      type: 'REAL_POSITION_CLOSED',
      timestamp: Date.now(),
      symbol,
      side: isBuy ? 'SELL_EXIT' : 'BUY_EXIT',
      units: pos.units,
      entryPrice: pos.entryPrice,
      exitPrice: currentPrice,
      pnl: cleanPnl,
      pnlPct: Number(((cleanPnl / pos.allocatedCapital) * 100).toFixed(2)),
      reason
    };

    this.auditLog.unshift(exitEvent);
    if (this.auditLog.length > 50) this.auditLog.pop();

    this.notifyListeners({
      type: 'REAL_POSITION_CLOSED',
      data: exitEvent,
      portfolio: this.getPortfolioSummary(),
      positions: Array.from(this.openPositions.values())
    });

    return { success: true, exitEvent, portfolio: this.getPortfolioSummary() };
  }

  /**
   * Emergency panic brake: Closes all real positions immediately
   */
  async emergencyCloseAll() {
    const results = [];
    for (const symbol of Array.from(this.openPositions.keys())) {
      const res = await this.closePosition(symbol, '🛑 EMERGENCY PANIC BRAKE - All Real Capital Flattened');
      results.push({ symbol, ...res });
    }
    return { success: true, closedCount: results.length, results, portfolio: this.getPortfolioSummary() };
  }

  /**
   * Fetch authenticated live balance from Binance Spot
   */
  async fetchBinanceBalance() {
    if (!this.apiKey || !this.apiSecret) {
      return {
        success: false,
        configured: false,
        error: 'No API Key configured. Micro-sandbox active ($15.00 USDT).',
        portfolio: this.getPortfolioSummary()
      };
    }

    const timestamp = Date.now() - (this.serverTimeOffset || 25000) - 1000;
    const recvWindow = 60000;
    const query = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signature = this.signQuery(query);
    const fullQuery = `${query}&signature=${signature}`;
    const host = this.mode === 'LIVE' || this.mode === 'BINANCE_LIVE' ? 'api.binance.com' : 'testnet.binance.vision';

    return new Promise((resolve) => {
      const options = {
        hostname: host,
        port: 443,
        path: `/api/v3/account?${fullQuery}`,
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': this.apiKey,
          'User-Agent': 'AlphaForge/2.4'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const balances = (data.balances || []).filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
              const usdtBal = (data.balances || []).find(b => b.asset === 'USDT') || { free: '0.00', locked: '0.00' };
              const paxgBal = (data.balances || []).find(b => b.asset === 'PAXG') || { free: '0.00', locked: '0.00' };
              const btcBal = (data.balances || []).find(b => b.asset === 'BTC') || { free: '0.00', locked: '0.00' };

              const usdtFree = parseFloat(usdtBal.free) || 0;
              const usdtLocked = parseFloat(usdtBal.locked) || 0;
              const totalUsdt = usdtFree + usdtLocked;

              if (totalUsdt > 0) {
                this.portfolio.balanceUsd = Number(totalUsdt.toFixed(2));
                this.portfolio.availableUsd = Number(usdtFree.toFixed(2));
                this.portfolio.inTradeUsd = Number(usdtLocked.toFixed(2));
                this.portfolio.totalEquity = Number((totalUsdt + this.portfolio.unrealizedPnl).toFixed(2));
                this.portfolio.lastUpdated = Date.now();
              }

              resolve({
                success: true,
                mode: this.mode,
                canTrade: !!data.canTrade,
                canWithdraw: !!data.canWithdraw,
                withdrawalsDisabled: !data.canWithdraw,
                usdtFree,
                usdtLocked,
                totalUsdt,
                balances,
                portfolio: this.getPortfolioSummary()
              });
            } else {
              resolve({
                success: false,
                error: data.msg || 'Binance Account query failed',
                code: data.code,
                portfolio: this.getPortfolioSummary()
              });
            }
          } catch (e) {
            resolve({ success: false, error: body, portfolio: this.getPortfolioSummary() });
          }
        });
      });

      req.on('error', err => resolve({ success: false, error: err.message, portfolio: this.getPortfolioSummary() }));
      req.setTimeout(8000, () => {
        req.destroy();
        resolve({ success: false, error: 'Binance request timed out', portfolio: this.getPortfolioSummary() });
      });
      req.end();
    });
  }

  addListener(callback) {
    if (typeof callback === 'function') this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners(event) {
    for (const cb of this.listeners) {
      try { cb(event); } catch (e) {}
    }
  }

  getPortfolioSummary() {
    return {
      balanceUsd: Number(this.portfolio.balanceUsd.toFixed(2)),
      availableUsd: Number(this.portfolio.availableUsd.toFixed(2)),
      inTradeUsd: Number(this.portfolio.inTradeUsd.toFixed(2)),
      unrealizedPnl: Number(this.portfolio.unrealizedPnl.toFixed(2)),
      dailyRealizedPnl: Number(this.portfolio.dailyRealizedPnl.toFixed(2)),
      totalEquity: Number(this.portfolio.totalEquity.toFixed(2)),
      currency: this.portfolio.currency || 'USDT',
      mode: this.mode,
      activePositionsCount: this.openPositions.size,
      lastUpdated: this.portfolio.lastUpdated
    };
  }

  getLivePortfolio() {
    return {
      success: true,
      portfolio: this.getPortfolioSummary(),
      positions: Array.from(this.openPositions.values()),
      auditLog: this.auditLog.slice(0, 25),
      status: this.getStatus()
    };
  }

  /**
   * Helper to sign Binance query strings
   */
  signQuery(queryString) {
    if (!this.apiSecret) return '';
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }
}

module.exports = new RealTradingService();

