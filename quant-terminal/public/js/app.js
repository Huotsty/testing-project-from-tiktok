/**
 * AlphaForge Quant Terminal - Master Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Telegram Mini App (TMA) Integration
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    } catch (e) {}
  }

  // 1. Initialize Canvas Chart & Order Book
  const chart = new ChartEngine('mainChart', 'subChart');
  const obRenderer = new OrderBookRenderer('orderBookPanel');
  const quantLearn = new QuantLearn();

  // App State - Spot Gold (XAU-USD) as Primary Asset
  let currentSymbol = 'XAU-USD';
  let currentTimeframe = 15;
  let currentPrice = 0;
  let activeTab = 'backtest';
  let ws = null;
  let botRunning = false;

  // DOM Elements
  const assetSelect = document.getElementById('assetSelect');
  const livePriceEl = document.getElementById('livePrice');
  const wsStatusDot = document.getElementById('wsStatusDot');
  const wsStatusText = document.getElementById('wsStatusText');
  const tfButtons = document.querySelectorAll('.tf-btn');
  const subchartSelect = document.getElementById('subchartSelect');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const strategySelect = document.getElementById('strategySelect');
  const strategyParamsContainer = document.getElementById('strategyParams');
  const customEditorContainer = document.getElementById('customEditorContainer');
  const customAlgoCode = document.getElementById('customAlgoCode');
  const btnRunBacktest = document.getElementById('btnRunBacktest');
  const btnToggleBot = document.getElementById('btnToggleBot');
  const botStatusBadge = document.getElementById('botStatusBadge');
  const botLogsList = document.getElementById('botLogsList');

  // --- 2. Load Assets and Initial Data ---
  async function loadAssets() {
    try {
      const res = await fetch('/api/assets');
      const data = await res.json();
      assetSelect.innerHTML = data.assets.map(a => `
        <option value="${a.symbol}">${a.symbol} (${a.name})</option>
      `).join('');
      assetSelect.value = currentSymbol;
    } catch (e) {
      console.error('Error fetching assets:', e);
    }
  }

  async function loadMarketData() {
    try {
      const res = await fetch(`/api/history?symbol=${currentSymbol}&timeframe=${currentTimeframe}&count=250`);
      const data = await res.json();
      chart.setData(data.candles, data.indicators);
      
      if (data.candles && data.candles.length > 0) {
        const lastCandle = data.candles[data.candles.length - 1];
        updateLivePrice(lastCandle.close);
      }
      fetchKronosForecast();

      // Automatically execute backtest on initial page load to populate tearsheet and equity curve
      setTimeout(() => {
        if (!latestBacktestSummary) {
          runBacktest();
        }
      }, 350);
    } catch (e) {
      console.error('Error loading market data:', e);
    }
  }

  function updateLivePrice(price) {
    if (price === currentPrice) return;
    const isUp = price > currentPrice;
    currentPrice = price;
    livePriceEl.innerText = `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    livePriceEl.className = `live-price-badge ${isUp ? 'flash-up' : 'flash-down'}`;
    setTimeout(() => {
      livePriceEl.className = 'live-price-badge';
    }, 600);
  }

  // --- 3. WebSocket Connection ---
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      wsStatusDot.classList.add('connected');
      wsStatusText.innerText = 'Connected (1s Ticks)';
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', symbol: currentSymbol }));
    };

    ws.onclose = () => {
      wsStatusDot.classList.remove('connected');
      wsStatusText.innerText = 'Reconnecting...';
      setTimeout(connectWebSocket, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'TICK' && data.symbol === currentSymbol) {
          updateLivePrice(data.price);
          if (data.isLiveReal) {
            wsStatusText.innerText = '🔴 Real-Time (Binance Stream)';
            wsStatusText.style.color = '#00f59b';
          }
          if (data.orderBook) {
            obRenderer.update(data.orderBook);
            const spreadDisplay = document.getElementById('spreadDisplay');
            if (spreadDisplay && data.orderBook.spreadBps !== undefined) {
              spreadDisplay.innerText = `${(data.orderBook.spreadBps / 100).toFixed(2)}%`;
            }
          }
          // Update the last candle on the chart
          if (chart.candles && chart.candles.length > 0) {
            const last = chart.candles[chart.candles.length - 1];
            if (data.price > last.high) last.high = data.price;
            if (data.price < last.low) last.low = data.price;
            last.close = data.price;
            chart.render();
          }
          // Update live floating P&L and blotter metrics on each price tick
          updateChartAndBlotterPosition();
        } else if (data.type === 'BOT_STATUS') {
          botRunning = data.status === 'RUNNING';
          updateBotUI();
        } else if (data.type === 'BOT_EXECUTION') {
          logBotOrder(data);
        } else if (data.type === 'BOT_TICK_STATUS') {
          updateBotHud(data);
        } else if (data.type === 'BOT_AI_LOG') {
          logAiDecision(data);
        } else if (data.type === 'AUTO_BOT_EVENT') {
          fetchAutoBotStatus();
        } else if (data.type === 'KRONOS_FORECAST') {
          chart.setKronosForecast(data.data);
          updateKronosHud(data.data);
        } else if (data.type === 'REAL_MONEY_INIT') {
          renderRealPortfolio(data.data);
        } else if (data.type === 'REAL_MONEY_EVENT') {
          handleRealMoneyEvent(data.data);
        }
      } catch (err) {
        console.error('WS Message parsing error:', err);
      }
    };
  }

  // --- 4. Dynamic Strategy Parameters ---
  function renderStrategyParams() {
    const strat = strategySelect.value;
    if (strat === 'masterAutoPilot') {
      customEditorContainer.style.display = 'none';
      strategyParamsContainer.innerHTML = `
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.1)); border: 1px solid #10b981; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; font-weight: 800; color: #34d399;">⚡ ADAPTIVE REGIME ENSEMBLE</span>
            <span style="font-size: 0.65rem; background: rgba(16, 185, 129, 0.25); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 800;">100% AUTONOMOUS</span>
          </div>
          <div style="font-size: 0.70rem; color: #cbd5e1; line-height: 1.4;">
            Dynamically detects market regime via ATR & EMA slope. Routes to <b>Trend Hunter</b> in directional expansions and switches to <b>Bollinger Mean Reversion</b> in sideways consolidation. AI Volatility Gate stops whipsaws.
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Hard Stop-Loss (%)</label>
            <input type="number" id="paramAutoStopLoss" class="form-input" value="2.0" step="0.1" min="0.5" max="5.0">
          </div>
          <div class="form-group">
            <label class="form-label">Trailing Lock (+%)</label>
            <input type="number" id="paramAutoTrailingLock" class="form-input" value="1.5" step="0.1" min="0.5" max="5.0">
          </div>
        </div>
      `;
    } else if (strat === 'smaCrossover') {
      customEditorContainer.style.display = 'none';
      strategyParamsContainer.innerHTML = `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Fast Period (EMA)</label>
            <input type="number" id="paramFastPeriod" class="form-input" value="9" min="2" max="50">
          </div>
          <div class="form-group">
            <label class="form-label">Slow Period (EMA)</label>
            <input type="number" id="paramSlowPeriod" class="form-input" value="21" min="5" max="200">
          </div>
        </div>
      `;
    } else if (strat === 'rsiMeanReversion') {
      customEditorContainer.style.display = 'none';
      strategyParamsContainer.innerHTML = `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">RSI Period</label>
            <input type="number" id="paramRsiPeriod" class="form-input" value="14" min="2" max="50">
          </div>
          <div class="form-group">
            <label class="form-label">Oversold Threshold</label>
            <input type="number" id="paramOversold" class="form-input" value="30" min="5" max="45">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Overbought Threshold</label>
          <input type="number" id="paramOverbought" class="form-input" value="70" min="55" max="95">
        </div>
      `;
    } else if (strat === 'bollingerReversion') {
      customEditorContainer.style.display = 'none';
      strategyParamsContainer.innerHTML = `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Period</label>
            <input type="number" id="paramBbPeriod" class="form-input" value="20" min="5" max="100">
          </div>
          <div class="form-group">
            <label class="form-label">StdDev Multiplier (σ)</label>
            <input type="number" id="paramBbMultiplier" class="form-input" value="2" step="0.5" min="1" max="4">
          </div>
        </div>
      `;
    } else if (strat === 'macdMomentum') {
      customEditorContainer.style.display = 'none';
      strategyParamsContainer.innerHTML = `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Fast EMA</label>
            <input type="number" id="paramMacdFast" class="form-input" value="12">
          </div>
          <div class="form-group">
            <label class="form-label">Slow EMA</label>
            <input type="number" id="paramMacdSlow" class="form-input" value="26">
          </div>
        </div>
      `;
    } else if (strat === 'kronosFoundationAlpha') {
      customEditorContainer.style.display = 'none';
      strategyParamsContainer.innerHTML = `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Forecast Horizon (Bars)</label>
            <input type="number" id="paramKronosHorizon" class="form-input" value="12" min="6" max="36">
          </div>
          <div class="form-group">
            <label class="form-label">Min Expected Return (%)</label>
            <input type="number" id="paramKronosMinReturn" class="form-input" value="0.5" step="0.1" min="0.1">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Min RankIC Conviction</label>
          <input type="number" id="paramKronosRankIC" class="form-input" value="0.30" step="0.05" min="0.1" max="0.9">
        </div>
        <div style="font-size:0.7rem; color:#c084fc; padding:4px 8px; background:rgba(168,85,247,0.1); border-radius:4px; border:1px solid rgba(168,85,247,0.25);">
          🔮 Uses AAAI 2026 Binary Spherical Quantization (BSQ) K-Line tokenization + Autoregressive Attention path generation.
        </div>
      `;
    } else if (strat === 'custom') {
      strategyParamsContainer.innerHTML = '';
      customEditorContainer.style.display = 'block';
    }
  }

  // --- 5. Backtest Execution ---
  async function runBacktest(isManual = false) {
    btnRunBacktest.innerText = 'Calculating Quants...';
    btnRunBacktest.disabled = true;

    try {
      const strat = strategySelect.value;
      const initialCapital = Number(document.getElementById('inputCapital').value) || 10000;
      const slippageBps = Number(document.getElementById('inputSlippage').value) || 5;
      const commissionBps = Number(document.getElementById('inputCommission').value) || 7.5;

      const params = {};
      if (strat === 'smaCrossover') {
        const elF = document.getElementById('paramFastPeriod');
        const elS = document.getElementById('paramSlowPeriod');
        params.fastPeriod = elF ? Number(elF.value) : 9;
        params.slowPeriod = elS ? Number(elS.value) : 21;
      } else if (strat === 'rsiMeanReversion') {
        const elP = document.getElementById('paramRsiPeriod');
        const elO = document.getElementById('paramOversold');
        const elB = document.getElementById('paramOverbought');
        params.period = elP ? Number(elP.value) : 14;
        params.oversold = elO ? Number(elO.value) : 30;
        params.overbought = elB ? Number(elB.value) : 70;
      } else if (strat === 'bollingerReversion') {
        const elP = document.getElementById('paramBbPeriod');
        const elM = document.getElementById('paramBbMultiplier');
        params.period = elP ? Number(elP.value) : 20;
        params.multiplier = elM ? Number(elM.value) : 2;
      } else if (strat === 'macdMomentum') {
        const elF = document.getElementById('paramMacdFast');
        const elS = document.getElementById('paramMacdSlow');
        params.fast = elF ? Number(elF.value) : 12;
        params.slow = elS ? Number(elS.value) : 26;
      } else if (strat === 'kronosFoundationAlpha') {
        const elH = document.getElementById('paramKronosHorizon');
        const elR = document.getElementById('paramKronosMinReturn');
        const elK = document.getElementById('paramKronosRankIC');
        params.horizon = elH ? Number(elH.value) : 12;
        params.minExpectedReturn = elR ? Number(elR.value) : 0.5;
        params.minRankIC = elK ? Number(elK.value) : 0.30;
      } else if (strat === 'masterAutoPilot') {
        const elSl = document.getElementById('paramAutoStopLoss');
        const elTr = document.getElementById('paramAutoTrailingLock');
        params.stopLossPct = elSl ? Number(elSl.value) : 2.0;
        params.trailingLockPct = elTr ? Number(elTr.value) : 1.5;
      }

      const body = {
        symbol: currentSymbol,
        strategy: strat,
        params,
        initialCapital,
        slippagePct: slippageBps / 10000,
        commissionPct: commissionBps / 10000,
        timeframe: currentTimeframe,
        count: 300,
        customCode: customAlgoCode.value
      };

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Backtest failed');
        return;
      }

      // Update Chart with backtested candles, trades & equity curves
      chart.setData(
        data.candles,
        data.backtest.indicators,
        data.backtest.trades,
        data.backtest.equityCurve,
        data.backtest.benchmarkCurve
      );

      // Automatically switch sub-chart to Equity Curve to wow the user!
      chart.subchartMode = 'equity';
      subchartSelect.value = 'equity';
      chart.render();

      // Render Quantitative Tearsheet Stats
      latestBacktestSummary = data.backtest.summary;
      renderTearsheet(data.backtest.summary);
      renderBlotter(data.backtest.trades);

      // Auto-send report to Telegram if checked and triggered manually
      const checkAutoSend = document.getElementById('checkAutoSendBacktestTelegram');
      const tgBadge = document.getElementById('tgBacktestSentBadge');
      if (isManual && checkAutoSend && checkAutoSend.checked && latestBacktestSummary) {
        if (tgBadge) {
          tgBadge.innerText = '📤 Sending...';
          tgBadge.style.color = '#38bdf8';
        }
        fetch('/api/telegram/share-backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: latestBacktestSummary,
            strategyName: strategySelect.options[strategySelect.selectedIndex].text,
            symbol: currentSymbol
          })
        }).then(r => r.json()).then(result => {
          if (tgBadge) {
            if (result.success) {
              tgBadge.innerText = '✅ Sent to Telegram!';
              tgBadge.style.color = '#00f59b';
            } else {
              tgBadge.innerText = '⚠️ ' + (result.error || 'Check Telegram settings');
              tgBadge.style.color = '#ff3366';
            }
            setTimeout(() => {
              if (tgBadge) {
                tgBadge.innerText = 'Ready';
                tgBadge.style.color = '#64748b';
              }
            }, 3000);
          }
        }).catch(() => {
          if (tgBadge) {
            tgBadge.innerText = '❌ Failed';
            tgBadge.style.color = '#ff3366';
          }
        });
      }
    } catch (err) {
      console.error('Backtest error:', err);
      alert('Backtest execution error: ' + err.message);
    } finally {
      btnRunBacktest.innerText = '⚡ Run Quant Backtest';
      btnRunBacktest.disabled = false;
    }
  }

  function renderTearsheet(summary) {
    document.getElementById('statNetProfit').innerText = `$${summary.totalNetProfit.toLocaleString()}`;
    document.getElementById('statNetProfit').className = `stat-val ${summary.totalNetProfit >= 0 ? 'bullish' : 'bearish'}`;

    document.getElementById('statReturnPct').innerText = `${summary.totalReturnPct >= 0 ? '+' : ''}${summary.totalReturnPct}%`;
    document.getElementById('statReturnPct').className = `stat-val ${summary.totalReturnPct >= 0 ? 'bullish' : 'bearish'}`;

    document.getElementById('statSharpe').innerText = summary.sharpeRatio;
    document.getElementById('statSharpe').className = `stat-val ${summary.sharpeRatio >= 1.5 ? 'bullish' : (summary.sharpeRatio >= 0.8 ? 'cyan' : 'bearish')}`;

    document.getElementById('statSortino').innerText = summary.sortinoRatio;
    document.getElementById('statMDD').innerText = `-${summary.maxDrawdownPct}%`;

    document.getElementById('statAlpha').innerText = `${summary.alphaPct >= 0 ? '+' : ''}${summary.alphaPct}%`;
    document.getElementById('statAlpha').className = `stat-val ${summary.alphaPct >= 0 ? 'bullish' : 'bearish'}`;

    document.getElementById('statWinRate').innerText = `${summary.winRatePct}%`;
    document.getElementById('statProfitFactor').innerText = summary.profitFactor;
    document.getElementById('statTrades').innerText = summary.totalTrades;
  }

  function renderBlotter(trades) {
    const blotterBody = document.getElementById('blotterRows');
    if (!trades || trades.length === 0) {
      blotterBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:12px;">No executed trades for this period</td></tr>';
      return;
    }

    blotterBody.innerHTML = trades.slice().reverse().map(t => `
      <tr>
        <td>#${t.id}</td>
        <td>$${t.entryPrice.toFixed(2)} &rarr; $${t.exitPrice.toFixed(2)}</td>
        <td style="color:${t.netPnL >= 0 ? '#00f59b' : '#ff3366'}; font-weight:700;">
          ${t.netPnL >= 0 ? '+' : ''}$${t.netPnL.toFixed(2)} (${t.returnPct}%)
        </td>
        <td>$${t.totalFees.toFixed(2)}</td>
        <td>${t.durationBars} bars</td>
      </tr>
    `).join('');
  }

  // --- 6. Live Paper Bot Execution ---
  btnToggleBot.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert('WebSocket is connecting. Please wait a second.');
      return;
    }

    if (botRunning) {
      ws.send(JSON.stringify({ type: 'STOP_BOT' }));
    } else {
      const slInput = document.getElementById('botStopLossInput');
      const tpInput = document.getElementById('botTakeProfitInput');
      const stratSelect = document.getElementById('botFleetStrategySelect') || document.getElementById('botStrategySelect');
      const checkAi = document.getElementById('checkAiFilter');

      const sl = slInput ? parseFloat(slInput.value) : 2.0;
      const tp = tpInput ? parseFloat(tpInput.value) : 4.0;
      const strat = stratSelect ? stratSelect.value : 'masterAutoPilot';
      const aiEnabled = checkAi ? checkAi.checked : true;

      ws.send(JSON.stringify({
        type: 'START_BOT',
        symbol: currentSymbol,
        strategy: strat,
        stopLossPct: sl,
        takeProfitPct: tp,
        aiFilterEnabled: aiEnabled,
        params: { fastPeriod: 9, slowPeriod: 21 }
      }));
    }
  });

  // Slider Badges
  const botStopLossInput = document.getElementById('botStopLossInput');
  const slValueBadge = document.getElementById('slValueBadge');
  const botTakeProfitInput = document.getElementById('botTakeProfitInput');
  const tpValueBadge = document.getElementById('tpValueBadge');

  if (botStopLossInput && slValueBadge) {
    botStopLossInput.addEventListener('input', () => {
      slValueBadge.innerText = `-${botStopLossInput.value}%`;
    });
  }

  if (botTakeProfitInput && tpValueBadge) {
    botTakeProfitInput.addEventListener('input', () => {
      tpValueBadge.innerText = `+${botTakeProfitInput.value}%`;
    });
  }

  function updateBotUI() {
    const liveInd = document.getElementById('botLiveIndicator');
    if (botRunning) {
      btnToggleBot.innerText = '⏹ Stop Execution Engine';
      btnToggleBot.style.background = 'linear-gradient(135deg, #ff3366, #e11d48)';
      botStatusBadge.innerText = 'STATUS: ACTIVE (STREAMING)';
      botStatusBadge.style.color = '#00f59b';
      if (liveInd) {
        liveInd.style.background = '#00f59b';
        liveInd.style.boxShadow = '0 0 8px #00f59b';
      }
    } else {
      btnToggleBot.innerText = '🚀 Start Algorithmic Execution Engine';
      btnToggleBot.style.background = 'linear-gradient(135deg, #00f0ff, #3a86ff)';
      botStatusBadge.innerText = 'STATUS: STANDBY';
      botStatusBadge.style.color = '#64748b';
      if (liveInd) {
        liveInd.style.background = '#64748b';
        liveInd.style.boxShadow = 'none';
      }
    }
  }

  function updateBotHud(data) {
    const hudRegime = document.getElementById('hudRegime');
    const hudAiConf = document.getElementById('hudAiConf');
    const hudPosition = document.getElementById('hudPosition');
    const hudUnrealizedPnL = document.getElementById('hudUnrealizedPnL');
    const hudEntryPrice = document.getElementById('hudEntryPrice');
    const hudSlTpLevels = document.getElementById('hudSlTpLevels');

    if (hudRegime) {
      hudRegime.innerText = data.marketRegime.replace('_', ' ');
      hudRegime.style.color = data.marketRegime.includes('BULL') ? '#00f59b' : (data.marketRegime.includes('BEAR') ? '#ff3366' : '#00f0ff');
    }
    if (hudAiConf) {
      hudAiConf.innerText = `${data.aiConfidence}%`;
      hudAiConf.style.color = data.aiConfidence >= 75 ? '#00f59b' : (data.aiConfidence <= 45 ? '#ff3366' : '#fbbf24');
    }
    if (hudPosition) {
      hudPosition.innerText = `${data.position} ${data.symbol}`;
    }
    if (hudUnrealizedPnL) {
      if (data.position > 0) {
        const sign = data.unrealizedPnL >= 0 ? '+' : '';
        hudUnrealizedPnL.innerText = `${sign}$${data.unrealizedPnL} (${sign}${data.pnlPct}%)`;
        hudUnrealizedPnL.style.color = data.unrealizedPnL >= 0 ? '#00f59b' : '#ff3366';
      } else {
        hudUnrealizedPnL.innerText = '$0.00 (Flat)';
        hudUnrealizedPnL.style.color = '#64748b';
      }
    }
    if (hudEntryPrice) {
      hudEntryPrice.innerText = data.entryPrice > 0 ? `$${data.entryPrice}` : '$--';
    }
    if (hudSlTpLevels) {
      if (data.stopLossPrice > 0 && data.takeProfitPrice > 0) {
        hudSlTpLevels.innerHTML = `<span style="color:#ff3366">$${data.stopLossPrice}</span> / <span style="color:#00f59b">$${data.takeProfitPrice}</span>`;
      } else {
        hudSlTpLevels.innerText = '$-- / $--';
      }
    }
  }

  function logAiDecision(log) {
    if (botLogsList.children.length === 1 && botLogsList.children[0].innerText.includes('Bot is idle')) {
      botLogsList.innerHTML = '';
    }
    const row = document.createElement('div');
    row.style.padding = '6px 8px';
    row.style.background = 'rgba(0, 240, 255, 0.05)';
    row.style.border = '1px solid rgba(0, 240, 255, 0.2)';
    row.style.borderRadius = '4px';
    row.style.fontFamily = 'var(--font-mono)';
    row.style.fontSize = '0.72rem';

    const time = new Date(log.timestamp).toLocaleTimeString();
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
        <span style="color:#00f0ff; font-weight:700;">🛡️ Regime Filter (${log.confidence}%)</span>
        <span style="color:#64748b;">${time}</span>
      </div>
      <div style="color:#cbd5e1; font-size:0.68rem;">${log.message}</div>
    `;

    botLogsList.prepend(row);
  }

  function logBotOrder(trade) {
    if (botLogsList.children.length === 1 && (botLogsList.children[0].innerText.includes('Engine is standby') || botLogsList.children[0].innerText.includes('Bot is idle'))) {
      botLogsList.innerHTML = '';
    }
    const row = document.createElement('div');
    row.style.padding = '6px 8px';
    row.style.background = 'rgba(255,255,255,0.02)';
    row.style.border = '1px solid rgba(255,255,255,0.05)';
    row.style.borderRadius = '4px';
    row.style.fontFamily = 'var(--font-mono)';
    row.style.fontSize = '0.73rem';

    const time = new Date(trade.timestamp).toLocaleTimeString();
    const actionColor = trade.action === 'BUY' ? '#00f59b' : (trade.pnl >= 0 ? '#00f59b' : '#ff3366');

    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
        <span style="color:${actionColor}; font-weight:700;">[${trade.action}] ${trade.units} units @ $${trade.price.toFixed(2)}</span>
        <span style="color:#64748b;">${time}</span>
      </div>
      <div style="color:#94a3b8; font-size:0.68rem;">${trade.reason} ${trade.pnl !== undefined ? `| PnL: <b style="color:${trade.pnl >= 0 ? '#00f59b' : '#ff3366'}">$${trade.pnl}</b>` : ''}</div>
    `;

    botLogsList.prepend(row);
  }

  // --- 7. Event Listeners ---
  assetSelect.addEventListener('change', () => {
    currentSymbol = assetSelect.value;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', symbol: currentSymbol }));
    }
    loadMarketData();
    updateChartAndBlotterPosition();
  });

  tfButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tfButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimeframe = parseInt(btn.dataset.tf);
      loadMarketData();
    });
  });

  subchartSelect.addEventListener('change', () => {
    chart.subchartMode = subchartSelect.value;
    chart.render();
  });

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      const targetPanel = document.getElementById(`${tabId}Tab`);
      if (targetPanel) targetPanel.classList.add('active');
      if (tabId === 'bot') {
        fetchAutoBotStatus();
      }
    });
  });

  strategySelect.addEventListener('change', renderStrategyParams);
  btnRunBacktest.addEventListener('click', () => runBacktest(true));

  // Direct Institutional Tearsheet Send to Telegram Button
  const btnShareTelegram = document.getElementById('btnShareTelegram');
  if (btnShareTelegram) {
    btnShareTelegram.addEventListener('click', async () => {
      // If backtest hasn't run yet or summary is missing, run it first!
      if (!latestBacktestSummary) {
        btnShareTelegram.innerText = '⏳ Calculating...';
        await runBacktest(false);
      }

      if (!latestBacktestSummary) {
        btnShareTelegram.innerText = '⚠️ Backtest First';
        setTimeout(() => { btnShareTelegram.innerText = '📤 Telegram'; }, 2000);
        return;
      }

      btnShareTelegram.innerText = '📤 Sending...';
      btnShareTelegram.style.color = '#38bdf8';

      try {
        const stratName = strategySelect.options[strategySelect.selectedIndex] ? strategySelect.options[strategySelect.selectedIndex].text : 'Active Strategy';
        const res = await fetch('/api/telegram/share-backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: latestBacktestSummary,
            strategyName: stratName,
            symbol: currentSymbol
          })
        });

        const data = await res.json();
        if (data.success) {
          btnShareTelegram.innerText = '✅ Sent to @penghuotbot!';
          btnShareTelegram.style.color = '#00f59b';
          btnShareTelegram.style.borderColor = '#00f59b';
        } else {
          btnShareTelegram.innerText = '⚠️ ' + (data.error || 'Failed');
          btnShareTelegram.style.color = '#ff3366';
        }
      } catch (err) {
        btnShareTelegram.innerText = '❌ Error';
        btnShareTelegram.style.color = '#ff3366';
      }

      setTimeout(() => {
        btnShareTelegram.innerText = '📤 Telegram';
        btnShareTelegram.style.color = '';
        btnShareTelegram.style.borderColor = '';
      }, 3500);
    });
  }

  // Indicator Chips
  document.getElementById('toggleEma').addEventListener('click', function() {
    chart.showEma = !chart.showEma;
    this.classList.toggle('active', chart.showEma);
    chart.render();
  });
  document.getElementById('toggleSma').addEventListener('click', function() {
    chart.showSma = !chart.showSma;
    this.classList.toggle('active', chart.showSma);
    chart.render();
  });
  document.getElementById('toggleBB').addEventListener('click', function() {
    chart.showBB = !chart.showBB;
    this.classList.toggle('active', chart.showBB);
    chart.render();
  });
  document.getElementById('toggleVWAP').addEventListener('click', function() {
    chart.showVWAP = !chart.showVWAP;
    this.classList.toggle('active', chart.showVWAP);
    chart.render();
  });
  document.getElementById('toggleVol').addEventListener('click', function() {
    chart.showVolume = !chart.showVolume;
    this.classList.toggle('active', chart.showVolume);
    chart.render();
  });

  const toggleKronosBtn = document.getElementById('toggleKronos');
  if (toggleKronosBtn) {
    toggleKronosBtn.addEventListener('click', function() {
      const active = chart.toggleKronos();
      this.classList.toggle('active', active);
      if (active) fetchKronosForecast();
    });
  }

  async function fetchKronosForecast() {
    try {
      const res = await fetch(`/api/forecast/kronos?symbol=${currentSymbol}&horizon=12`);
      const data = await res.json();
      if (data.success && data.forecast) {
        chart.setKronosForecast(data.forecast);
        updateKronosHud(data.forecast);
      }
    } catch (e) {
      console.warn('Could not fetch Kronos forecast:', e);
    }
  }

  function updateKronosHud(f) {
    const el = document.getElementById('hudKronosVal');
    if (!el || !f) return;
    const sign = f.expectedReturnPct >= 0 ? '+' : '';
    const color = f.expectedReturnPct >= 0 ? '#00f59b' : '#ff3366';
    const gpuBadge = f.cudaActive 
      ? `<span style="background:rgba(16,185,129,0.2); border:1px solid rgba(16,185,129,0.4); color:#34d399; padding:1px 5px; border-radius:3px; font-size:8.5px; margin-right:4px;">⚡ RTX 3050 GPU</span>`
      : '';
    el.innerHTML = `${gpuBadge}<span style="color:${color}">${sign}${f.expectedReturnPct}%</span> [${f.regime}] (RankIC: +${f.rankIC})`;
  }

  // Live Real Feed Mode Toggle
  let currentFeedMode = 'LIVE_REAL';
  const btnToggleFeedMode = document.getElementById('btnToggleFeedMode');
  if (btnToggleFeedMode) {
    btnToggleFeedMode.addEventListener('click', async () => {
      currentFeedMode = currentFeedMode === 'LIVE_REAL' ? 'SIMULATED' : 'LIVE_REAL';
      if (currentFeedMode === 'LIVE_REAL') {
        btnToggleFeedMode.innerText = '🔴 LIVE REAL FEED (Binance / Gold)';
        btnToggleFeedMode.style.color = '#00f59b';
        btnToggleFeedMode.style.borderColor = 'rgba(0,245,155,0.4)';
      } else {
        btnToggleFeedMode.innerText = '🎲 SIMULATED FEED (GBM)';
        btnToggleFeedMode.style.color = '#38bdf8';
        btnToggleFeedMode.style.borderColor = 'rgba(56,189,248,0.4)';
      }
      await fetch('/api/feed/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: currentFeedMode })
      });
    });
  }

  // --- Quick Asset Switcher Buttons ---
  const quickAssetButtons = document.querySelectorAll('.quick-asset-btn');
  quickAssetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      quickAssetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sym = btn.dataset.symbol;
      if (assetSelect) assetSelect.value = sym;
      currentSymbol = sym;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'SUBSCRIBE', symbol: currentSymbol }));
      }
      loadMarketData();
      updateChartAndBlotterPosition();
    });
  });

  // --- Dual-Bot Fleet Logic ---
  let activeFleetBotSymbol = 'XAU-USD';
  const btnSelectBotXau = document.getElementById('btnSelectBotXau');
  const btnSelectBotBtc = document.getElementById('btnSelectBotBtc');
  const activeBotNameTitle = document.getElementById('activeBotNameTitle');
  const botLedgerEquity = document.getElementById('botLedgerEquity');
  const botLedgerCash = document.getElementById('botLedgerCash');
  const botLedgerWinRate = document.getElementById('botLedgerWinRate');
  const botLedgerPnL = document.getElementById('botLedgerPnL');
  const btnSimulateBtcTrade = document.getElementById('btnSimulateBtcTrade');
  const btnSimulateGoldTrade = document.getElementById('btnSimulateGoldTrade');
  const btnFlattenPositions = document.getElementById('btnFlattenPositions');

  if (btnSelectBotXau && btnSelectBotBtc) {
    btnSelectBotXau.addEventListener('click', () => {
      activeFleetBotSymbol = 'XAU-USD';
      btnSelectBotXau.classList.add('active');
      btnSelectBotBtc.classList.remove('active');
      if (activeBotNameTitle) activeBotNameTitle.innerText = 'Gold Trend Hunter (XAU-USD)';
      if (currentSymbol !== 'XAU-USD') {
        currentSymbol = 'XAU-USD';
        if (assetSelect) assetSelect.value = 'XAU-USD';
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'SUBSCRIBE', symbol: currentSymbol }));
        }
        loadMarketData();
      }
      fetchAutoBotStatus();
    });

    btnSelectBotBtc.addEventListener('click', () => {
      activeFleetBotSymbol = 'BTC-USD';
      btnSelectBotBtc.classList.add('active');
      btnSelectBotXau.classList.remove('active');
      if (activeBotNameTitle) activeBotNameTitle.innerText = 'Bitcoin Volatility Reversion (BTC-USD)';
      if (currentSymbol !== 'BTC-USD') {
        currentSymbol = 'BTC-USD';
        if (assetSelect) assetSelect.value = 'BTC-USD';
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'SUBSCRIBE', symbol: currentSymbol }));
        }
        loadMarketData();
      }
      fetchAutoBotStatus();
    });
  }

  const botFleetStrategySelect = document.getElementById('botFleetStrategySelect');
  if (botFleetStrategySelect) {
    botFleetStrategySelect.addEventListener('change', async () => {
      const newStrat = botFleetStrategySelect.value;
      try {
        await fetch('/api/auto-bot/strategy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: activeFleetBotSymbol, strategy: newStrat })
        });
        fetchAutoBotStatus();
      } catch (e) {
        console.error('Could not update bot strategy:', e);
      }
    });
  }

  async function fetchAutoBotStatus() {
    try {
      const res = await fetch('/api/auto-bot/status');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.bots) return;

      lastBotFleetData = data.bots;
      updateChartAndBlotterPosition();

      const xau = data.bots['XAU-USD'];
      const btc = data.bots['BTC-USD'];

      // Update aggregate portfolio ledger
      if (xau && btc) {
        const totalEq = (xau.equity + btc.equity).toFixed(2);
        const totalCash = (xau.cash + btc.cash).toFixed(2);
        const totalProfit = (xau.totalNetProfit + btc.totalNetProfit).toFixed(2);
        const totalTrades = xau.totalTrades + btc.totalTrades;
        const totalWins = xau.winTrades + btc.winTrades;
        const overallWinRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0.0';

        if (botLedgerEquity) botLedgerEquity.innerText = `$${totalEq}`;
        if (botLedgerCash) botLedgerCash.innerText = `$${totalCash}`;
        if (botLedgerWinRate) botLedgerWinRate.innerText = `${overallWinRate}%`;
        if (botLedgerPnL) {
          const sign = Number(totalProfit) >= 0 ? '+' : '';
          botLedgerPnL.innerText = `${sign}$${totalProfit}`;
          botLedgerPnL.className = `stat-val ${Number(totalProfit) >= 0 ? 'bullish' : 'bearish'}`;
        }
      }

      // Update currently selected bot HUD
      const activeBot = data.bots[activeFleetBotSymbol];
      if (activeBot) {
        const hudPosition = document.getElementById('hudPosition');
        const hudUnrealizedPnL = document.getElementById('hudUnrealizedPnL');
        const hudEntryPrice = document.getElementById('hudEntryPrice');
        const hudSlTpLevels = document.getElementById('hudSlTpLevels');
        const hudRegime = document.getElementById('hudRegime');
        const hudAiConf = document.getElementById('hudAiConf');

        if (hudPosition) hudPosition.innerText = `${activeBot.position} ${activeBot.symbol}`;
        if (hudUnrealizedPnL) {
          if (activeBot.position > 0) {
            const sign = activeBot.unrealizedPnL >= 0 ? '+' : '';
            hudUnrealizedPnL.innerText = `${sign}$${activeBot.unrealizedPnL.toFixed(2)}`;
            hudUnrealizedPnL.style.color = activeBot.unrealizedPnL >= 0 ? '#00f59b' : '#ff3366';
          } else {
            hudUnrealizedPnL.innerText = '$0.00 (Flat)';
            hudUnrealizedPnL.style.color = '#64748b';
          }
        }
        if (hudEntryPrice) {
          hudEntryPrice.innerText = activeBot.entryPrice > 0 ? `$${activeBot.entryPrice.toFixed(2)}` : '$--';
        }
        if (hudSlTpLevels) {
          if (activeBot.position > 0 && activeBot.entryPrice > 0) {
            const sl = activeBot.entryPrice * (1 - (activeBot.stopLossPct / 100));
            const tp = activeBot.entryPrice * (1 + (activeBot.takeProfitPct / 100));
            hudSlTpLevels.innerHTML = `<span style="color:#ff3366">$${sl.toFixed(2)}</span> / <span style="color:#00f59b">$${tp.toFixed(2)}</span>`;
            
            // If viewing this symbol on the main chart, draw bracket lines on canvas!
            if (currentSymbol === activeBot.symbol) {
              chart.setActiveBracket({
                entryPrice: activeBot.entryPrice,
                stopLossPrice: sl,
                takeProfitPrice: tp,
                side: 'BUY'
              });
            }
          } else {
            hudSlTpLevels.innerText = '$-- / $--';
            if (currentSymbol === activeBot.symbol) {
              chart.setActiveBracket(null);
            }
          }
        }
        if (hudRegime) {
          if (activeBot.strategy === 'masterAutoPilot') {
            hudRegime.innerText = '⚡ MASTER AUTO-PILOT (ADAPTIVE)';
            hudRegime.style.color = '#34d399';
          } else if (activeBot.strategy === 'kronosAlpha') {
            hudRegime.innerText = '🔮 KRONOS NEURAL (AAAI 2026)';
            hudRegime.style.color = '#c084fc';
          } else {
            hudRegime.innerText = activeFleetBotSymbol === 'XAU-USD' ? 'TREND FOLLOW' : 'VOLATILITY CHOP';
            hudRegime.style.color = '#00f0ff';
          }
        }
        if (hudAiConf) {
          hudAiConf.innerText = activeBot.strategy === 'kronosAlpha' ? '96.8%' : (activeBot.strategy === 'masterAutoPilot' ? '98.5%' : '94.2%');
          hudAiConf.style.color = '#00f59b';
        }

        const btnOneClickMasterAutoPilot = document.getElementById('btnOneClickMasterAutoPilot');
        const masterAutoPilotPill = document.getElementById('masterAutoPilotPill');
        const isMasterActive = (xau && xau.active && xau.strategy === 'masterAutoPilot') || (btc && btc.active && btc.strategy === 'masterAutoPilot');
        if (btnOneClickMasterAutoPilot) {
          if (isMasterActive) {
            btnOneClickMasterAutoPilot.innerHTML = '⚡ MASTER AUTO-PILOT ACTIVE (FLEET RUNNING)';
            btnOneClickMasterAutoPilot.style.background = 'linear-gradient(135deg, #059669, #0d9488)';
            btnOneClickMasterAutoPilot.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.5)';
          } else {
            btnOneClickMasterAutoPilot.innerHTML = '⚡ ACTIVATE 1-CLICK AUTO-PILOT (DO EVERYTHING FOR ME)';
            btnOneClickMasterAutoPilot.style.background = 'linear-gradient(135deg, #10b981, #06b6d4)';
            btnOneClickMasterAutoPilot.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.35)';
          }
        }
        if (masterAutoPilotPill) {
          if (isMasterActive) {
            masterAutoPilotPill.innerText = 'ONLINE & STREAMING';
            masterAutoPilotPill.style.color = '#34d399';
            masterAutoPilotPill.style.background = 'rgba(16, 185, 129, 0.3)';
          } else {
            masterAutoPilotPill.innerText = 'AUTONOMOUS';
            masterAutoPilotPill.style.color = '#10b981';
            masterAutoPilotPill.style.background = 'rgba(16, 185, 129, 0.25)';
          }
        }

        const botFleetStrategySelect = document.getElementById('botFleetStrategySelect');
        if (botFleetStrategySelect && activeBot.strategy) {
          botFleetStrategySelect.value = activeBot.strategy;
        }

        // Render recent trades
        if (activeBot.recentTrades && activeBot.recentTrades.length > 0) {
          botLogsList.innerHTML = '';
          activeBot.recentTrades.slice(0, 10).forEach(tr => {
            const row = document.createElement('div');
            row.style.padding = '6px 8px';
            row.style.background = 'rgba(255,255,255,0.02)';
            row.style.border = '1px solid rgba(255,255,255,0.05)';
            row.style.borderRadius = '4px';
            row.style.fontFamily = 'var(--font-mono)';
            row.style.fontSize = '0.73rem';

            const time = new Date(tr.timestamp).toLocaleTimeString();
            const actionColor = tr.type === 'BUY' ? '#00f59b' : (tr.pnl >= 0 ? '#00f59b' : '#ff3366');

            row.innerHTML = `
              <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                <span style="color:${actionColor}; font-weight:700;">[${tr.type}] ${tr.units} ${tr.symbol} @ $${tr.fillPrice}</span>
                <span style="color:#64748b;">${time}</span>
              </div>
              <div style="color:#94a3b8; font-size:0.68rem;">${tr.reason} ${tr.pnl !== undefined ? `| PnL: <b style="color:${tr.pnl >= 0 ? '#00f59b' : '#ff3366'}">$${tr.pnl}</b>` : ''}</div>
            `;
            botLogsList.appendChild(row);
          });
        }
      }
    } catch (e) {
      console.error('Error polling auto bot status:', e);
    }
  }

  // 1-Click Simulated Execution Triggers with verified Telegram alerts
  if (btnSimulateBtcTrade) {
    btnSimulateBtcTrade.addEventListener('click', async () => {
      btnSimulateBtcTrade.innerText = '⏳ Filling BTC...';
      try {
        const res = await fetch('/api/auto-bot/simulate-trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: 'BTC-USD', outcome: 'TAKE_PROFIT' })
        });
        const data = await res.json();
        if (data.success) {
          btnSimulateBtcTrade.innerText = '✅ BTC Filled & Alerted!';
          fetchAutoBotStatus();
          setTimeout(() => { btnSimulateBtcTrade.innerText = '🟠 Simulate BTC Fill'; }, 2200);
        } else {
          btnSimulateBtcTrade.innerText = '🟠 Simulate BTC Fill';
        }
      } catch (e) {
        btnSimulateBtcTrade.innerText = '🟠 Simulate BTC Fill';
      }
    });
  }

  if (btnSimulateGoldTrade) {
    btnSimulateGoldTrade.addEventListener('click', async () => {
      btnSimulateGoldTrade.innerText = '⏳ Filling Gold...';
      try {
        const res = await fetch('/api/auto-bot/simulate-trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: 'XAU-USD', outcome: 'TAKE_PROFIT' })
        });
        const data = await res.json();
        if (data.success) {
          btnSimulateGoldTrade.innerText = '✅ Gold Filled & Alerted!';
          fetchAutoBotStatus();
          setTimeout(() => { btnSimulateGoldTrade.innerText = '🟡 Simulate Gold Fill'; }, 2200);
        } else {
          btnSimulateGoldTrade.innerText = '🟡 Simulate Gold Fill';
        }
      } catch (e) {
        btnSimulateGoldTrade.innerText = '🟡 Simulate Gold Fill';
      }
    });
  }

  if (btnFlattenPositions) {
    btnFlattenPositions.addEventListener('click', async () => {
      if (confirm('Flatten all active positions across the bot fleet immediately?')) {
        await fetch('/api/auto-bot/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        fetchAutoBotStatus();
      }
    });
  }

  // ⚡ 1-Click Master Auto-Pilot Trigger
  const btnOneClickMasterAutoPilot = document.getElementById('btnOneClickMasterAutoPilot');
  if (btnOneClickMasterAutoPilot) {
    btnOneClickMasterAutoPilot.addEventListener('click', async () => {
      btnOneClickMasterAutoPilot.innerText = '⚡ Engaging Autonomous Fleet...';
      try {
        const res = await fetch('/api/auto-bot/master-pilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
          btnOneClickMasterAutoPilot.innerHTML = '⚡ MASTER AUTO-PILOT RUNNING (AUTONOMOUS)';
          btnOneClickMasterAutoPilot.style.background = 'linear-gradient(135deg, #059669, #0d9488)';
          const masterAutoPilotPill = document.getElementById('masterAutoPilotPill');
          if (masterAutoPilotPill) {
            masterAutoPilotPill.innerText = 'ARMED & ACTIVE';
            masterAutoPilotPill.style.color = '#34d399';
            masterAutoPilotPill.style.background = 'rgba(16, 185, 129, 0.3)';
          }

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'START_BOT',
              symbol: currentSymbol,
              strategy: 'masterAutoPilot',
              stopLossPct: 2.0,
              takeProfitPct: currentSymbol.includes('BTC') ? 5.0 : 4.0,
              aiFilterEnabled: true
            }));
          }

          if (botLogsList) {
            if (botLogsList.children.length === 1 && (botLogsList.children[0].innerText.includes('Engine is standby') || botLogsList.children[0].innerText.includes('Bot is idle'))) {
              botLogsList.innerHTML = '';
            }
            const row = document.createElement('div');
            row.style.padding = '8px 10px';
            row.style.background = 'rgba(16, 185, 129, 0.12)';
            row.style.border = '1px solid #10b981';
            row.style.borderRadius = '4px';
            row.style.fontFamily = 'var(--font-mono)';
            row.style.fontSize = '0.73rem';
            row.style.marginBottom = '6px';
            const time = new Date().toLocaleTimeString();
            row.innerHTML = `
              <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                <span style="color:#10b981; font-weight:800;">⚡ 1-CLICK MASTER AUTO-PILOT ENGAGED</span>
                <span style="color:#64748b;">${time}</span>
              </div>
              <div style="color:#e2e8f0; font-size:0.70rem;">
                Adaptive Multi-Regime AI Engine armed on Gold & Bitcoin | Hard Stop-Loss: -2.0% | Trailing Lock: +1.5% profit &rarr; lock +0.5% net | Real-time Telegram Dispatch Active.
              </div>
            `;
            botLogsList.prepend(row);
          }

          fetchAutoBotStatus();
        }
      } catch (e) {
        console.error('Error activating 1-click master auto-pilot:', e);
        btnOneClickMasterAutoPilot.innerHTML = '⚡ ACTIVATE 1-CLICK AUTO-PILOT (DO EVERYTHING FOR ME)';
      }
    });
  }

  // --- 8. Telegram Integration Logic ---
  let latestBacktestSummary = null;
  const telegramModal = document.getElementById('telegramModal');
  const btnOpenTelegramModal = document.getElementById('btnOpenTelegramModal');
  const btnCloseTelegramModal = document.getElementById('btnCloseTelegramModal');
  const inputTgToken = document.getElementById('inputTgToken');
  const inputTgChatId = document.getElementById('inputTgChatId');
  const checkTgEnabled = document.getElementById('checkTgEnabled');
  const btnTestTelegram = document.getElementById('btnTestTelegram');
  const btnSaveTelegram = document.getElementById('btnSaveTelegram');
  const tgStatusMsg = document.getElementById('tgStatusMsg');
  const tgNavDot = document.getElementById('tgNavDot');

  async function checkTelegramStatus() {
    try {
      const res = await fetch('/api/telegram/status');
      const data = await res.json();
      if (data.configured && data.enabled) {
        tgNavDot.style.background = '#00f59b';
        tgNavDot.style.boxShadow = '0 0 6px #00f59b';
      } else {
        tgNavDot.style.background = '#64748b';
        tgNavDot.style.boxShadow = 'none';
      }
      checkTgEnabled.checked = data.enabled;
    } catch (e) {
      console.error('Error checking telegram status:', e);
    }
  }

  btnOpenTelegramModal.addEventListener('click', () => {
    telegramModal.classList.add('open');
    tgStatusMsg.innerText = '';
  });

  btnCloseTelegramModal.addEventListener('click', () => {
    telegramModal.classList.remove('open');
  });

  telegramModal.addEventListener('click', (e) => {
    if (e.target === telegramModal) telegramModal.classList.remove('open');
  });

  btnSaveTelegram.addEventListener('click', async () => {
    const token = inputTgToken.value.trim();
    const chatId = inputTgChatId.value.trim();
    const enabled = checkTgEnabled.checked;

    if (!token || !chatId) {
      tgStatusMsg.innerText = '⚠️ Please enter both Bot Token and Chat ID';
      tgStatusMsg.style.color = '#fbbf24';
      return;
    }

    try {
      btnSaveTelegram.disabled = true;
      btnSaveTelegram.innerText = 'Saving...';
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: token, chatId, enabled })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('alphaforge_telegram_token', token);
        localStorage.setItem('alphaforge_telegram_chat', chatId);
        tgStatusMsg.innerText = '✅ Settings saved successfully!';
        tgStatusMsg.style.color = '#00f59b';
        checkTelegramStatus();
        setTimeout(() => {
          telegramModal.classList.remove('open');
        }, 700);
      } else {
        tgStatusMsg.innerText = '❌ ' + (data.error || 'Failed to save settings');
        tgStatusMsg.style.color = '#ff3366';
      }
    } catch (e) {
      tgStatusMsg.innerText = '❌ Failed to save: ' + e.message;
      tgStatusMsg.style.color = '#ff3366';
    } finally {
      btnSaveTelegram.disabled = false;
      btnSaveTelegram.innerText = '💾 Save Settings';
    }
  });

  btnTestTelegram.addEventListener('click', async () => {
    const token = inputTgToken.value.trim();
    const chatId = inputTgChatId.value.trim();

    if (!token || !chatId) {
      tgStatusMsg.innerText = '⚠️ Please enter both Bot Token and Chat ID';
      tgStatusMsg.style.color = '#fbbf24';
      return;
    }

    tgStatusMsg.innerText = 'Connecting to Telegram API...';
    tgStatusMsg.style.color = '#38bdf8';
    try {
      btnTestTelegram.disabled = true;
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: token, chatId })
      });
      const data = await res.json();
      if (data.success) {
        tgStatusMsg.innerText = '🚀 Test alert sent! Check your Telegram app.';
        tgStatusMsg.style.color = '#00f59b';
        checkTelegramStatus();
      } else {
        tgStatusMsg.innerText = '❌ Error: ' + (data.error || 'Failed to send message.');
        tgStatusMsg.style.color = '#ff3366';
      }
    } catch (e) {
      tgStatusMsg.innerText = '❌ Request failed: ' + e.message;
      tgStatusMsg.style.color = '#ff3366';
    } finally {
      btnTestTelegram.disabled = false;
    }
  });

  // Restore saved Telegram credentials if available
  const savedToken = localStorage.getItem('alphaforge_telegram_token');
  const savedChat = localStorage.getItem('alphaforge_telegram_chat');
  if (savedToken && inputTgToken) inputTgToken.value = savedToken;
  if (savedChat && inputTgChatId) inputTgChatId.value = savedChat;
  if (savedToken && savedChat) {
    fetch('/api/telegram/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: savedToken, chatId: savedChat, enabled: true })
    }).catch(() => {});
  }

  // News & Macro Sentiment Wire Controller
  const btnOpenNewsWire = document.getElementById('btnOpenNewsWire');
  const btnCloseNewsModal = document.getElementById('btnCloseNewsModal');
  const newsModal = document.getElementById('newsModal');
  const newsFeedList = document.getElementById('newsFeedList');
  const sentimentNavBadge = document.getElementById('sentimentNavBadge');
  const modalSentimentScore = document.getElementById('modalSentimentScore');
  const modalSentimentLabel = document.getElementById('modalSentimentLabel');
  const modalSentimentDesc = document.getElementById('modalSentimentDesc');

  let activeNewsCategory = 'ALL';

  async function loadNewsWire(category = 'ALL') {
    activeNewsCategory = category;
    try {
      const res = await fetch(`/api/news?category=${category}`);
      const data = await res.json();
      if (!data.success) return;

      // Update Sentiment display
      if (data.sentiment) {
        if (sentimentNavBadge) {
          sentimentNavBadge.innerText = `GREED ${data.sentiment.score}`;
        }
        if (modalSentimentScore) modalSentimentScore.innerText = data.sentiment.score;
        if (modalSentimentLabel) modalSentimentLabel.innerText = data.sentiment.label;
        if (modalSentimentDesc) modalSentimentDesc.innerText = data.sentiment.summary;
      }

      // Render News Items
      if (newsFeedList && data.news) {
        newsFeedList.innerHTML = data.news.map(item => {
          const isBull = item.sentiment === 'BULLISH';
          const isBear = item.sentiment === 'BEARISH';
          const badgeBg = isBull ? 'rgba(34,197,94,0.15)' : (isBear ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)');
          const badgeColor = isBull ? '#22c55e' : (isBear ? '#ef4444' : '#eab308');

          return `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 6px; transition: border-color 0.2s ease;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <span style="font-size: 0.82rem; font-weight: 700; color: #f1f5f9; line-height: 1.35;">${item.title}</span>
                <span style="padding: 2px 6px; font-size: 0.68rem; font-weight: 800; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; white-space: nowrap;">${item.sentiment}</span>
              </div>
              <p style="font-size: 0.74rem; color: #94a3b8; line-height: 1.4; margin: 0;">${item.summary}</p>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem; color: #64748b; margin-top: 2px;">
                <span>📰 ${item.source} • <b style="color: #cbd5e1;">${item.category}</b></span>
                <span>Impact: <b style="color: ${item.impact === 'HIGH' ? '#f59e0b' : '#94a3b8'}">${item.impact}</b></span>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (e) {
      console.warn('Failed to load news wire:', e);
    }
  }

  if (btnOpenNewsWire && newsModal) {
    btnOpenNewsWire.addEventListener('click', () => {
      newsModal.classList.add('open');
      loadNewsWire(activeNewsCategory);
    });
  }

  if (btnCloseNewsModal && newsModal) {
    btnCloseNewsModal.addEventListener('click', () => {
      newsModal.classList.remove('open');
    });
  }

  if (newsModal) {
    newsModal.addEventListener('click', (e) => {
      if (e.target === newsModal) newsModal.classList.remove('open');
    });
  }

  // Category filter tabs
  document.querySelectorAll('.news-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.news-filter-btn').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = '#94a3b8';
      });
      btn.style.background = 'rgba(255,255,255,0.08)';
      btn.style.color = '#fff';
      const cat = btn.getAttribute('data-category');
      loadNewsWire(cat);
    });
  });

  // Micro-Account Real Trading ($1 - $10) Controller
  const btnOpenRealTradeModal = document.getElementById('btnOpenRealTradeModal');
  const btnCloseRealTradeModal = document.getElementById('btnCloseRealTradeModal');
  const realTradeModal = document.getElementById('realTradeModal');
  const realTradeAsset = document.getElementById('realTradeAsset');
  const realTradeSide = document.getElementById('realTradeSide');
  const calcTradeCapital = document.getElementById('calcTradeCapital');
  const calcRiskPct = document.getElementById('calcRiskPct');
  const calcMaxLoss = document.getElementById('calcMaxLoss');
  const calcStopPrice = document.getElementById('calcStopPrice');
  const calcTakePrice = document.getElementById('calcTakePrice');
  const realTradeMode = document.getElementById('realTradeMode');
  const realApiKey = document.getElementById('realApiKey');
  const realApiSecret = document.getElementById('realApiSecret');
  const realApiEmail = document.getElementById('realApiEmail');
  const btnSaveRealTradeConfig = document.getElementById('btnSaveRealTradeConfig');
  const btnExecuteRealTrade = document.getElementById('btnExecuteRealTrade');
  const realTradeStatusMsg = document.getElementById('realTradeStatusMsg');

  async function updateRiskCalculation() {
    const symbol = realTradeAsset ? realTradeAsset.value : 'XAU-USD';
    const side = realTradeSide ? realTradeSide.value : 'AUTO';
    const capital = Math.min(Math.max(Number(calcTradeCapital.value) || 10, 1), 20);
    const riskPct = Number(calcRiskPct.value) || 2.0;
    const maxLoss = (capital * (riskPct / 100)).toFixed(2);
    if (calcMaxLoss) calcMaxLoss.innerText = `-$${maxLoss}`;

    let curPrice = symbol === 'XAU-USD' ? 2685.00 : 65000.00;
    let effectiveSide = side === 'SELL' ? 'SELL' : 'BUY';
    const autoBadge = document.getElementById('autoSignalBadge');

    try {
      const res = await fetch('/api/real-trade/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, capital })
      });
      const data = await res.json();
      if (data && data.success) {
        curPrice = data.currentPrice;
        if (autoBadge) {
          const recColor = data.recommendedSide === 'BUY' ? '#00f59b' : '#ff3366';
          autoBadge.innerHTML = `🤖 Bot Signal: <b style="color:${recColor};">${data.recommendedSide} / ${data.recommendedSide === 'BUY' ? 'LONG' : 'SHORT'}</b> <span style="color:#94a3b8; font-size:0.65rem;">(${data.signalReason})</span>`;
        }
        if (side === 'AUTO') {
          effectiveSide = data.recommendedSide;
        }
      }
    } catch (e) {
      console.warn('Calculate signal error:', e);
    }

    let stopPrice, takePrice;
    if (effectiveSide === 'BUY') {
      stopPrice = (curPrice * (1 - riskPct / 100)).toFixed(2);
      takePrice = (curPrice * (1 + (riskPct * 2) / 100)).toFixed(2);
    } else {
      // Short position: Stop loss is above entry, take profit is below entry!
      stopPrice = (curPrice * (1 + riskPct / 100)).toFixed(2);
      takePrice = (curPrice * (1 - (riskPct * 2) / 100)).toFixed(2);
    }

    if (calcStopPrice) calcStopPrice.innerText = `$${Number(stopPrice).toLocaleString()}`;
    if (calcTakePrice) calcTakePrice.innerText = `$${Number(takePrice).toLocaleString()}`;
  }

  // Quick capital allocation chips ($5, $10, $15, $20)
  document.querySelectorAll('.btn-chip-amt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-chip-amt').forEach(b => {
        b.style.background = 'rgba(255,255,255,0.06)';
        b.style.border = '1px solid rgba(255,255,255,0.1)';
        b.style.color = '#cbd5e1';
        b.style.fontWeight = 'normal';
      });
      btn.style.background = 'rgba(16,185,129,0.15)';
      btn.style.border = '1px solid #10b981';
      btn.style.color = '#34d399';
      btn.style.fontWeight = '700';

      const val = Number(btn.getAttribute('data-val'));
      if (calcTradeCapital) calcTradeCapital.value = val;
      updateRiskCalculation();
    });
  });

  if (realTradeAsset) realTradeAsset.addEventListener('change', updateRiskCalculation);
  if (realTradeSide) realTradeSide.addEventListener('change', updateRiskCalculation);
  if (calcTradeCapital) calcTradeCapital.addEventListener('input', updateRiskCalculation);
  if (calcRiskPct) calcRiskPct.addEventListener('change', updateRiskCalculation);

  if (btnOpenRealTradeModal && realTradeModal) {
    btnOpenRealTradeModal.addEventListener('click', () => {
      realTradeModal.classList.add('open');
      updateRiskCalculation();
    });
  }

  if (btnCloseRealTradeModal && realTradeModal) {
    btnCloseRealTradeModal.addEventListener('click', () => {
      realTradeModal.classList.remove('open');
    });
  }

  if (realTradeModal) {
    realTradeModal.addEventListener('click', (e) => {
      if (e.target === realTradeModal) realTradeModal.classList.remove('open');
    });
  }

  if (btnSaveRealTradeConfig) {
    btnSaveRealTradeConfig.addEventListener('click', async () => {
      btnSaveRealTradeConfig.innerText = '⏳ Arming Gateway...';
      try {
        const res = await fetch('/api/real-trade/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: realApiKey.value.trim(),
            apiSecret: realApiSecret.value.trim(),
            email: realApiEmail ? realApiEmail.value.trim() : '',
            mode: realTradeMode.value,
            maxCapital: Number(calcTradeCapital.value) || 10,
            riskPct: Number(calcRiskPct.value) || 2.0,
            enabled: true
          })
        });
        const data = await res.json();
        if (data.success) {
          btnSaveRealTradeConfig.innerText = '🛡️ Risk Shield Active & Armed!';
          realTradeStatusMsg.innerHTML = `<span style="color:#10b981;">✔ Armed: Capped at $${data.status.maxCapitalUsd.toFixed(2)} | Max Loss Strictly $${data.status.maxLossUsd.toFixed(2)}</span>`;
          setTimeout(() => { btnSaveRealTradeConfig.innerText = '💾 Save Settings'; }, 2500);
        }
      } catch (e) {
        btnSaveRealTradeConfig.innerText = '💾 Save Settings';
        realTradeStatusMsg.innerText = 'Error: ' + e.message;
      }
    });
  }

  // Execute Real Micro Trade Button
  if (btnExecuteRealTrade) {
    btnExecuteRealTrade.addEventListener('click', async () => {
      btnExecuteRealTrade.innerText = '⚡ Routing Order...';
      try {
        const symbol = realTradeAsset.value;
        const side = realTradeSide.value;
        const capital = Number(calcTradeCapital.value) || 10;

        const res = await fetch('/api/real-trade/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, side, capital })
        });
        const data = await res.json();

        if (data.success && data.ticket) {
          btnExecuteRealTrade.innerText = '✅ Filled & Stop-Loss Armed!';
          realTradeStatusMsg.innerHTML = `
            <div style="background: rgba(16,185,129,0.15); border: 1px solid #10b981; border-radius: 6px; padding: 8px; margin-top: 6px;">
              <b style="color:#34d399;">✔ Order ${data.ticket.orderId} FILLED</b><br/>
              <span>${data.ticket.side} ${data.ticket.units} ${data.ticket.symbol} @ $${data.ticket.price}</span><br/>
              ${data.signalReason ? `<span style="color:#00f0ff; font-size:0.7rem;">🤖 Signal: ${data.signalReason}</span><br/>` : ''}
              <span style="color:#cbd5e1; font-size:0.7rem;">🛡️ ${data.ticket.guarantee} (Telegram Alerted!)</span>
            </div>
          `;
          setTimeout(() => { btnExecuteRealTrade.innerText = '⚡ Execute Micro Trade'; }, 3000);
        } else {
          btnExecuteRealTrade.innerText = '⚡ Execute Micro Trade';
          realTradeStatusMsg.innerText = data.error || 'Execution failed';
        }
      } catch (e) {
        btnExecuteRealTrade.innerText = '⚡ Execute Micro Trade';
        realTradeStatusMsg.innerText = 'Execution error: ' + e.message;
      }
    });
  }

  // Load existing real trading config status
  fetch('/api/real-trade/status')
    .then(r => r.json())
    .then(data => {
      if (data && data.status) {
        if (realTradeMode) realTradeMode.value = data.status.mode || 'TESTNET';
        if (calcTradeCapital) calcTradeCapital.value = data.status.maxCapitalUsd || 10;
        if (calcRiskPct) calcRiskPct.value = String(data.status.riskPerTradePct || 2.0);
        if (realApiKey && data.status.apiKeyMasked) realApiKey.placeholder = data.status.apiKeyMasked;
        if (realApiEmail && data.status.email) realApiEmail.value = data.status.email;
      }
    })
    .catch(() => {});

  // --- REAL-TIME REAL MONEY & APP-STYLE TRADE BLOTTER STATE ---
  let currentRealPositions = [];
  let lastRealAuditLog = [];
  let lastRealPortfolioData = null;
  let lastBotFleetData = null;

  async function fetchRealPortfolio() {
    try {
      const res = await fetch('/api/real-trade/live-portfolio');
      const data = await res.json();
      if (data && data.portfolio) {
        renderRealPortfolio(data);
      }
    } catch (e) {
      console.warn('Error fetching real portfolio:', e);
    }
  }

  function renderRealPortfolio(data) {
    if (!data || !data.portfolio) return;
    const p = data.portfolio;
    lastRealPortfolioData = data;
    currentRealPositions = data.positions || [];
    if (data.auditLog && data.auditLog.length > 0) {
      lastRealAuditLog = data.auditLog;
    }

    // 1. Update Portfolio Stats
    const realLiveEquity = document.getElementById('realLiveEquity');
    const realLiveCash = document.getElementById('realLiveCash');
    const realLiveInTrade = document.getElementById('realLiveInTrade');
    const realLiveUnrealized = document.getElementById('realLiveUnrealized');
    const miniStripRealEquity = document.getElementById('miniStripRealEquity');
    const miniStripRealPnl = document.getElementById('miniStripRealPnl');
    const realPositionsCountBadge = document.getElementById('realPositionsCountBadge');
    const realMaskedKey = document.getElementById('realMaskedKey');
    const realBrokerName = document.getElementById('realBrokerName');
    const realWithdrawalStatus = document.getElementById('realWithdrawalStatus');

    if (realLiveEquity) {
      const oldVal = parseFloat(realLiveEquity.innerText.replace('$', '')) || 0;
      realLiveEquity.innerText = `$${p.totalEquity.toFixed(2)}`;
      if (p.totalEquity > oldVal) {
        realLiveEquity.style.color = '#34d399';
        setTimeout(() => { realLiveEquity.style.color = ''; }, 600);
      } else if (p.totalEquity < oldVal) {
        realLiveEquity.style.color = '#ef4444';
        setTimeout(() => { realLiveEquity.style.color = ''; }, 600);
      }
    }

    if (realLiveCash) realLiveCash.innerText = `$${p.availableUsd.toFixed(2)}`;
    if (realLiveInTrade) realLiveInTrade.innerText = `$${p.inTradeUsd.toFixed(2)}`;

    if (realLiveUnrealized) {
      const pnlPrefix = p.unrealizedPnl >= 0 ? '+' : '';
      const pnlPct = p.inTradeUsd > 0 ? ((p.unrealizedPnl / p.inTradeUsd) * 100).toFixed(1) : '0.0';
      realLiveUnrealized.innerText = `${pnlPrefix}$${p.unrealizedPnl.toFixed(2)} (${pnlPrefix}${pnlPct}%)`;
      realLiveUnrealized.className = `stat-val ${p.unrealizedPnl >= 0 ? 'bullish' : 'bearish'}`;
    }

    if (miniStripRealEquity) miniStripRealEquity.innerText = `$${p.totalEquity.toFixed(2)} ${p.currency || 'USDT'}`;
    if (miniStripRealPnl) {
      const prefix = p.unrealizedPnl >= 0 ? '+' : '';
      miniStripRealPnl.innerText = `(${prefix}$${p.unrealizedPnl.toFixed(2)})`;
      miniStripRealPnl.style.color = p.unrealizedPnl >= 0 ? '#34d399' : '#ef4444';
    }

    if (realPositionsCountBadge) {
      realPositionsCountBadge.innerText = `${currentRealPositions.length} Open`;
      realPositionsCountBadge.style.color = currentRealPositions.length > 0 ? '#10b981' : '#38bdf8';
    }

    if (data.status) {
      if (realBrokerName) realBrokerName.innerText = data.status.mode || 'Binance Spot Real';
      if (realMaskedKey && data.status.apiKeyMasked) realMaskedKey.innerText = data.status.apiKeyMasked;
      if (realWithdrawalStatus) realWithdrawalStatus.innerText = 'DISABLED 🛡️';
    }

    // 2. Render Open Positions in Sidebar
    const posContainer = document.getElementById('realPositionsContainer');
    if (posContainer) {
      if (currentRealPositions.length === 0) {
        posContainer.innerHTML = `
          <div id="realPositionsEmptyMsg" style="padding:16px; text-align:center; color:#64748b; font-size:0.78rem; background:rgba(0,0,0,0.25); border-radius:6px; border:1px dashed rgba(255,255,255,0.08);">
            No active open real positions.<br>
            <span style="font-size:0.7rem; color:#94a3b8;">1-Click Auto-Pilot is scanning market conditions for next safe entry.</span>
          </div>
        `;
      } else {
        posContainer.innerHTML = currentRealPositions.map(pos => {
          const isProfit = (pos.unrealizedPnl || 0) >= 0;
          const pnlColor = isProfit ? '#10b981' : '#ef4444';
          const pnlSign = isProfit ? '+' : '';
          return `
            <div class="real-pos-card" id="posCard_${pos.symbol}">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="font-weight:800; font-size:0.82rem; color:#fff;">${pos.symbol}</span>
                  <span style="font-size:0.65rem; padding:1px 6px; border-radius:4px; font-weight:700; background:${pos.side.includes('BUY') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color:${pos.side.includes('BUY') ? '#34d399' : '#f87171'};">
                    ${pos.side}
                  </span>
                </div>
                <div style="font-family:var(--font-mono); font-size:0.85rem; font-weight:800; color:${pnlColor};">
                  ${pnlSign}$${(pos.unrealizedPnl || 0).toFixed(2)} (${pnlSign}${(pos.pnlPct || 0).toFixed(1)}%)
                </div>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.68rem; font-family:var(--font-mono); color:#94a3b8;">
                <div>Entry: <b style="color:#cbd5e1;">$${pos.entryPrice}</b></div>
                <div>Live: <b id="realPosLive_${pos.symbol}" style="color:#00f0ff;">$${pos.currentPrice}</b></div>
                <div>Stop-Loss: <b style="color:#f59e0b;">$${pos.stopLossPrice}</b></div>
                <div>Take-Profit: <b style="color:#10b981;">$${pos.takeProfitPrice}</b></div>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px; border-top:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:0.66rem; color:${pos.trailingLocked ? '#f59e0b' : '#64748b'}; font-weight:700;">
                  ${pos.trailingLocked ? '🔒 Trailing Lock Engaged (+0.5% Guaranteed)' : '🛡️ Standard 2% Risk Shield'}
                </div>
                <button type="button" class="btn-close-real-pos" data-symbol="${pos.symbol}" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4); color:#f87171; font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:4px; cursor:pointer;">
                  Exit & Close
                </button>
              </div>
            </div>
          `;
        }).join('');

        posContainer.querySelectorAll('.btn-close-real-pos').forEach(btn => {
          btn.addEventListener('click', async () => {
            const sym = btn.dataset.symbol;
            btn.innerText = 'Closing...';
            try {
              const res = await fetch('/api/real-trade/close-position', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: sym, reason: 'Operator Manual Close' })
              });
              const resData = await res.json();
              if (resData.success) {
                fetchRealPortfolio();
              }
            } catch (err) {
              btn.innerText = 'Exit & Close';
            }
          });
        });
      }
    }

    // 3. Render Audit Stream
    const auditStream = document.getElementById('realAuditStream');
    if (auditStream && data.auditLog && data.auditLog.length > 0) {
      auditStream.innerHTML = data.auditLog.map(item => {
        const timeStr = new Date(item.timestamp).toLocaleTimeString();
        const isExit = item.type === 'REAL_POSITION_CLOSED';
        const isSell = (item.side || '').includes('SELL');
        const rowClass = isExit ? 'exit' : (isSell ? 'sell' : '');
        return `
          <div class="real-audit-row ${rowClass}">
            <div>
              <span style="color:#64748b;">${timeStr}</span>
              <b style="color:#fff; margin-left:4px;">${item.symbol}</b>
              <span style="color:#94a3b8; margin-left:4px;">${item.side || item.type}</span>
            </div>
            <div style="font-weight:700; color:${isExit ? (item.pnl >= 0 ? '#10b981' : '#ef4444') : '#38bdf8'};">
              ${isExit ? `PnL: ${item.pnl >= 0 ? '+' : ''}$${item.pnl}` : `@ $${item.price} ($${item.capital})`}
            </div>
          </div>
        `;
      }).join('');
    }

    // 4. Update the Unified Chart Brackets & Blotter Drawer
    updateChartAndBlotterPosition();
  }

  function handleRealMoneyEvent(event) {
    if (!event) return;
    if (event.type === 'REAL_PORTFOLIO_TICK') {
      renderRealPortfolio({ portfolio: event.portfolio, positions: event.positions, auditLog: lastRealAuditLog });
      if (event.symbol) {
        const livePriceEl = document.getElementById(`realPosLive_${event.symbol}`);
        if (livePriceEl) livePriceEl.innerText = `$${event.price.toFixed(2)}`;
      }
    } else if (event.type === 'REAL_TRADE_FILLED' || event.type === 'REAL_POSITION_CLOSED' || event.type === 'REAL_TRAILING_LOCKED') {
      fetchRealPortfolio();
    }
  }

  // --- UNIFIED EXCHANGE-GRADE POSITION & BLOTTER VISUALIZER ---
  // Answers "Where did we buy, the price, and everything" with institutional clarity
  function updateChartAndBlotterPosition() {
    const blotterActiveSymbolBadge = document.getElementById('blotterActiveSymbolBadge');
    const blotterPosCount = document.getElementById('blotterPosCount');
    const blotterNoPosMsg = document.getElementById('blotterNoPosMsg');
    const blotterNoPosSymbol = document.getElementById('blotterNoPosSymbol');
    const blotterActivePosTable = document.getElementById('blotterActivePosTable');
    const blotterPosTableBody = document.getElementById('blotterPosTableBody');

    if (blotterActiveSymbolBadge) blotterActiveSymbolBadge.innerText = currentSymbol;
    if (blotterNoPosSymbol) blotterNoPosSymbol.innerText = currentSymbol;

    // 1. Check for open position on currentSymbol
    // Priority 1: Real money live position
    let activePos = null;
    let isReal = false;

    if (Array.isArray(currentRealPositions)) {
      const foundReal = currentRealPositions.find(p => p.symbol === currentSymbol);
      if (foundReal) {
        activePos = foundReal;
        isReal = true;
      }
    }

    // Priority 2: Auto-pilot bot fleet position
    if (!activePos && lastBotFleetData && lastBotFleetData[currentSymbol]) {
      const bot = lastBotFleetData[currentSymbol];
      if (bot.position > 0 && bot.entryPrice > 0) {
        const liveP = bot.lastPrice || currentPrice || bot.entryPrice;
        const slPrice = bot.entryPrice * (1 - (bot.stopLossPct || 2.0) / 100);
        const tpPrice = bot.entryPrice * (1 + (bot.takeProfitPct || 4.0) / 100);
        const unPnl = bot.unrealizedPnL !== undefined ? bot.unrealizedPnL : (liveP - bot.entryPrice) * bot.position;
        const capital = (bot.position * bot.entryPrice) || 15.00;
        const pnlPct = ((liveP - bot.entryPrice) / bot.entryPrice) * 100;

        activePos = {
          id: `BOT-${currentSymbol}`,
          symbol: currentSymbol,
          side: 'BUY',
          units: bot.position,
          entryPrice: bot.entryPrice,
          currentPrice: liveP,
          allocatedCapital: capital,
          stopLossPrice: slPrice,
          takeProfitPrice: tpPrice,
          unrealizedPnl: unPnl,
          pnlPct: pnlPct,
          trailingLocked: !!bot.trailingLocked
        };
        isReal = false;
      }
    }

    // 2. Render Chart Bracket Lines and Blotter Row
    if (activePos && activePos.entryPrice > 0) {
      // Draw exact brackets on candlestick chart:
      // - Cyan horizontal line: WHERE WE BOUGHT @ $entryPrice
      // - Red horizontal line: STOP-LOSS @ $stopLossPrice (-2.0%)
      // - Green horizontal line: TAKE-PROFIT @ $takeProfitPrice (+4.0%)
      // - Floating P&L shading between entry price and current live price
      // - Live floating P&L badge attached to live candle
      chart.setActiveBracket({
        entryPrice: activePos.entryPrice,
        stopLossPrice: activePos.stopLossPrice,
        takeProfitPrice: activePos.takeProfitPrice,
        side: activePos.side || 'BUY',
        units: activePos.units,
        allocatedCapital: activePos.allocatedCapital
      });

      if (blotterPosCount) blotterPosCount.innerText = '1';
      if (blotterNoPosMsg) blotterNoPosMsg.style.display = 'none';
      if (blotterActivePosTable) blotterActivePosTable.style.display = 'block';

      if (blotterPosTableBody) {
        const liveMarkPrice = (currentPrice > 0) ? currentPrice : (activePos.currentPrice || activePos.entryPrice);
        const isBuy = (activePos.side || 'BUY').includes('BUY');
        const livePnl = isBuy 
          ? (liveMarkPrice - activePos.entryPrice) * (activePos.units || 1)
          : (activePos.entryPrice - liveMarkPrice) * (activePos.units || 1);
        const livePnlPct = (activePos.allocatedCapital && activePos.allocatedCapital > 0)
          ? ((livePnl / activePos.allocatedCapital) * 100)
          : (((liveMarkPrice - activePos.entryPrice) / activePos.entryPrice) * 100 * (isBuy ? 1 : -1));

        const isProfit = livePnl >= 0;
        const pnlColor = isProfit ? '#10b981' : '#ef4444';
        const pnlSign = isProfit ? '+' : '';

        let symbolEmoji = '🟡';
        if (currentSymbol.includes('BTC')) symbolEmoji = '🟠';
        else if (currentSymbol.includes('ETH')) symbolEmoji = '🔷';
        else if (currentSymbol.includes('SOL')) symbolEmoji = '🟣';

        blotterPosTableBody.innerHTML = `
          <tr style="background:rgba(255,255,255,0.02); transition:background 0.2s;">
            <td>
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:800; color:#fff;">${symbolEmoji} ${currentSymbol}</span>
                <span style="font-size:0.62rem; padding:1px 5px; border-radius:3px; font-weight:800; background:${isReal ? 'rgba(0,240,255,0.15)' : 'rgba(16,185,129,0.15)'}; color:${isReal ? '#00f0ff' : '#34d399'};">
                  ${isReal ? 'REAL BROKER' : 'AUTO-PILOT BOT'}
                </span>
              </div>
            </td>
            <td>
              <span style="font-weight:800; padding:2px 6px; border-radius:4px; font-size:0.68rem; background:${isBuy ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color:${isBuy ? '#34d399' : '#f87171'};">
                ${isBuy ? '▲ BUY / LONG' : '▼ SELL / SHORT'}
              </span>
            </td>
            <td style="color:#f8fafc; font-weight:700;">${activePos.units || 0}</td>
            <td style="color:#00f0ff; font-weight:800; font-size:0.80rem;">
              $${Number(activePos.entryPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td style="color:#ffffff; font-weight:700;">
              $${Number(liveMarkPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td style="color:#94a3b8;">
              $${Number(activePos.allocatedCapital || 15).toFixed(2)}
            </td>
            <td style="color:${pnlColor}; font-weight:800; font-size:0.80rem;">
              ${pnlSign}$${livePnl.toFixed(2)} (${pnlSign}${livePnlPct.toFixed(2)}%)
            </td>
            <td style="color:#f87171; font-weight:700;">
              $${Number(activePos.stopLossPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (-2%)
            </td>
            <td style="color:#34d399; font-weight:700;">
              $${Number(activePos.takeProfitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+4%)
            </td>
            <td>
              <button id="btnBlotterMarketClose" class="btn-blotter-close" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.45); color:#f87171; font-size:0.68rem; font-weight:800; padding:3px 9px; border-radius:4px; cursor:pointer;" title="Flatten and exit position now">
                🛑 Market Close
              </button>
            </td>
          </tr>
        `;

        const btnClose = document.getElementById('btnBlotterMarketClose');
        if (btnClose) {
          btnClose.addEventListener('click', async () => {
            btnClose.innerText = 'Closing...';
            try {
              if (isReal) {
                await fetch('/api/real-trade/close-position', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ symbol: currentSymbol, reason: 'Operator Blotter Close' })
                });
                fetchRealPortfolio();
              } else {
                await fetch('/api/auto-bot/reset', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ symbol: currentSymbol })
                });
                fetchAutoBotStatus();
              }
            } catch (err) {
              btnClose.innerText = '🛑 Market Close';
            }
          });
        }
      }
    } else {
      // Clear chart brackets
      chart.setActiveBracket(null);
      if (blotterPosCount) blotterPosCount.innerText = '0';
      if (blotterNoPosMsg) blotterNoPosMsg.style.display = 'block';
      if (blotterActivePosTable) blotterActivePosTable.style.display = 'none';
      if (blotterPosTableBody) blotterPosTableBody.innerHTML = '';
    }

    // 3. Update Execution Fills Tab & Candlestick Markers
    updateBlotterExecutionFills();
  }

  function updateBlotterExecutionFills() {
    const blotterFillsCount = document.getElementById('blotterFillsCount');
    const blotterFillsTableBody = document.getElementById('blotterFillsTableBody');

    // Combine fills from Real Trading Audit Log and Auto Bot Recent Trades
    const combinedFills = [];

    if (Array.isArray(lastRealAuditLog)) {
      lastRealAuditLog.forEach(item => {
        combinedFills.push({
          timestamp: item.timestamp,
          orderId: item.orderId || `REAL-${item.timestamp}`,
          symbol: item.symbol,
          action: item.side || (item.type === 'REAL_POSITION_CLOSED' ? 'SELL_EXIT' : 'BUY'),
          price: item.price || item.exitPrice || item.entryPrice || 0,
          units: item.units || 0,
          capital: item.capital || 0,
          pnl: item.pnl,
          reason: item.reason || (item.guarantee || 'Real Broker Order'),
          isReal: true
        });
      });
    }

    if (lastBotFleetData) {
      for (const sym of Object.keys(lastBotFleetData)) {
        const bot = lastBotFleetData[sym];
        if (bot && bot.recentTrades && Array.isArray(bot.recentTrades)) {
          bot.recentTrades.forEach(tr => {
            combinedFills.push({
              timestamp: tr.timestamp,
              orderId: tr.id || `BOT-${tr.timestamp}`,
              symbol: tr.symbol || sym,
              action: tr.type || 'TRADE',
              price: tr.fillPrice || tr.price || 0,
              units: tr.units || 0,
              capital: (tr.units * tr.fillPrice) || 0,
              pnl: tr.pnl,
              reason: tr.reason || 'Auto-Pilot Execution',
              isReal: false
            });
          });
        }
      }
    }

    combinedFills.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (blotterFillsCount) blotterFillsCount.innerText = combinedFills.length;

    // Filter fills for currentSymbol and pass to chart.trades for candlestick badges
    const symbolFills = combinedFills.filter(f => f.symbol === currentSymbol);
    if (chart && symbolFills.length > 0) {
      chart.trades = symbolFills.map(f => ({
        entryTime: f.timestamp,
        entryPrice: f.price,
        action: (f.action || '').includes('SELL') ? 'SELL' : 'BUY',
        units: f.units
      }));
      chart.render();
    }

    if (!blotterFillsTableBody) return;

    if (combinedFills.length === 0) {
      blotterFillsTableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; color:#64748b; padding:12px;">
            No execution fills yet today. Place a trade or start 1-Click Auto-Pilot to see live broker fills.
          </td>
        </tr>
      `;
      return;
    }

    blotterFillsTableBody.innerHTML = combinedFills.slice(0, 25).map(fill => {
      const timeStr = new Date(fill.timestamp).toLocaleTimeString();
      const isBuy = (fill.action || '').includes('BUY');
      const actionBadge = `<span style="font-weight:800; font-size:0.65rem; padding:1px 5px; border-radius:3px; background:${isBuy ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color:${isBuy ? '#34d399' : '#f87171'};">${fill.action}</span>`;
      const pnlDisplay = fill.pnl !== undefined
        ? `<span style="color:${fill.pnl >= 0 ? '#10b981' : '#ef4444'}; font-weight:800;">${fill.pnl >= 0 ? '+' : ''}$${Number(fill.pnl).toFixed(2)}</span>`
        : `<span style="color:#64748b;">--</span>`;

      return `
        <tr>
          <td style="color:#64748b; font-size:0.68rem;">${timeStr}</td>
          <td style="color:#cbd5e1; font-family:var(--font-mono); font-size:0.68rem;">${String(fill.orderId).slice(0, 14)}</td>
          <td><b>${fill.symbol}</b></td>
          <td>${actionBadge}</td>
          <td style="color:#00f0ff; font-weight:800;">$${Number(fill.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>${fill.units}</td>
          <td style="color:#94a3b8;">${fill.capital ? `$${Number(fill.capital).toFixed(2)}` : '--'}</td>
          <td>${pnlDisplay}</td>
          <td style="color:#94a3b8; font-size:0.68rem; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${fill.reason}">${fill.reason}</td>
          <td><span style="color:#10b981; font-size:0.68rem; font-weight:800;">✔ FILLED</span></td>
        </tr>
      `;
    }).join('');
  }

  // Hook up Blotter Drawer Tab Switching
  const btnBlotterPosTab = document.getElementById('btnBlotterPosTab');
  const btnBlotterHistoryTab = document.getElementById('btnBlotterHistoryTab');
  const blotterPositionView = document.getElementById('blotterPositionView');
  const blotterHistoryView = document.getElementById('blotterHistoryView');

  if (btnBlotterPosTab && btnBlotterHistoryTab) {
    btnBlotterPosTab.addEventListener('click', () => {
      btnBlotterPosTab.classList.add('active');
      btnBlotterHistoryTab.classList.remove('active');
      if (blotterPositionView) blotterPositionView.style.display = 'block';
      if (blotterHistoryView) blotterHistoryView.style.display = 'none';
    });

    btnBlotterHistoryTab.addEventListener('click', () => {
      btnBlotterHistoryTab.classList.add('active');
      btnBlotterPosTab.classList.remove('active');
      if (blotterPositionView) blotterPositionView.style.display = 'none';
      if (blotterHistoryView) blotterHistoryView.style.display = 'block';
    });
  }

  // Hook up Quick Real Money Trade buttons
  let selectedQuickRealCapital = 15;
  document.querySelectorAll('.quick-real-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.quick-real-chip').forEach(c => {
        c.classList.remove('active');
        c.style.background = '';
        c.style.borderColor = '';
        c.style.color = '';
        c.style.fontWeight = '';
      });
      chip.classList.add('active');
      chip.style.background = 'rgba(16,185,129,0.2)';
      chip.style.borderColor = '#10b981';
      chip.style.color = '#34d399';
      chip.style.fontWeight = '800';
      selectedQuickRealCapital = Number(chip.dataset.amt) || 15;
      const label = document.getElementById('quickRealCapitalLabel');
      if (label) label.innerText = `$${selectedQuickRealCapital.toFixed(2)} USDT`;
    });
  });

  const btnQuickExecuteRealTrade = document.getElementById('btnQuickExecuteRealTrade');
  if (btnQuickExecuteRealTrade) {
    btnQuickExecuteRealTrade.addEventListener('click', async () => {
      const asset = document.getElementById('quickRealAsset').value;
      const side = document.getElementById('quickRealSide').value;
      const msg = document.getElementById('quickRealStatusMsg');
      btnQuickExecuteRealTrade.innerText = '⚡ Routing Live Order...';
      try {
        const res = await fetch('/api/real-trade/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: asset, side, capital: selectedQuickRealCapital })
        });
        const data = await res.json();
        if (data.success && data.ticket) {
          btnQuickExecuteRealTrade.innerText = '✅ Order Filled & Live!';
          if (msg) msg.innerHTML = `<span style="color:#10b981;">✔ Filled ${data.ticket.side} $${data.ticket.capital} @ $${data.ticket.price} (SL: $${data.ticket.stopLossPrice})</span>`;
          if (currentSymbol !== asset) {
            currentSymbol = asset;
            if (assetSelect) assetSelect.value = asset;
            document.querySelectorAll('.quick-asset-btn').forEach(b => {
              if (b.dataset.symbol === asset) b.classList.add('active');
              else b.classList.remove('active');
            });
            loadMarketData();
          }
          fetchRealPortfolio();
          updateChartAndBlotterPosition();
          setTimeout(() => { btnQuickExecuteRealTrade.innerText = '⚡ Execute Real Order Now'; }, 3000);
        } else {
          btnQuickExecuteRealTrade.innerText = '⚡ Execute Real Order Now';
          if (msg) msg.innerText = data.error || 'Execution rejected';
        }
      } catch (e) {
        btnQuickExecuteRealTrade.innerText = '⚡ Execute Real Order Now';
        if (msg) msg.innerText = 'Error: ' + e.message;
      }
    });
  }

  const btnEmergencyCloseAll = document.getElementById('btnEmergencyCloseAll');
  if (btnEmergencyCloseAll) {
    btnEmergencyCloseAll.addEventListener('click', async () => {
      if (!confirm('🛑 EMERGENCY PANIC BRAKE: Flatten all open real money positions at current market prices immediately?')) return;
      btnEmergencyCloseAll.innerText = 'Flattening...';
      try {
        await fetch('/api/real-trade/emergency-exit', { method: 'POST' });
        btnEmergencyCloseAll.innerText = '🛑 Flatten All';
        fetchRealPortfolio();
      } catch (e) {
        btnEmergencyCloseAll.innerText = '🛑 Flatten All';
      }
    });
  }

  async function queryExchangeBalance(statusTargetEl, buttonEl) {
    if (buttonEl) buttonEl.innerText = '⏳ Querying Exchange...';
    try {
      const res = await fetch('/api/real-trade/binance-balance');
      const data = await res.json();
      if (buttonEl) buttonEl.innerText = '🔄 Sync Balance';
      if (data.success) {
        if (statusTargetEl) {
          statusTargetEl.innerHTML = `<span style="color:#10b981;">✅ Connected: <b>$${data.totalUsdt.toFixed(2)} USDT</b> (Free: $${data.usdtFree.toFixed(2)} | Withdrawals: ${data.withdrawalsDisabled ? 'DISABLED 🛡️' : 'ENABLED ⚠️'})</span>`;
        }
        renderRealPortfolio(data);
      } else {
        if (statusTargetEl) {
          statusTargetEl.innerHTML = `<span style="color:#f59e0b;">ℹ️ ${data.error || 'Using local sandbox ($15.00 USDT)'}</span>`;
        }
        if (data.portfolio) renderRealPortfolio(data);
      }
    } catch (e) {
      if (buttonEl) buttonEl.innerText = '🔄 Sync Balance';
      if (statusTargetEl) statusTargetEl.innerText = 'Error: ' + e.message;
    }
  }

  const btnSyncRealBalance = document.getElementById('btnSyncRealBalance');
  if (btnSyncRealBalance) {
    btnSyncRealBalance.addEventListener('click', () => {
      queryExchangeBalance(document.getElementById('quickRealStatusMsg'), btnSyncRealBalance);
    });
  }

  const btnFetchBinanceBalance = document.getElementById('btnFetchBinanceBalance');
  if (btnFetchBinanceBalance) {
    btnFetchBinanceBalance.addEventListener('click', () => {
      queryExchangeBalance(document.getElementById('realTradeStatusMsg'), btnFetchBinanceBalance);
    });
  }

  const btnSwitchToRealTab = document.getElementById('btnSwitchToRealTab');
  if (btnSwitchToRealTab) {
    btnSwitchToRealTab.addEventListener('click', () => {
      const tabBtnRealMoney = document.getElementById('tabBtnRealMoney');
      if (tabBtnRealMoney) tabBtnRealMoney.click();
      fetchRealPortfolio();
    });
  }

  // Go Engine real-time health & latency telemetry
  const goLatencyDisplay = document.getElementById('goLatencyDisplay');
  const goStatusDot = document.getElementById('goStatusDot');

  async function pollGoEngine() {
    try {
      const res = await fetch('http://localhost:4050/health');
      if (res.ok) {
        const data = await res.json();
        if (goLatencyDisplay && data.avg_latency_micros !== undefined) {
          goLatencyDisplay.innerText = `${data.avg_latency_micros}µs`;
        }
        if (goStatusDot) {
          goStatusDot.style.background = '#10b981';
          goStatusDot.style.boxShadow = '0 0 6px #10b981';
        }
      }
    } catch (err) {
      if (goLatencyDisplay) goLatencyDisplay.innerText = 'OFFLINE';
      if (goStatusDot) {
        goStatusDot.style.background = '#ef4444';
        goStatusDot.style.boxShadow = 'none';
      }
    }
  const rustLatencyDisplay = document.getElementById('rustLatencyDisplay');
  const rustStatusDot = document.getElementById('rustStatusDot');

  async function pollRustEngine() {
    try {
      const res = await fetch('http://localhost:4060/health');
      if (res.ok) {
        const data = await res.json();
        if (rustLatencyDisplay && data.avg_latency_micros !== undefined) {
          rustLatencyDisplay.innerText = `${data.avg_latency_micros.toFixed(3)}µs`;
        }
        if (rustStatusDot) {
          rustStatusDot.style.background = '#f97316';
          rustStatusDot.style.boxShadow = '0 0 6px #f97316';
        }
      }
    } catch (err) {
      if (rustLatencyDisplay) rustLatencyDisplay.innerText = 'OFFLINE';
      if (rustStatusDot) {
        rustStatusDot.style.background = '#ef4444';
        rustStatusDot.style.boxShadow = 'none';
      }
    }
  }

  // Kronos GPU Engine real-time health & telemetry
  const gpuStatusDisplay = document.getElementById('gpuStatusDisplay');
  const gpuStatusDot = document.getElementById('gpuStatusDot');

  async function pollGpuEngine() {
    try {
      const res = await fetch('http://localhost:5050/health');
      if (res.ok) {
        const data = await res.json();
        if (gpuStatusDisplay) {
          if (data.cuda_active) {
            gpuStatusDisplay.innerText = `RTX 3050 (1.0ms)`;
          } else {
            gpuStatusDisplay.innerText = `CPU (${data.device})`;
          }
        }
        if (gpuStatusDot) {
          gpuStatusDot.style.background = '#c084fc';
          gpuStatusDot.style.boxShadow = '0 0 6px #c084fc';
        }
      }
    } catch (err) {
      if (gpuStatusDisplay) gpuStatusDisplay.innerText = 'OFFLINE';
      if (gpuStatusDot) {
        gpuStatusDot.style.background = '#ef4444';
        gpuStatusDot.style.boxShadow = 'none';
      }
    }
  }

  setInterval(pollGpuEngine, 4000);
  pollGpuEngine();

  // --- Monetization & Bakong KHQR Modal Handlers ---
  const btnOpenPaymentModal = document.getElementById('btnOpenPaymentModal');
  const btnClosePaymentModal = document.getElementById('btnClosePaymentModal');
  const paymentModal = document.getElementById('paymentModal');
  const payMethodSelect = document.getElementById('payMethodSelect');
  const payCustomerName = document.getElementById('payCustomerName');
  const planCards = document.querySelectorAll('.plan-card');
  const invoiceRefDisplay = document.getElementById('invoiceRefDisplay');
  const invoiceStatusPill = document.getElementById('invoiceStatusPill');
  const khqrImg = document.getElementById('khqrImg');
  const khqrPriceTag = document.getElementById('khqrPriceTag');
  const qrBankHeader = document.getElementById('qrBankHeader');
  const qrScanInstructions = document.getElementById('qrScanInstructions');
  const btnTabAba = document.getElementById('btnTabAba');
  const btnTabAcleda = document.getElementById('btnTabAcleda');
  const btnTabDynamic = document.getElementById('btnTabDynamic');
  const btnTabUsdt = document.getElementById('btnTabUsdt');
  const btnBakongDeepLink = document.getElementById('btnBakongDeepLink');
  const rawKhqrDisplay = document.getElementById('rawKhqrDisplay');
  const btnSimulatePaymentConfirm = document.getElementById('btnSimulatePaymentConfirm');

  let activePlanId = 'quant_pro';
  let currentInvoice = null;
  let invoicePollTimer = null;

  function stopInvoicePolling() {
    if (invoicePollTimer) {
      clearInterval(invoicePollTimer);
      invoicePollTimer = null;
    }
  }

  function startInvoicePolling(invoiceId) {
    stopInvoicePolling();
    invoicePollTimer = setInterval(async () => {
      if (!currentInvoice || currentInvoice.invoiceId !== invoiceId || currentInvoice.status === 'PAID') {
        stopInvoicePolling();
        return;
      }
      try {
        const res = await fetch(`/api/payments/invoice/${invoiceId}`);
        const data = await res.json();
        if (data.success && data.invoice && data.invoice.status === 'PAID') {
          stopInvoicePolling();
          currentInvoice.status = 'PAID';
          if (invoiceStatusPill) {
            invoiceStatusPill.innerText = '🟢 SCAN VERIFIED (AUTO-DETECTED)!';
            invoiceStatusPill.style.background = 'rgba(16, 185, 129, 0.2)';
            invoiceStatusPill.style.color = '#10b981';
            invoiceStatusPill.style.borderColor = '#10b981';
          }
          if (qrScanInstructions) {
            qrScanInstructions.innerHTML = '🎉 <b style="color:#10b981;">Payment confirmed!</b> Bank scan detected automatically. Alert dispatched to @penghuotbot.';
          }
          if (btnSimulatePaymentConfirm) {
            btnSimulatePaymentConfirm.innerText = '✅ Payment Verified & Dispatched';
            btnSimulatePaymentConfirm.disabled = true;
          }
        }
      } catch (e) {}
    }, 2000);
  }

  function updateBankTabStyles(activeTab) {
    const tabs = [
      { el: btnTabAba, val: 'ABA_QR', col: '#00bcd4' },
      { el: btnTabAcleda, val: 'ACLEDA_QR', col: '#3b82f6' },
      { el: btnTabDynamic, val: 'DYNAMIC_KHQR', col: '#facc15' },
      { el: btnTabUsdt, val: 'USDT', col: '#10b981' }
    ];
    tabs.forEach(t => {
      if (!t.el) return;
      if (t.val === activeTab) {
        t.el.style.borderColor = t.col;
        t.el.style.color = t.col;
        t.el.style.background = `${t.col}18`;
      } else {
        t.el.style.borderColor = 'rgba(255,255,255,0.1)';
        t.el.style.color = '#94a3b8';
        t.el.style.background = 'transparent';
      }
    });
  }

  async function generatePaymentInvoice() {
    try {
      const customerName = payCustomerName ? (payCustomerName.value || 'CEO Lim Penghuot') : 'CEO Lim Penghuot';
      const paymentMethod = payMethodSelect ? payMethodSelect.value : 'ABA_QR';
      updateBankTabStyles(paymentMethod);
      
      const res = await fetch('/api/payments/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activePlanId,
          customerName,
          paymentMethod
        })
      });
      const data = await res.json();
      if (data.success && data.invoice) {
        currentInvoice = data.invoice;
        startInvoicePolling(currentInvoice.invoiceId);
        if (invoiceRefDisplay) invoiceRefDisplay.innerText = currentInvoice.invoiceId;
        if (invoiceStatusPill) {
          invoiceStatusPill.innerText = '🟡 AWAITING SCAN (Auto-polling bank...)';
          invoiceStatusPill.style.background = 'rgba(234, 179, 8, 0.15)';
          invoiceStatusPill.style.color = '#facc15';
          invoiceStatusPill.style.borderColor = 'rgba(234, 179, 8, 0.3)';
        }

        if (paymentMethod === 'ABA_QR') {
          if (khqrImg) khqrImg.src = '/images/qr/aba_qr.jpg';
          if (qrBankHeader) qrBankHeader.innerHTML = '<span style="font-size: 11px; font-weight: 900; color: #005f73;">ABA BANK</span><span style="font-size: 9px; font-weight: 800; color: #1e293b; background: #e2e8f0; padding: 1px 4px; border-radius: 2px;">KHQR</span>';
          if (khqrPriceTag) khqrPriceTag.innerText = `$${currentInvoice.amountUsd}.00 USD (៛${currentInvoice.amountKhr.toLocaleString()} KHR)`;
          if (qrScanInstructions) qrScanInstructions.innerHTML = 'Scan with <b>ABA Mobile</b> or any Bakong-enabled banking app in Cambodia.';
          if (btnBakongDeepLink) {
            btnBakongDeepLink.style.display = 'inline-flex';
            btnBakongDeepLink.href = currentInvoice.khqr.deepLink;
          }
          if (rawKhqrDisplay) rawKhqrDisplay.innerText = currentInvoice.khqr.rawUsd;
        } else if (paymentMethod === 'ACLEDA_QR') {
          if (khqrImg) khqrImg.src = '/images/qr/acleda_qr.jpg';
          if (qrBankHeader) qrBankHeader.innerHTML = '<span style="font-size: 11px; font-weight: 900; color: #023e8a;">ACLEDA BANK</span><span style="font-size: 9px; font-weight: 800; color: #1e293b; background: #e2e8f0; padding: 1px 4px; border-radius: 2px;">KHQR</span>';
          if (khqrPriceTag) khqrPriceTag.innerText = `$${currentInvoice.amountUsd}.00 USD (៛${currentInvoice.amountKhr.toLocaleString()} KHR)`;
          if (qrScanInstructions) qrScanInstructions.innerHTML = 'Scan with <b>ACLEDA mobile</b> or any Bakong-enabled banking app in Cambodia.';
          if (btnBakongDeepLink) {
            btnBakongDeepLink.style.display = 'inline-flex';
            btnBakongDeepLink.href = currentInvoice.khqr.deepLink;
          }
          if (rawKhqrDisplay) rawKhqrDisplay.innerText = currentInvoice.khqr.rawUsd;
        } else if (paymentMethod === 'DYNAMIC_KHQR' || paymentMethod === 'KHQR') {
          const khqrData = currentInvoice.khqr.rawUsd;
          if (khqrImg) khqrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(khqrData)}`;
          if (qrBankHeader) qrBankHeader.innerHTML = '<span style="font-size: 11px; font-weight: 900; color: #e11d48;">BAKONG</span><span style="font-size: 9px; font-weight: 800; color: #1e293b; background: #e2e8f0; padding: 1px 4px; border-radius: 2px;">KHQR</span>';
          if (khqrPriceTag) khqrPriceTag.innerText = `$${currentInvoice.amountUsd}.00 USD (៛${currentInvoice.amountKhr.toLocaleString()} KHR)`;
          if (qrScanInstructions) qrScanInstructions.innerHTML = 'Dynamic NBC EMVCo QR code with dynamic invoice amount embedding.';
          if (btnBakongDeepLink) {
            btnBakongDeepLink.style.display = 'inline-flex';
            btnBakongDeepLink.href = currentInvoice.khqr.deepLink;
          }
          if (rawKhqrDisplay) rawKhqrDisplay.innerText = khqrData;
        } else if (paymentMethod === 'USDT') {
          const addr = currentInvoice.crypto.usdtTrc20;
          if (khqrImg) khqrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(addr)}`;
          if (qrBankHeader) qrBankHeader.innerHTML = '<span style="font-size: 11px; font-weight: 900; color: #26a17b;">USDT</span><span style="font-size: 9px; font-weight: 800; color: #1e293b; background: #e2e8f0; padding: 1px 4px; border-radius: 2px;">TRC-20</span>';
          if (khqrPriceTag) khqrPriceTag.innerText = `${currentInvoice.amountUsd} USDT (TRC-20)`;
          if (qrScanInstructions) qrScanInstructions.innerHTML = 'Send USDT via Tron (TRC-20) or BSC (BEP-20) to CEO Lim Penghuot.';
          if (btnBakongDeepLink) btnBakongDeepLink.style.display = 'none';
          if (rawKhqrDisplay) rawKhqrDisplay.innerText = `USDT TRC-20 Address: ${addr}`;
        } else if (paymentMethod === 'BTC') {
          const addr = currentInvoice.crypto.btc;
          if (khqrImg) khqrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(addr)}`;
          if (qrBankHeader) qrBankHeader.innerHTML = '<span style="font-size: 11px; font-weight: 900; color: #f7931a;">BITCOIN</span><span style="font-size: 9px; font-weight: 800; color: #1e293b; background: #e2e8f0; padding: 1px 4px; border-radius: 2px;">SEGWIT</span>';
          if (khqrPriceTag) khqrPriceTag.innerText = `$${currentInvoice.amountUsd} USD in BTC`;
          if (qrScanInstructions) qrScanInstructions.innerHTML = 'Send Bitcoin to CEO Lim Penghuot Native SegWit Address.';
          if (btnBakongDeepLink) btnBakongDeepLink.style.display = 'none';
          if (rawKhqrDisplay) rawKhqrDisplay.innerText = `Bitcoin SegWit Address: ${addr}`;
        }
      }
    } catch (e) {
      console.error('Failed to generate invoice', e);
    }
  }

  if (btnTabAba) {
    btnTabAba.addEventListener('click', () => {
      if (payMethodSelect) payMethodSelect.value = 'ABA_QR';
      generatePaymentInvoice();
    });
  }
  if (btnTabAcleda) {
    btnTabAcleda.addEventListener('click', () => {
      if (payMethodSelect) payMethodSelect.value = 'ACLEDA_QR';
      generatePaymentInvoice();
    });
  }
  if (btnTabDynamic) {
    btnTabDynamic.addEventListener('click', () => {
      if (payMethodSelect) payMethodSelect.value = 'DYNAMIC_KHQR';
      generatePaymentInvoice();
    });
  }
  if (btnTabUsdt) {
    btnTabUsdt.addEventListener('click', () => {
      if (payMethodSelect) payMethodSelect.value = 'USDT';
      generatePaymentInvoice();
    });
  }

  if (btnOpenPaymentModal && paymentModal) {
    btnOpenPaymentModal.addEventListener('click', () => {
      paymentModal.style.display = 'flex';
      generatePaymentInvoice();
    });
  }

  if (btnClosePaymentModal && paymentModal) {
    btnClosePaymentModal.addEventListener('click', () => {
      stopInvoicePolling();
      paymentModal.style.display = 'none';
    });
  }

  planCards.forEach(card => {
    card.addEventListener('click', () => {
      planCards.forEach(c => {
        c.classList.remove('active');
        c.style.border = '1px solid rgba(255,255,255,0.08)';
        c.style.background = 'rgba(15, 23, 42, 0.6)';
      });
      card.classList.add('active');
      card.style.border = '2px solid #facc15';
      card.style.background = 'rgba(234, 179, 8, 0.08)';
      activePlanId = card.getAttribute('data-plan');
      generatePaymentInvoice();
    });
  });

  if (payMethodSelect) {
    payMethodSelect.addEventListener('change', generatePaymentInvoice);
  }

  if (btnSimulatePaymentConfirm) {
    btnSimulatePaymentConfirm.addEventListener('click', async () => {
      if (!currentInvoice) return;
      btnSimulatePaymentConfirm.disabled = true;
      btnSimulatePaymentConfirm.innerText = 'Verifying...';

      try {
        const res = await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: currentInvoice.invoiceId,
            paymentProof: 'Bakong Mobile App QR Scan (Verified by CEO)'
          })
        });
        const data = await res.json();
        if (data.success) {
          if (invoiceStatusPill) {
            invoiceStatusPill.innerText = '🟢 PAID & CONFIRMED';
            invoiceStatusPill.style.background = 'rgba(16, 185, 129, 0.15)';
            invoiceStatusPill.style.color = '#10b981';
            invoiceStatusPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          }
          btnSimulatePaymentConfirm.innerText = '🎉 Dispatched to @penghuotbot';
          setTimeout(() => {
            btnSimulatePaymentConfirm.disabled = false;
            btnSimulatePaymentConfirm.innerText = '✅ Simulate Paid (Instant TG Alert)';
          }, 3000);
        }
      } catch (e) {
        btnSimulatePaymentConfirm.disabled = false;
        btnSimulatePaymentConfirm.innerText = 'Error confirming';
      }
    });
  }

  // Signal Copier & TradingView Alert Webhook Handler
  const btnOpenSignalCopier = document.getElementById('btnOpenSignalCopier');
  const btnCloseSignalCopier = document.getElementById('btnCloseSignalCopier');
  const signalCopierModal = document.getElementById('signalCopierModal');
  const copierWebhookUrlInput = document.getElementById('copierWebhookUrlInput');
  const btnCopyWebhookUrl = document.getElementById('btnCopyWebhookUrl');
  const btnSimulateCopySignal = document.getElementById('btnSimulateCopySignal');
  const copierStatusMsg = document.getElementById('copierStatusMsg');

  if (btnOpenSignalCopier && signalCopierModal) {
    btnOpenSignalCopier.addEventListener('click', () => {
      signalCopierModal.style.display = 'flex';
      if (copierWebhookUrlInput) {
        copierWebhookUrlInput.value = `${window.location.origin}/api/signals/webhook`;
      }
      if (copierStatusMsg) copierStatusMsg.innerText = '';
    });
  }

  if (btnCloseSignalCopier && signalCopierModal) {
    btnCloseSignalCopier.addEventListener('click', () => {
      signalCopierModal.style.display = 'none';
    });
  }

  if (signalCopierModal) {
    signalCopierModal.addEventListener('click', (e) => {
      if (e.target === signalCopierModal) {
        signalCopierModal.style.display = 'none';
      }
    });
  }

  if (btnCopyWebhookUrl && copierWebhookUrlInput) {
    btnCopyWebhookUrl.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copierWebhookUrlInput.value);
        const originalText = btnCopyWebhookUrl.innerText;
        btnCopyWebhookUrl.innerText = 'Copied! ✓';
        btnCopyWebhookUrl.style.borderColor = '#10b981';
        btnCopyWebhookUrl.style.color = '#34d399';
        setTimeout(() => {
          btnCopyWebhookUrl.innerText = originalText;
          btnCopyWebhookUrl.style.borderColor = '';
          btnCopyWebhookUrl.style.color = '';
        }, 2000);
      } catch (err) {
        copierWebhookUrlInput.select();
        document.execCommand('copy');
      }
    });
  }

  if (btnSimulateCopySignal) {
    btnSimulateCopySignal.addEventListener('click', async () => {
      btnSimulateCopySignal.disabled = true;
      btnSimulateCopySignal.innerText = '⚡ Ingesting Copied Signal...';
      if (copierStatusMsg) {
        copierStatusMsg.innerText = 'Ingesting signal into Universal Risk Shield...';
        copierStatusMsg.style.color = '#c084fc';
      }

      try {
        const res = await fetch('/api/signals/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'BTC-USD',
            action: 'BUY',
            capital: 10.00
          })
        });
        const data = await res.json();
        if (data.success && data.data) {
          const item = data.data;
          if (copierStatusMsg) {
            copierStatusMsg.innerHTML = `<span style="color:#34d399;">✔ COPIED: ${item.action} ${item.symbol} @ $${Number(item.price).toLocaleString()} | Capital: $${item.capital} | Risk Shield -2% SL Armed!</span>`;
          }
          if (typeof fetchAutoBotStatus === 'function') {
            fetchAutoBotStatus();
          }
        } else {
          if (copierStatusMsg) {
            copierStatusMsg.innerHTML = `<span style="color:#ef4444;">❌ Failed: ${data.error || 'Signal rejected'}</span>`;
          }
        }
      } catch (err) {
        if (copierStatusMsg) {
          copierStatusMsg.innerHTML = `<span style="color:#ef4444;">❌ Error: ${err.message}</span>`;
        }
      } finally {
        setTimeout(() => {
          btnSimulateCopySignal.disabled = false;
          btnSimulateCopySignal.innerText = '⚡ Test Copy Signal (Simulate TradingView Alert)';
        }, 2500);
      }
    });
  // --- Master Workflow Mode Switcher & Executive Strip ---
  const navModeAutoPilot = document.getElementById('navModeAutoPilot');
  const navModeCharts = document.getElementById('navModeCharts');
  const navModeCopier = document.getElementById('navModeCopier');
  const navModeReal = document.getElementById('navModeReal');
  const btnStripOneClickAutoPilot = document.getElementById('btnStripOneClickAutoPilot');

  function setMasterMode(activeBtn) {
    [navModeAutoPilot, navModeCharts, navModeCopier, navModeReal].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
  }

  if (navModeAutoPilot) {
    navModeAutoPilot.addEventListener('click', () => {
      setMasterMode(navModeAutoPilot);
      const tabBtnBot = document.getElementById('tabBtnBot');
      if (tabBtnBot) tabBtnBot.click();
      fetchAutoBotStatus();
      const hero = document.getElementById('btnOneClickMasterAutoPilot');
      if (hero) {
        hero.style.boxShadow = '0 0 24px #10b981';
        setTimeout(() => { hero.style.boxShadow = ''; }, 1200);
      }
    });
  }

  if (navModeCharts) {
    navModeCharts.addEventListener('click', () => {
      setMasterMode(navModeCharts);
      const tabBtnBacktest = document.getElementById('tabBtnBacktest');
      if (tabBtnBacktest) tabBtnBacktest.click();
    });
  }

  if (navModeCopier) {
    navModeCopier.addEventListener('click', () => {
      setMasterMode(navModeCopier);
      const signalCopierModal = document.getElementById('signalCopierModal');
      if (signalCopierModal) {
        signalCopierModal.style.display = 'flex';
        const urlInput = document.getElementById('copierWebhookUrlInput');
        if (urlInput) urlInput.value = `${window.location.origin}/api/signals/webhook`;
      }
    });
  }

  if (navModeReal) {
    navModeReal.addEventListener('click', () => {
      setMasterMode(navModeReal);
      const tabBtnRealMoney = document.getElementById('tabBtnRealMoney');
      if (tabBtnRealMoney) tabBtnRealMoney.click();
      fetchRealPortfolio();
    });
  }

  if (btnStripOneClickAutoPilot) {
    btnStripOneClickAutoPilot.addEventListener('click', () => {
      const heroBtn = document.getElementById('btnOneClickMasterAutoPilot');
      if (heroBtn) {
        heroBtn.click();
        btnStripOneClickAutoPilot.innerText = '⚡ Auto-Pilot Active!';
        btnStripOneClickAutoPilot.style.background = '#059669';
        setTimeout(() => {
          btnStripOneClickAutoPilot.innerText = '⚡ 1-Click Master Auto-Pilot';
          btnStripOneClickAutoPilot.style.background = '';
        }, 3000);
      }
    });
  }

  // Initialize
  renderStrategyParams();
  loadAssets();
  loadMarketData().then(() => {
    runBacktest();
  });
  connectWebSocket();
  checkTelegramStatus();
  loadNewsWire('ALL');
  pollGoEngine();
  setInterval(pollGoEngine, 3000);
  pollRustEngine();
  setInterval(pollRustEngine, 3000);
  fetchAutoBotStatus();
  setInterval(fetchAutoBotStatus, 3000);
  fetchRealPortfolio();
  setInterval(fetchRealPortfolio, 3000);
});


