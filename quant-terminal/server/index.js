/**
 * AlphaForge Quant Terminal - Express & WebSocket Server
 */
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const MarketGenerator = require('./core/marketGenerator');
const Indicators = require('./core/indicators');
const Strategies = require('./core/strategies');
const Backtester = require('./core/backtester');
const OrderBook = require('./core/orderBook');
const telegramService = require('./services/telegramService');
const RegimeFilter = require('./core/regimeFilter');
const liveFeedService = require('./core/liveFeedService');
const newsService = require('./services/newsService');
const realTradingService = require('./services/realTradingService');
const AutoBotManager = require('./services/autoBotManager');
const kronosPredictor = require('./core/kronosPredictor');

const PaymentGatewayService = require('./services/paymentGatewayService');

const autoBotManager = new AutoBotManager(telegramService);
const paymentGatewayService = new PaymentGatewayService(telegramService);

const tgConfigFile = path.join(__dirname, 'telegram_config.json');
if (fs.existsSync(tgConfigFile)) {
  try {
    const savedTg = JSON.parse(fs.readFileSync(tgConfigFile, 'utf8'));
    if (savedTg.botToken && savedTg.chatId) {
      telegramService.configure(savedTg.botToken, savedTg.chatId, savedTg.enabled !== false);
      console.log('✅ Loaded saved Telegram Bot credentials from config');
    }
  } catch (e) {}
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const marketGen = new MarketGenerator();
telegramService.serverRef = { marketGen, newsService, autoBotManager };
const orderBooks = {};
for (const symbol of Object.keys(marketGen.assets)) {
  orderBooks[symbol] = new OrderBook(symbol, marketGen.assets[symbol].initialPrice);
}

// In-memory cache for recent historical candles
const candleCache = {};
for (const symbol of Object.keys(marketGen.assets)) {
  candleCache[symbol] = marketGen.generateHistory(symbol, 250, 15);
}

// Live Paper Trading Bot state
const liveBots = new Map(); // wsClient -> { symbol, strategy, params, position, cash, trades, active }

// --- REST API ROUTES ---

// 1. List supported assets
app.get('/api/assets', (req, res) => {
  const assets = Object.entries(marketGen.assets).map(([symbol, data]) => ({
    symbol,
    name: data.name,
    currentPrice: marketGen.livePrices[symbol] || data.initialPrice,
    volatility: (data.volatility * 100).toFixed(1) + '%'
  }));
  res.json({ assets });
});

// 2. Fetch historical candles with technical indicators
app.get('/api/history', (req, res) => {
  const symbol = req.query.symbol || 'BTC-USD';
  const timeframe = parseInt(req.query.timeframe) || 15;
  const count = parseInt(req.query.count) || 200;

  // Refresh or fetch history
  const candles = marketGen.generateHistory(symbol, count, timeframe);
  candleCache[symbol] = candles;

  const closes = candles.map(c => c.close);
  const sma20 = Indicators.sma(closes, 20);
  const ema50 = Indicators.ema(closes, 50);
  const rsi = Indicators.rsi(closes, 14);
  const macd = Indicators.macd(closes);
  const bb = Indicators.bollingerBands(closes);
  const atr = Indicators.atr(candles);
  const vwap = Indicators.vwap(candles);

  res.json({
    symbol,
    timeframe,
    candles,
    indicators: {
      sma20,
      ema50,
      rsi,
      macd,
      bollinger: bb,
      atr,
      vwap
    }
  });
});

// 3. Run Strategy Backtest
app.post('/api/backtest', (req, res) => {
  try {
    const {
      symbol = 'BTC-USD',
      strategy = 'smaCrossover',
      params = {},
      initialCapital = 10000,
      slippagePct = 0.0005,
      commissionPct = 0.00075,
      timeframe = 15,
      count = 300,
      customCode = ''
    } = req.body;

    // Generate or use current history
    const candles = marketGen.generateHistory(symbol, count, timeframe);

    let strategyResult;
    if (strategy === 'smaCrossover') {
      strategyResult = Strategies.smaCrossover(candles, params);
    } else if (strategy === 'rsiMeanReversion') {
      strategyResult = Strategies.rsiMeanReversion(candles, params);
    } else if (strategy === 'bollingerReversion') {
      strategyResult = Strategies.bollingerReversion(candles, params);
    } else if (strategy === 'macdMomentum') {
      strategyResult = Strategies.macdMomentum(candles, params);
    } else if (strategy === 'kronosFoundationAlpha' || strategy === 'kronosAlpha') {
      strategyResult = Strategies.kronosFoundationAlpha(candles, params);
    } else if (strategy === 'custom') {
      strategyResult = Strategies.customScript(candles, customCode);
    } else {
      return res.status(400).json({ error: `Unknown strategy: ${strategy}` });
    }

    const backtestResult = Backtester.run(candles, strategyResult, {
      initialCapital,
      slippagePct,
      commissionPct
    });

    res.json({
      success: true,
      candles,
      backtest: backtestResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Fetch Order Book snapshot
app.get('/api/orderbook', (req, res) => {
  const symbol = req.query.symbol || 'BTC-USD';
  const ob = orderBooks[symbol] || orderBooks['BTC-USD'];
  res.json(ob.getState());
});

// 5. Quant 101 Educational Knowledge & Glossary
app.get('/api/glossary', (req, res) => {
  res.json({
    concepts: [
      {
        term: 'Geometric Brownian Motion (GBM)',
        domain: 'Stochastic Calculus & Asset Pricing',
        formula: 'dS_t = μ S_t dt + σ S_t dW_t',
        explanation: 'The mathematical foundation of Black-Scholes and quantitative financial modeling. Assumes percentage returns are normally distributed with constant drift (μ) and volatility (σ).'
      },
      {
        term: 'Sharpe Ratio',
        domain: 'Portfolio Management & Risk',
        formula: 'Sharpe = (R_p - R_f) / σ_p',
        explanation: 'Measures risk-adjusted excess return per unit of total risk (standard deviation). A Sharpe ratio > 1.0 is considered good; > 2.0 is very good; > 3.0 is elite institutional tier.'
      },
      {
        term: 'Sortino Ratio',
        domain: 'Downside Risk Analysis',
        formula: 'Sortino = (R_p - R_f) / σ_d',
        explanation: 'Unlike Sharpe which penalizes upside volatility, Sortino only penalizes negative volatility (downside deviation), making it ideal for asymmetrical trend-following strategies.'
      },
      {
        term: 'Maximum Drawdown (MDD)',
        domain: 'Capital Preservation',
        formula: 'MDD = (Peak - Trough) / Peak',
        explanation: 'The largest peak-to-trough drop in portfolio equity before a new peak is achieved. Key metric required by hedge funds and prop desks to evaluate downside tail-risk.'
      },
      {
        term: 'Order Book Imbalance (OBI)',
        domain: 'Market Microstructure & High-Frequency Trading',
        formula: 'OBI = (V_bid - V_ask) / (V_bid + V_ask)',
        explanation: 'Measures queue volume asymmetry at the top of the limit order book. High positive imbalance signals strong immediate buying pressure, often preceding price increments.'
      },
      {
        term: 'Slippage & Market Impact',
        domain: 'Execution Algorithms',
        formula: 'Fill Price = Price_market ± (Spread/2 + Impact)',
        explanation: 'The difference between the expected price of a trade and the price at which the trade actually executes. Critical reality check that causes theoretical backtests to fail in production.'
      }
    ]
  });
});

// 6. Telegram Bot Integration Routes
app.get('/api/telegram/status', (req, res) => {
  res.json({
    configured: !!(telegramService.botToken && telegramService.chatId),
    enabled: telegramService.enabled,
    hasToken: !!telegramService.botToken,
    chatIdMasked: telegramService.chatId ? `${telegramService.chatId.slice(0, 3)}***` : ''
  });
});

app.post('/api/telegram/config', (req, res) => {
  const { botToken, chatId, enabled } = req.body;
  const status = telegramService.configure(botToken, chatId, enabled);
  if (status.error) {
    return res.json({ success: false, error: status.error });
  }
  try {
    fs.writeFileSync(tgConfigFile, JSON.stringify({ botToken, chatId, enabled }));
  } catch (e) {}
  res.json({ success: true, ...status });
});

app.post('/api/telegram/test', async (req, res) => {
  const { botToken, chatId } = req.body;
  if (botToken && chatId) {
    const status = telegramService.configure(botToken, chatId, true);
    if (status.error) {
      return res.json({ success: false, error: status.error });
    }
    try {
      fs.writeFileSync(tgConfigFile, JSON.stringify({ botToken, chatId, enabled: true }));
    } catch (e) {}
  }

  const testMsg = `<b>⚡ ALPHAFORGE QUANT TERMINAL TEST ALERT</b>\n\n` +
    `✅ Telegram webhook integration connected successfully!\n` +
    `⏱ Timestamp: <code>${new Date().toISOString()}</code>\n` +
    `📈 Active Engine: <code>Merton Jump-Diffusion Simulation</code>\n\n` +
    `<i>You will now receive instant trade execution signals and backtest reports directly in this chat!</i>`;
  const result = await telegramService.sendMessage(testMsg);
  res.json(result);
});

app.post('/api/telegram/share-backtest', async (req, res) => {
  const { summary, strategyName = 'Dual Moving Average Crossover', symbol = 'BTC-USD' } = req.body;
  if (!summary) return res.status(400).json({ error: 'Missing summary' });
  const result = await telegramService.sendBacktestReport(summary, strategyName, symbol);
  res.json(result);
});

// 7. Live Real Market Feed & Bot Force-Trigger Endpoints
let feedMode = 'LIVE_REAL'; // 'LIVE_REAL' (Binance/Paxos Gold) or 'SIMULATED' (GBM)
liveFeedService.start();

app.get('/api/feed/status', (req, res) => {
  res.json({
    mode: feedMode,
    isLiveConnected: liveFeedService.isLive,
    livePrices: liveFeedService.latestPrices
  });
});

app.post('/api/feed/mode', (req, res) => {
  const { mode } = req.body;
  if (mode === 'LIVE_REAL' || mode === 'SIMULATED') {
    feedMode = mode;
    if (feedMode === 'LIVE_REAL') liveFeedService.start();
  }
  res.json({ success: true, mode: feedMode });
});

app.post('/api/bot/force-trigger', (req, res) => {
  const { action = 'BUY' } = req.body;
  let triggered = false;

  wss.clients.forEach((client) => {
    if (client.botState && client.botState.active) {
      const symbol = client.botState.symbol;
      const curPrice = marketGen.livePrices[symbol] || 2685.00;
      if (action === 'BUY' && client.botState.position === 0) {
        const fillPrice = curPrice * 1.0005;
        const units = Number(((client.botState.cash * 0.99) / fillPrice).toFixed(4));
        client.botState.position = units;
        client.botState.entryPrice = fillPrice;
        client.botState.cash = 0;

        const fillEvent = {
          type: 'BOT_EXECUTION',
          action: 'BUY',
          price: fillPrice,
          units,
          timestamp: Date.now(),
          reason: 'Manual Instant Signal (User Verified Execution)',
          totalEquity: Number((units * curPrice).toFixed(2))
        };
        client.botState.trades.push(fillEvent);
        client.send(JSON.stringify(fillEvent));
        telegramService.sendTradeAlert({ ...fillEvent, symbol });
        triggered = true;
      } else if (action === 'SELL' && client.botState.position > 0) {
        executeBotSell(client, curPrice, 'Manual Instant Profit Lock / Exit');
        triggered = true;
      }
    }
  });

  res.json({ success: triggered, message: triggered ? 'Order executed and Telegram alerted!' : 'Bot is not active. Click "Launch Auto Trading Bot" first.' });
});

// 8. Real-Time Financial News & Market Sentiment Route
app.get('/api/news', (req, res) => {
  const category = req.query.category || 'ALL';
  res.json({
    success: true,
    sentiment: newsService.getSentiment(),
    news: newsService.getNews(category)
  });
});

// 9. Micro-Account Real Trading ($1 - $10 Capital Guard) Routes
app.get('/api/real-trade/status', (req, res) => {
  res.json({
    success: true,
    status: realTradingService.getStatus()
  });
});

app.post('/api/real-trade/config', (req, res) => {
  const { apiKey, apiSecret, email = '', mode = 'CAPITAL_DEMO', maxCapital = 10.00, riskPct = 2.0, enabled = false } = req.body;
  const status = realTradingService.saveConfig(apiKey, apiSecret, mode, maxCapital, riskPct, enabled, email);
  res.json({ success: true, status });
});

app.post('/api/real-trade/calculate', (req, res) => {
  const { symbol = 'BTC-USD', capital = 10.00 } = req.body;
  const currentPrice = marketGen.livePrices[symbol] || 65000.00;
  const calc = realTradingService.calculatePositionSize(currentPrice, capital);
  
  // Algorithmic Signal Evaluation for AUTO direction
  const candles = marketGen.generateHistory(symbol, 50, 15);
  const closes = candles.map(c => c.close);
  const rsi = Indicators.rsi(closes, 14);
  const curRsi = rsi[rsi.length - 1] || 50;
  const emaFast = Indicators.ema(closes, 9);
  const emaSlow = Indicators.ema(closes, 21);
  const fastVal = emaFast[emaFast.length - 1] || currentPrice;
  const slowVal = emaSlow[emaSlow.length - 1] || currentPrice;

  const isBullish = curRsi <= 48 || fastVal >= slowVal;
  const recommendedSide = isBullish ? 'BUY' : 'SELL';
  const signalReason = isBullish
    ? `Bullish Momentum: EMA(9) > EMA(21) [RSI ${curRsi.toFixed(1)}]`
    : `Bearish Drift: EMA(9) < EMA(21) [RSI ${curRsi.toFixed(1)}]`;

  res.json({ success: true, symbol, currentPrice, recommendedSide, signalReason, ...calc });
});

app.post('/api/real-trade/order', async (req, res) => {
  try {
    let { symbol = 'XAU-USD', side = 'AUTO', capital = 10.00 } = req.body;
    const currentPrice = marketGen.livePrices[symbol] || (symbol === 'XAU-USD' ? 2685.00 : 65000.00);

    let signalReason = 'Manual Operator Override';
    if (!side || side === 'AUTO') {
      const candles = marketGen.generateHistory(symbol, 50, 15);
      const closes = candles.map(c => c.close);
      const rsi = Indicators.rsi(closes, 14);
      const curRsi = rsi[rsi.length - 1] || 50;
      const emaFast = Indicators.ema(closes, 9);
      const emaSlow = Indicators.ema(closes, 21);
      const isBullish = curRsi <= 48 || (emaFast[emaFast.length - 1] >= emaSlow[emaSlow.length - 1]);
      side = isBullish ? 'BUY' : 'SELL';
      signalReason = isBullish
        ? `Algorithmic Auto-Fill: BUY / LONG (EMA Momentum Bullish, RSI ${curRsi.toFixed(1)})`
        : `Algorithmic Auto-Fill: SELL / SHORT (EMA Trend Bearish, RSI ${curRsi.toFixed(1)})`;
    }

    const ticket = await realTradingService.executeTrade(symbol, side, capital, currentPrice);

    // Send instant trade alert via Telegram
    telegramService.sendTradeAlert({
      action: side,
      symbol,
      price: currentPrice,
      units: ticket.units,
      timestamp: ticket.timestamp,
      reason: `${signalReason} | Hard Stop-Loss at $${ticket.stopLossPrice}`
    });

    res.json({ success: true, ticket, executedSide: side, signalReason });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- 8. Autonomous Dual-Asset Bot (Gold & BTC) Endpoints ---
autoBotManager.addListener((event) => {
  const msg = JSON.stringify({ type: 'AUTO_BOT_EVENT', data: event });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
});

app.get('/api/auto-bot/status', (req, res) => {
  res.json({ success: true, bots: autoBotManager.getStatus() });
});

app.post('/api/auto-bot/start', (req, res) => {
  const { symbol } = req.body || {};
  if (symbol) {
    autoBotManager.startBot(symbol);
  } else {
    autoBotManager.startAll();
  }
  res.json({ success: true, bots: autoBotManager.getStatus() });
});

app.post('/api/auto-bot/stop', (req, res) => {
  const { symbol } = req.body || {};
  if (symbol) {
    autoBotManager.stopBot(symbol);
  } else {
    autoBotManager.stopAll();
  }
  res.json({ success: true, bots: autoBotManager.getStatus() });
});

app.post('/api/auto-bot/strategy', (req, res) => {
  const { symbol, strategy, params } = req.body || {};
  if (symbol && strategy) {
    autoBotManager.updateStrategy(symbol, strategy, params);
  }
  res.json({ success: true, bots: autoBotManager.getStatus() });
});

app.post('/api/auto-bot/reset', (req, res) => {
  const { symbol } = req.body || {};
  if (symbol) {
    autoBotManager.reset(symbol);
  } else {
    autoBotManager.reset('XAU-USD');
    autoBotManager.reset('BTC-USD');
  }
  res.json({ success: true, bots: autoBotManager.getStatus() });
});

app.post('/api/auto-bot/simulate-trade', async (req, res) => {
  const { symbol = 'XAU-USD', outcome = 'TAKE_PROFIT' } = req.body || {};
  try {
    const result = await autoBotManager.simulateRealTrade(symbol, outcome);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 9. Kronos Foundation Model (AAAI 2026) Forecaster Endpoints ---
app.get('/api/forecast/kronos', (req, res) => {
  const { symbol = 'BTC-USD', horizon = 12 } = req.query;
  const candles = candleCache[symbol] || marketGen.generateHistory(symbol, 60, 15);
  const forecast = kronosPredictor.predict(candles, { symbol, horizon: parseInt(horizon, 10) || 12 });
  res.json({ success: true, forecast });
});

app.post('/api/forecast/kronos', (req, res) => {
  const { symbol = 'BTC-USD', horizon = 12, candles } = req.body || {};
  const dataCandles = (candles && candles.length > 0) ? candles : (candleCache[symbol] || marketGen.generateHistory(symbol, 60, 15));
  const forecast = kronosPredictor.predict(dataCandles, { symbol, horizon: parseInt(horizon, 10) || 12 });
  res.json({ success: true, forecast });
});

// --- 10. Multi-Rail Payment Gateway (Bakong KHQR, ABA PayWay & Crypto) Routes ---
app.get('/api/payments/plans', (req, res) => {
  res.json({
    success: true,
    plans: paymentGatewayService.plans,
    config: {
      merchantName: paymentGatewayService.config.merchantName,
      bakongAccountId: paymentGatewayService.config.bakongAccountId,
      exchangeRateUsdKhr: paymentGatewayService.config.exchangeRateUsdKhr
    }
  });
});

app.post('/api/payments/create-invoice', (req, res) => {
  try {
    const { planId = 'starter_signal', customerName, customerEmail, paymentMethod = 'KHQR' } = req.body || {};
    const invoice = paymentGatewayService.createInvoice(planId, customerName, customerEmail, paymentMethod);
    res.json({ success: true, invoice });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/payments/invoice/:id', (req, res) => {
  const invoice = paymentGatewayService.getInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
  res.json({ success: true, invoice });
});

app.post('/api/payments/confirm', (req, res) => {
  const { invoiceId, paymentProof } = req.body || {};
  if (!invoiceId) return res.status(400).json({ success: false, error: 'invoiceId required' });
  const result = paymentGatewayService.confirmPayment(invoiceId, paymentProof);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, ...result });
});

app.get('/api/payments/config', (req, res) => {
  res.json({ success: true, ...paymentGatewayService.getConfig() });
});

app.post('/api/payments/config', (req, res) => {
  const updated = paymentGatewayService.updateConfig(req.body || {});
  res.json({ success: true, config: updated });
});

// Stream real-world ticks directly into terminal
liveFeedService.onTick((tick) => {
  if (feedMode !== 'LIVE_REAL') return;

  marketGen.livePrices[tick.symbol] = tick.price;
  const ob = orderBooks[tick.symbol];
  const obState = ob ? ob.update(tick.price) : null;

  const candles = candleCache[tick.symbol];
  if (candles && candles.length > 0) {
    const lastCandle = candles[candles.length - 1];
    // If incoming real live tick is unanchored (>15% discrepancy on initial connect), re-anchor smoothly
    if (Math.abs(tick.price - lastCandle.close) / (lastCandle.close || 1) > 0.15) {
      candleCache[tick.symbol] = marketGen.generateHistory(tick.symbol, candles.length, 15);
    } else {
      if (tick.price > lastCandle.high) lastCandle.high = tick.price;
      if (tick.price < lastCandle.low) lastCandle.low = tick.price;
      lastCandle.close = tick.price;
      lastCandle.volume += Math.floor(tick.volume || 1);
    }
  }

  const tickMsg = JSON.stringify({
    type: 'TICK',
    symbol: tick.symbol,
    price: tick.price,
    timestamp: tick.timestamp,
    isLiveReal: true,
    orderBook: obState
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.currentSymbol === tick.symbol) {
      client.send(tickMsg);
      if (client.botState && client.botState.active && client.botState.symbol === tick.symbol) {
        evaluateLiveBot(client, tick.price, candles);
      }
    }
  });

  // Autonomous dual-asset bots tick evaluation
  autoBotManager.onTick(tick.symbol, tick.price, candles);
});

// --- WEBSOCKET REAL-TIME TICKER & BOT ENGINE ---
wss.on('connection', (ws) => {
  ws.currentSymbol = 'BTC-USD';
  ws.botState = {
    active: false,
    symbol: 'BTC-USD',
    strategy: 'smaCrossover',
    params: { fastPeriod: 9, slowPeriod: 21 },
    cash: 10000,
    position: 0,
    entryPrice: 0,
    trades: []
  };

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'SUBSCRIBE') {
        ws.currentSymbol = data.symbol || 'BTC-USD';
        const curP = marketGen.livePrices[ws.currentSymbol] || 100;
        const ob = orderBooks[ws.currentSymbol];
        const obState = ob ? ob.update(curP) : null;
        ws.send(JSON.stringify({
          type: 'TICK',
          symbol: ws.currentSymbol,
          price: curP,
          timestamp: Date.now(),
          isLiveReal: feedMode === 'LIVE_REAL' && realExchangeSymbols.has(ws.currentSymbol),
          orderBook: obState
        }));
      } else if (data.type === 'START_BOT') {
        ws.botState.active = true;
        ws.botState.symbol = data.symbol || ws.currentSymbol;
        ws.botState.strategy = data.strategy || 'smaCrossover';
        ws.botState.params = data.params || {};
        ws.botState.stopLossPct = Number(data.stopLossPct) || 2.0;
        ws.botState.takeProfitPct = Number(data.takeProfitPct) || 5.0;
        ws.botState.aiFilterEnabled = data.aiFilterEnabled !== undefined ? !!data.aiFilterEnabled : true;
        ws.send(JSON.stringify({ type: 'BOT_STATUS', status: 'RUNNING', botState: ws.botState }));
      } else if (data.type === 'STOP_BOT') {
        ws.botState.active = false;
        ws.send(JSON.stringify({ type: 'BOT_STATUS', status: 'STOPPED', botState: ws.botState }));
      } else if (data.type === 'GET_KRONOS_FORECAST') {
        const sym = data.symbol || ws.currentSymbol || 'BTC-USD';
        const candles = candleCache[sym] || marketGen.generateHistory(sym, 60, 15);
        const forecast = kronosPredictor.predict(candles, { symbol: sym, horizon: data.horizon || 12 });
        ws.send(JSON.stringify({ type: 'KRONOS_FORECAST', data: forecast }));
      }
    } catch (e) {
      console.error('WS Parse Error:', e);
    }
  });
});

// Periodic broadcast (every 1000ms): simulate real-time ticks for non-real assets
const realExchangeSymbols = new Set(['BTC-USD', 'ETH-USD', 'SOL-USD', 'XAU-USD', 'DOGE-USD']);

setInterval(() => {
  if (wss.clients.size === 0) return;

  for (const symbol of Object.keys(marketGen.assets)) {
    // In LIVE_REAL mode, real exchange symbols are strictly streamed from the real exchange WebSocket!
    if (feedMode === 'LIVE_REAL' && realExchangeSymbols.has(symbol) && liveFeedService.isLive) {
      continue;
    }

    const newPrice = marketGen.nextPrice(symbol);
    const ob = orderBooks[symbol];
    const obState = ob.update(newPrice);

    // Update the last candle in cache or roll candle
    const candles = candleCache[symbol];
    if (candles && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      if (newPrice > lastCandle.high) lastCandle.high = newPrice;
      if (newPrice < lastCandle.low) lastCandle.low = newPrice;
      lastCandle.close = newPrice;
      lastCandle.volume += Math.floor(Math.random() * 5);
    }

    // Broadcast tick to subscribers
    const tickMsg = JSON.stringify({
      type: 'TICK',
      symbol,
      price: newPrice,
      timestamp: Date.now(),
      orderBook: obState
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.currentSymbol === symbol) {
        client.send(tickMsg);

        // If client has an active live trading bot on this symbol, run tick evaluation
        if (client.botState && client.botState.active && client.botState.symbol === symbol) {
          evaluateLiveBot(client, newPrice, candles);
        }
      }
    });

    // Autonomous background bots tick evaluation
    autoBotManager.onTick(symbol, newPrice, candles);
  }
}, 1000);

function evaluateLiveBot(client, currentPrice, candles) {
  if (!candles || candles.length < 30) return;
  const bot = client.botState;
  const closes = candles.map(c => c.close);

  // 1. Calculate Live Unrealized PnL & Position Metrics
  let unrealizedPnL = 0;
  let pnlPct = 0;
  let stopLossPrice = 0;
  let takeProfitPrice = 0;

  if (bot.position > 0 && bot.entryPrice > 0) {
    unrealizedPnL = (currentPrice - bot.entryPrice) * bot.position;
    pnlPct = ((currentPrice - bot.entryPrice) / bot.entryPrice) * 100;
    stopLossPrice = bot.entryPrice * (1 - (bot.stopLossPct || 2.0) / 100);
    takeProfitPrice = bot.entryPrice * (1 + (bot.takeProfitPct || 5.0) / 100);
  }

  // 2. Classify Current Market Regime with AI
  const regimeInfo = RegimeFilter.analyze(candles, bot.strategy, 'BUY');

  // Broadcast Live Bot Tick HUD to client
  client.send(JSON.stringify({
    type: 'BOT_TICK_STATUS',
    symbol: bot.symbol,
    position: bot.position,
    entryPrice: Number(bot.entryPrice.toFixed(2)),
    currentPrice: Number(currentPrice.toFixed(2)),
    cash: Number(bot.cash.toFixed(2)),
    unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
    pnlPct: Number(pnlPct.toFixed(2)),
    stopLossPrice: Number(stopLossPrice.toFixed(2)),
    takeProfitPrice: Number(takeProfitPrice.toFixed(2)),
    marketRegime: regimeInfo.regime,
    aiConfidence: regimeInfo.confidence
  }));

  // 3. Emergency Guard 1: Hard Stop-Loss Trigger
  if (bot.position > 0 && pnlPct <= -(bot.stopLossPct || 2.0)) {
    executeBotSell(client, currentPrice, `🚨 HARD STOP-LOSS HIT (-${Math.abs(pnlPct).toFixed(2)}%) - Capital Protected`);
    return;
  }

  // 4. Emergency Guard 2: Take-Profit Target Trigger
  if (bot.position > 0 && pnlPct >= (bot.takeProfitPct || 5.0)) {
    executeBotSell(client, currentPrice, `🎯 TAKE-PROFIT TARGET HIT (+${pnlPct.toFixed(2)}%) - Profit Secured`);
    return;
  }

  // 5. Strategy Signal Evaluation
  let signalAction = 'HOLD';
  let reason = '';

  if (bot.strategy === 'smaCrossover') {
    const fastP = Number(bot.params.fastPeriod) || 9;
    const slowP = Number(bot.params.slowPeriod) || 21;
    const fastMA = Indicators.ema(closes, fastP);
    const slowMA = Indicators.ema(closes, slowP);
    const i = closes.length - 1;

    if (fastMA[i - 1] <= slowMA[i - 1] && fastMA[i] > slowMA[i]) {
      signalAction = 'BUY';
      reason = `Live EMA(${fastP}) crossed ABOVE EMA(${slowP})`;
    } else if (fastMA[i - 1] >= slowMA[i - 1] && fastMA[i] < slowMA[i]) {
      signalAction = 'SELL';
      reason = `Live EMA(${fastP}) crossed BELOW EMA(${slowP})`;
    }
  } else if (bot.strategy === 'rsiMeanReversion') {
    const rsi = Indicators.rsi(closes, 14);
    const i = closes.length - 1;
    if (rsi[i - 1] < 30 && rsi[i] >= 30) {
      signalAction = 'BUY';
      reason = 'Live RSI recovered above 30 (Oversold bounce)';
    } else if (rsi[i - 1] > 70 && rsi[i] <= 70) {
      signalAction = 'SELL';
      reason = 'Live RSI dropped below 70 (Overbought exhaustion)';
    }
  } else if (bot.strategy === 'bollingerReversion') {
    const bb = Indicators.bollingerBands(closes, 20, 2);
    const i = closes.length - 1;
    if (bb.lower[i] && closes[i - 1] <= bb.lower[i - 1] && closes[i] > bb.lower[i]) {
      signalAction = 'BUY';
      reason = 'Live Lower Bollinger Band bounce';
    } else if (bb.upper[i] && closes[i - 1] >= bb.upper[i - 1] && closes[i] < bb.upper[i]) {
      signalAction = 'SELL';
      reason = 'Live Upper Bollinger Band rejection';
    }
  }

  // 6. AI Regime Filter Validation for BUY signals
  if (signalAction === 'BUY' && bot.aiFilterEnabled) {
    if (!regimeInfo.shouldExecute) {
      client.send(JSON.stringify({
        type: 'BOT_AI_LOG',
        message: regimeInfo.reason,
        regime: regimeInfo.regime,
        confidence: regimeInfo.confidence,
        timestamp: Date.now()
      }));
      return; // Block false breakout!
    }
  }

  // 7. Execute Orders
  if (signalAction === 'BUY' && bot.position === 0 && bot.cash > 100) {
    const slippage = currentPrice * 0.0005;
    const fillPrice = currentPrice + slippage;
    const units = (bot.cash * 0.99) / fillPrice;
    bot.position = Number(units.toFixed(4));
    bot.entryPrice = fillPrice;
    bot.cash = 0;

    const fillEvent = {
      type: 'BOT_EXECUTION',
      action: 'BUY',
      price: fillPrice,
      units: bot.position,
      timestamp: Date.now(),
      reason: reason + ` [AI Confidence: ${regimeInfo.confidence}%]`,
      totalEquity: Number((bot.position * currentPrice).toFixed(2))
    };
    bot.trades.push(fillEvent);
    client.send(JSON.stringify(fillEvent));
    telegramService.sendTradeAlert({ ...fillEvent, symbol: bot.symbol });
  } else if (signalAction === 'SELL' && bot.position > 0) {
    executeBotSell(client, currentPrice, reason);
  }
}

function executeBotSell(client, currentPrice, reason) {
  const bot = client.botState;
  const slippage = currentPrice * 0.0005;
  const fillPrice = currentPrice - slippage;
  const proceeds = bot.position * fillPrice;
  const pnl = proceeds - (bot.position * bot.entryPrice);
  bot.cash = proceeds;
  
  const fillEvent = {
    type: 'BOT_EXECUTION',
    action: 'SELL',
    price: fillPrice,
    units: bot.position,
    pnl: Number(pnl.toFixed(2)),
    timestamp: Date.now(),
    reason,
    totalEquity: Number(bot.cash.toFixed(2))
  };
  bot.position = 0;
  bot.entryPrice = 0;
  bot.trades.push(fillEvent);
  client.send(JSON.stringify(fillEvent));
  telegramService.sendTradeAlert({ ...fillEvent, symbol: bot.symbol });
}

server.listen(PORT, () => {
  console.log(`⚡ AlphaForge Quant Terminal running on http://localhost:${PORT}`);
  console.log(`📊 WebSocket market feed streaming on ws://localhost:${PORT}/ws`);
});
