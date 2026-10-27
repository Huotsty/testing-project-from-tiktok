/**
 * AlphaForge High-Performance Canvas Financial Chart Engine
 * Institutional-Grade Rendering for Candlesticks, Volume bars, Overlay Indicators
 * (SMA, EMA, Bollinger, VWAP), Live Laser Price Line, Risk Bracket Overlays (SL/TP),
 * Execution Markers, and Subcharts (RSI, MACD, Equity Curve with Gradient Fill).
 * Optimized for Retina HiDPI displays & smooth 60fps micro-interactions.
 */

class ChartEngine {
  constructor(mainCanvasId, subCanvasId) {
    this.mainCanvas = document.getElementById(mainCanvasId);
    this.mainCtx = this.mainCanvas.getContext('2d');
    
    this.subCanvas = document.getElementById(subCanvasId);
    this.subCtx = this.subCanvas.getContext('2d');

    this.candles = [];
    this.indicators = {};
    this.trades = [];
    this.equityCurve = [];
    this.benchmarkCurve = [];
    this.activeBracket = null; // { entryPrice, stopLossPrice, takeProfitPrice, side }

    this.subchartMode = 'rsi'; // 'rsi', 'macd', 'equity'
    
    // Indicator visibility toggles
    this.showEma = true;
    this.showSma = false;
    this.showBB = false;
    this.showVWAP = true;
    this.showVolume = true;
    this.showKronos = true;
    this.kronosForecast = null;

    // Viewport & Pan/Zoom
    this.candleWidth = 8;
    this.candleGap = 3;
    this.paddingRight = 72; // Price scale margin
    this.paddingBottom = 24; // Time scale margin
    this.viewOffset = 0; // Number of candles scrolled from right

    // Mouse / Crosshair
    this.mouseX = -1;
    this.mouseY = -1;
    this.isHovering = false;

    this.initEvents();
    this.resize();
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.resize();
      this.render();
    });

    const handleMouseMove = (e, canvas) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.isHovering = true;
      this.render();
    };

    const handleMouseLeave = () => {
      this.isHovering = false;
      this.mouseX = -1;
      this.mouseY = -1;
      this.render();
      this.updateHud(null);
    };

    this.mainCanvas.addEventListener('mousemove', (e) => handleMouseMove(e, this.mainCanvas));
    this.mainCanvas.addEventListener('mouseleave', handleMouseLeave);

    // Zoom on wheel
    this.mainCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        this.candleWidth = Math.min(28, this.candleWidth + 1);
      } else {
        this.candleWidth = Math.max(3, this.candleWidth - 1);
      }
      this.render();
    }, { passive: false });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    
    const mainRect = this.mainCanvas.parentElement.getBoundingClientRect();
    this.mainCanvas.width = mainRect.width * dpr;
    this.mainCanvas.height = mainRect.height * dpr;
    this.mainCtx.scale(dpr, dpr);
    this.mainWidth = mainRect.width;
    this.mainHeight = mainRect.height;

    const subRect = this.subCanvas.parentElement.getBoundingClientRect();
    this.subCanvas.width = subRect.width * dpr;
    this.subCanvas.height = subRect.height * dpr;
    this.subCtx.scale(dpr, dpr);
    this.subWidth = subRect.width;
    this.subHeight = subRect.height;
  }

  setData(candles, indicators = {}, trades = [], equityCurve = [], benchmarkCurve = []) {
    this.candles = candles || [];
    this.indicators = indicators || {};
    this.trades = trades || [];
    this.equityCurve = equityCurve || [];
    this.benchmarkCurve = benchmarkCurve || [];
    this.render();
  }

  setActiveBracket(bracket) {
    this.activeBracket = bracket;
    this.render();
  }

  render() {
    if (!this.candles || this.candles.length === 0) return;
    this.renderMainChart();
    this.renderSubChart();
  }

  renderMainChart() {
    const ctx = this.mainCtx;
    const w = this.mainWidth;
    const h = this.mainHeight;
    const plotH = h - this.paddingBottom;
    const plotW = w - this.paddingRight;

    ctx.clearRect(0, 0, w, h);

    // Determine visible candle window
    const totalCandleSpace = this.candleWidth + this.candleGap;
    const maxVisibleCandles = Math.floor(plotW / totalCandleSpace);
    const endIndex = Math.max(0, this.candles.length - this.viewOffset);
    const startIndex = Math.max(0, endIndex - maxVisibleCandles);
    const visibleCandles = this.candles.slice(startIndex, endIndex);

    if (visibleCandles.length === 0) return;

    // Price scaling (min and max)
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;

    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVol) maxVol = c.volume;
    }

    // Include active bracket levels in scaling so they never clip
    if (this.activeBracket) {
      if (this.activeBracket.stopLossPrice) minPrice = Math.min(minPrice, this.activeBracket.stopLossPrice);
      if (this.activeBracket.takeProfitPrice) maxPrice = Math.max(maxPrice, this.activeBracket.takeProfitPrice);
    }

    // Include Kronos forecast cone in price bounds so future projections never clip
    if (this.showKronos && this.kronosForecast) {
      if (this.kronosForecast.upperCone90) {
        for (const p of this.kronosForecast.upperCone90) {
          if (p && p > maxPrice) maxPrice = p;
        }
      }
      if (this.kronosForecast.lowerCone10) {
        for (const p of this.kronosForecast.lowerCone10) {
          if (p && p < minPrice) minPrice = p;
        }
      }
    }

    // Add breathing room
    const priceRange = (maxPrice - minPrice) || 1;
    minPrice -= priceRange * 0.05;
    maxPrice += priceRange * 0.05;

    const getY = (price) => plotH - ((price - minPrice) / (maxPrice - minPrice)) * plotH;
    const getX = (i) => plotW - (visibleCandles.length - i) * totalCandleSpace + (this.candleWidth / 2);

    // Draw Price Grid & Axes
    this.drawMainGrid(ctx, plotW, plotH, minPrice, maxPrice, visibleCandles);

    // Draw Volume Bars in background with vertical gradient
    if (this.showVolume && maxVol > 0) {
      const volAreaH = plotH * 0.22;
      for (let i = 0; i < visibleCandles.length; i++) {
        const c = visibleCandles[i];
        const cx = getX(i) - (this.candleWidth / 2);
        const barH = (c.volume / maxVol) * volAreaH;
        const cy = plotH - barH;
        const isBullish = c.close >= c.open;
        
        ctx.fillStyle = isBullish 
          ? 'rgba(0, 245, 155, 0.16)' 
          : 'rgba(255, 51, 102, 0.16)';
        ctx.fillRect(cx, cy, this.candleWidth, barH);
      }
    }

    // Draw Bollinger Bands Overlay
    if (this.showBB && this.indicators.bollinger) {
      this.drawSeries(ctx, visibleCandles, startIndex, this.indicators.bollinger.upper, 'rgba(157, 78, 221, 0.8)', 1.2, getY, getX);
      this.drawSeries(ctx, visibleCandles, startIndex, this.indicators.bollinger.middle, 'rgba(157, 78, 221, 0.4)', 1, getY, getX, [4, 4]);
      this.drawSeries(ctx, visibleCandles, startIndex, this.indicators.bollinger.lower, 'rgba(157, 78, 221, 0.8)', 1.2, getY, getX);
    }

    // Draw EMA & SMA Overlays
    if (this.showEma && this.indicators.ema50) {
      this.drawSeries(ctx, visibleCandles, startIndex, this.indicators.ema50, '#38bdf8', 1.6, getY, getX);
    }
    if (this.showSma && this.indicators.sma20) {
      this.drawSeries(ctx, visibleCandles, startIndex, this.indicators.sma20, '#fbbf24', 1.6, getY, getX);
    }

    // Draw VWAP Overlay
    if (this.showVWAP && this.indicators.vwap) {
      this.drawSeries(ctx, visibleCandles, startIndex, this.indicators.vwap, '#ec4899', 1.4, getY, getX, [3, 3]);
    }

    // Draw Candlesticks with crisp shadows
    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      const cx = getX(i);
      const isBullish = c.close >= c.open;
      const color = isBullish ? '#00f59b' : '#ff3366';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, getY(c.high));
      ctx.lineTo(cx, getY(c.low));
      ctx.stroke();

      // Body
      const bodyTop = getY(Math.max(c.open, c.close));
      const bodyBottom = getY(Math.min(c.open, c.close));
      const bodyH = Math.max(1.5, bodyBottom - bodyTop);

      ctx.fillStyle = color;
      ctx.fillRect(cx - (this.candleWidth / 2), bodyTop, this.candleWidth, bodyH);
    }

    // Draw Active Risk Bracket Lines (SL / TP / Entry)
    if (this.activeBracket && this.activeBracket.entryPrice) {
      this.drawActiveBracketLines(ctx, plotW, getY);
    }

    // Draw Kronos Neural Forecast Cone Overlay (AAAI 2026)
    if (this.showKronos && this.kronosForecast) {
      this.drawKronosForecastCone(ctx, plotW, plotH, minPrice, maxPrice, visibleCandles, getY, getX);
    }

    // Draw Live Laser Price Line
    const lastCandle = visibleCandles[visibleCandles.length - 1];
    if (lastCandle) {
      const lastPrice = lastCandle.close;
      const lastY = getY(lastPrice);

      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(plotW, lastY);
      ctx.stroke();

      // Pulsing Laser badge on right gutter
      ctx.setLineDash([]);
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(plotW, lastY - 9, w - plotW, 18);
      ctx.fillStyle = '#040812';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(lastPrice.toFixed(2), plotW + 5, lastY + 4);
      ctx.restore();
    }

    // Draw Execution Markers from Backtester / Trades
    this.drawTradeMarkers(ctx, visibleCandles, startIndex, getY, getX);

    // Crosshair & Tooltip
    if (this.isHovering && this.mouseX >= 0 && this.mouseX <= plotW && this.mouseY <= plotH) {
      this.drawCrosshair(ctx, this.mouseX, this.mouseY, plotW, plotH, w, minPrice, maxPrice);

      const hoveredIdx = Math.floor((this.mouseX - (plotW - visibleCandles.length * totalCandleSpace)) / totalCandleSpace);
      if (hoveredIdx >= 0 && hoveredIdx < visibleCandles.length) {
        const candle = visibleCandles[hoveredIdx];
        const globalIdx = startIndex + hoveredIdx;
        this.updateHud(candle, globalIdx);
      }
    }
  }

  setKronosForecast(forecast) {
    this.kronosForecast = forecast;
    this.render();
  }

  toggleKronos() {
    this.showKronos = !this.showKronos;
    this.render();
    return this.showKronos;
  }

  drawKronosForecastCone(ctx, plotW, plotH, minPrice, maxPrice, visibleCandles, getY, getX) {
    const f = this.kronosForecast;
    if (!f || !f.medianPath || f.medianPath.length === 0 || visibleCandles.length === 0) return;

    const lastIdx = visibleCandles.length - 1;
    const lastX = getX(lastIdx);
    const lastPrice = visibleCandles[lastIdx].close;
    const totalCandleSpace = this.candleWidth + this.candleGap;
    const horizon = Math.min(f.medianPath.length, 14);

    ctx.save();

    // 1. Draw Confidence Cone Polygon Ribbon (10th to 90th percentile)
    const upperPoints = [];
    const lowerPoints = [];

    for (let h = 0; h < horizon; h++) {
      const x = Math.min(plotW + 30, lastX + (h + 1) * totalCandleSpace);
      const uY = getY(f.upperCone90[h] || lastPrice);
      const lY = getY(f.lowerCone10[h] || lastPrice);
      upperPoints.push({ x, y: uY });
      lowerPoints.push({ x, y: lY });
    }

    ctx.beginPath();
    ctx.moveTo(lastX, getY(lastPrice));
    for (const p of upperPoints) ctx.lineTo(p.x, p.y);
    for (let i = lowerPoints.length - 1; i >= 0; i--) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
    ctx.closePath();

    const isBull = (f.expectedReturnPct || 0) >= 0;
    const endX = upperPoints[upperPoints.length - 1] ? upperPoints[upperPoints.length - 1].x : lastX + 100;
    const coneGrad = ctx.createLinearGradient(lastX, 0, endX, 0);
    if (isBull) {
      coneGrad.addColorStop(0, 'rgba(0, 240, 255, 0.22)');
      coneGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.16)');
      coneGrad.addColorStop(1, 'rgba(0, 245, 155, 0.04)');
    } else {
      coneGrad.addColorStop(0, 'rgba(255, 51, 102, 0.22)');
      coneGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.16)');
      coneGrad.addColorStop(1, 'rgba(255, 51, 102, 0.04)');
    }
    ctx.fillStyle = coneGrad;
    ctx.fill();

    // 2. Upper and Lower Boundary Strokes
    ctx.strokeStyle = isBull ? 'rgba(0, 240, 255, 0.45)' : 'rgba(255, 51, 102, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    
    // Upper line
    ctx.beginPath();
    ctx.moveTo(lastX, getY(lastPrice));
    for (const p of upperPoints) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    // Lower line
    ctx.beginPath();
    ctx.moveTo(lastX, getY(lastPrice));
    for (const p of lowerPoints) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    // 3. Draw Median Expected Path Line (Glowing light violet)
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(lastX, getY(lastPrice));
    for (let h = 0; h < horizon; h++) {
      const x = Math.min(plotW + 30, lastX + (h + 1) * totalCandleSpace);
      ctx.lineTo(x, getY(f.medianPath[h]));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. Draw Synthetic Forecast Candlesticks (Phantom Candles)
    if (f.forecastCandles && f.forecastCandles.length > 0) {
      for (let h = 0; h < Math.min(horizon, f.forecastCandles.length); h++) {
        const fc = f.forecastCandles[h];
        const cx = lastX + (h + 1) * totalCandleSpace;
        if (cx > plotW) break;

        const candleBull = fc.close >= fc.open;
        const color = candleBull ? 'rgba(0, 245, 155, 0.8)' : 'rgba(255, 51, 102, 0.8)';

        // Phantom Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(cx, getY(fc.high));
        ctx.lineTo(cx, getY(fc.low));
        ctx.stroke();

        // Phantom Body
        const topY = getY(Math.max(fc.open, fc.close));
        const botY = getY(Math.min(fc.open, fc.close));
        const bH = Math.max(2, botY - topY);

        ctx.strokeStyle = color;
        ctx.strokeRect(cx - (this.candleWidth / 2), topY, this.candleWidth, bH);
        ctx.fillStyle = candleBull ? 'rgba(0, 245, 155, 0.15)' : 'rgba(255, 51, 102, 0.15)';
        ctx.fillRect(cx - (this.candleWidth / 2), topY, this.candleWidth, bH);
      }
    }

    // 5. Draw Glowing Forecast Tag at Tip
    const tipX = Math.min(plotW - 135, lastX + horizon * totalCandleSpace);
    const tipY = Math.max(22, Math.min(plotH - 25, getY(f.medianPath[horizon - 1])));
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = isBull ? '#00f59b' : '#ff3366';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(tipX - 10, tipY - 12, 140, 24, 4);
    } else {
      ctx.rect(tipX - 10, tipY - 12, 140, 24);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    const sign = f.expectedReturnPct >= 0 ? '+' : '';
    ctx.fillText(`🔮 KRONOS: ${sign}${f.expectedReturnPct}%`, tipX - 3, tipY + 3);

    ctx.restore();
  }

  drawActiveBracketLines(ctx, plotW, getY) {
    if (!this.activeBracket) return;
    const { entryPrice, stopLossPrice, takeProfitPrice, side = 'BUY', units, allocatedCapital } = this.activeBracket;
    if (!entryPrice) return;

    ctx.save();

    // 0. Floating P&L Shading between Entry Price and Current Live Price (TradingView App style)
    if (this.candles && this.candles.length > 0) {
      const currentPrice = this.candles[this.candles.length - 1].close;
      const enY = getY(entryPrice);
      const curY = getY(currentPrice);
      const isProfit = (side === 'BUY' && currentPrice >= entryPrice) || (side === 'SELL' && currentPrice <= entryPrice);
      const shadeColor = isProfit ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)';

      ctx.fillStyle = shadeColor;
      ctx.fillRect(0, Math.min(enY, curY), plotW, Math.max(2, Math.abs(curY - enY)));

      // Floating P&L Badge following live candle tip
      const pnlAmount = units ? (side === 'BUY' ? (currentPrice - entryPrice) * units : (entryPrice - currentPrice) * units) : 0;
      const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100 * (side === 'BUY' ? 1 : -1);
      const pnlSign = pnlPct >= 0 ? '+' : '';

      const badgeW = 165;
      const badgeH = 22;
      const badgeX = Math.max(10, plotW - badgeW - 12);
      const badgeY = Math.max(8, Math.min(this.mainHeight - 35, curY - 11));

      ctx.fillStyle = 'rgba(8, 12, 22, 0.94)';
      ctx.strokeStyle = isProfit ? '#10b981' : '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      else ctx.rect(badgeX, badgeY, badgeW, badgeH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isProfit ? '#34d399' : '#f87171';
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      const text = units 
        ? `PnL: ${pnlSign}$${pnlAmount.toFixed(2)} (${pnlSign}${pnlPct.toFixed(2)}%)`
        : `PnL: ${pnlSign}${pnlPct.toFixed(2)}%`;
      ctx.fillText(text, badgeX + 8, badgeY + 15);
    }

    // 1. Take-Profit Target Line (Green)
    if (takeProfitPrice) {
      const tpY = getY(takeProfitPrice);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(0, tpY);
      ctx.lineTo(plotW, tpY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.95)';
      const tpText = `🎯 TAKE-PROFIT: $${takeProfitPrice.toFixed(2)} (+4.0%)`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const textW = ctx.measureText(tpText).width;
      ctx.fillRect(8, tpY - 9, textW + 14, 18);
      ctx.fillStyle = '#040812';
      ctx.fillText(tpText, 14, tpY + 3.5);

      // Right price axis tag
      ctx.fillStyle = '#10b981';
      ctx.fillRect(plotW + 2, tpY - 9, this.paddingRight - 4, 18);
      ctx.fillStyle = '#040812';
      ctx.fillText(takeProfitPrice.toFixed(2), plotW + 6, tpY + 3.5);
    }

    // 2. Stop-Loss Line (Red)
    if (stopLossPrice) {
      const slY = getY(stopLossPrice);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(0, slY);
      ctx.lineTo(plotW, slY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      const slText = `🛡️ STOP-LOSS: $${stopLossPrice.toFixed(2)} (-2.0%)`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const textW = ctx.measureText(slText).width;
      ctx.fillRect(8, slY - 9, textW + 14, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(slText, 14, slY + 3.5);

      // Right price axis tag
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(plotW + 2, slY - 9, this.paddingRight - 4, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(stopLossPrice.toFixed(2), plotW + 6, slY + 3.5);
    }

    // 3. Entry Price Line (Cyan / Green) — EXACTLY WHERE WE BOUGHT
    if (entryPrice) {
      const enY = getY(entryPrice);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, enY);
      ctx.lineTo(plotW, enY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.95)';
      const enText = `⚡ BOUGHT @ $${entryPrice.toFixed(2)}${units ? ` | Qty: ${units}` : ''}`;
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      const textW = ctx.measureText(enText).width;
      ctx.fillRect(8, enY - 9, textW + 14, 18);
      ctx.fillStyle = '#040812';
      ctx.fillText(enText, 14, enY + 3.5);

      // Right price axis tag
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(plotW + 2, enY - 9, this.paddingRight - 4, 18);
      ctx.fillStyle = '#040812';
      ctx.fillText(entryPrice.toFixed(2), plotW + 6, enY + 3.5);
    }

    ctx.restore();
  }

  drawSeries(ctx, visibleCandles, startIndex, dataSeries, color, lineWidth = 1.5, getY, getX, dash = []) {
    if (!dataSeries) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();
    let started = false;

    for (let i = 0; i < visibleCandles.length; i++) {
      const globalIdx = startIndex + i;
      const val = dataSeries[globalIdx];
      if (val !== null && val !== undefined) {
        const x = getX(i);
        const y = getY(val);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawTradeMarkers(ctx, visibleCandles, startIndex, getY, getX) {
    if (!this.trades || this.trades.length === 0) return;

    ctx.save();
    for (const trade of this.trades) {
      const entryT = trade.entryTime || trade.timestamp;
      const exitT = trade.exitTime;
      const isSellOnly = trade.action && trade.action.includes('SELL');

      for (let i = 0; i < visibleCandles.length; i++) {
        const c = visibleCandles[i];
        const nextC = visibleCandles[i + 1];
        const inThisCandle = nextC 
          ? (entryT >= c.timestamp && entryT < nextC.timestamp)
          : (entryT >= c.timestamp - 900000);

        // Buy Marker (Exact Entry Arrow + Price Tag)
        if (inThisCandle && !isSellOnly && (trade.entryPrice || trade.price)) {
          const buyPrice = trade.entryPrice || trade.price;
          const cx = getX(i);
          const cy = getY(buyPrice) + 10;

          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - 6, cy + 8);
          ctx.lineTo(cx + 6, cy + 8);
          ctx.closePath();
          ctx.fill();

          // Text pill: ▲ BUY $2,685.20
          ctx.fillStyle = 'rgba(16, 185, 129, 0.95)';
          const text = `▲ BUY $${buyPrice.toFixed(2)}`;
          ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
          const tw = ctx.measureText(text).width;
          ctx.fillRect(cx - (tw / 2) - 4, cy + 9, tw + 8, 14);
          ctx.fillStyle = '#040812';
          ctx.fillText(text, cx - (tw / 2), cy + 19);
        }

        // Sell Marker (Exit Arrow + PnL Tag)
        if ((exitT && trade.exitPrice) || (isSellOnly && (trade.exitPrice || trade.price))) {
          const sellT = exitT || entryT;
          const sellPrice = trade.exitPrice || trade.price;
          const exitInCandle = nextC 
            ? (sellT >= c.timestamp && sellT < nextC.timestamp)
            : (sellT >= c.timestamp - 900000);

          if (exitInCandle) {
            const cx = getX(i);
            const cy = getY(sellPrice) - 10;
            const pnlVal = (trade.netPnL !== undefined ? trade.netPnL : trade.pnl);
            const isWin = pnlVal !== undefined ? pnlVal >= 0 : true;

            ctx.fillStyle = isWin ? '#10b981' : '#ef4444';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx - 6, cy - 8);
            ctx.lineTo(cx + 6, cy - 8);
            ctx.closePath();
            ctx.fill();

            // Text pill: ▼ SELL $... (+$...)
            ctx.fillStyle = isWin ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)';
            const text = (pnlVal !== undefined)
              ? `▼ SELL $${sellPrice.toFixed(2)} (${pnlVal >= 0 ? '+' : ''}$${Number(pnlVal).toFixed(2)})`
              : `▼ SELL $${sellPrice.toFixed(2)}`;
            ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
            const tw = ctx.measureText(text).width;
            ctx.fillRect(cx - (tw / 2) - 4, cy - 24, tw + 8, 14);
            ctx.fillStyle = isWin ? '#040812' : '#ffffff';
            ctx.fillText(text, cx - (tw / 2), cy - 14);
          }
        }
      }
    }
    ctx.restore();
  }

  drawMainGrid(ctx, plotW, plotH, minPrice, maxPrice, visibleCandles) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    // Horizontal Price Lines & Labels
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const p = minPrice + (s / steps) * (maxPrice - minPrice);
      const y = plotH - (s / steps) * plotH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();

      // Price Tag on right gutter
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(p.toFixed(2), plotW + 7, y + 3.5);
    }

    // Vertical Time Lines
    const timeStep = Math.max(1, Math.floor(visibleCandles.length / 5));
    const totalCandleSpace = this.candleWidth + this.candleGap;
    for (let i = 0; i < visibleCandles.length; i += timeStep) {
      const x = plotW - (visibleCandles.length - i) * totalCandleSpace + (this.candleWidth / 2);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, plotH);
      ctx.stroke();

      const timeStr = new Date(visibleCandles[i].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, x, plotH + 16);
    }
  }

  drawCrosshair(ctx, mouseX, mouseY, plotW, plotH, totalW, minPrice, maxPrice) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(mouseX, 0);
    ctx.lineTo(mouseX, plotH);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, mouseY);
    ctx.lineTo(plotW, mouseY);
    ctx.stroke();

    // Price badge at cursor
    const curPrice = maxPrice - (mouseY / plotH) * (maxPrice - minPrice);
    ctx.setLineDash([]);
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(plotW, mouseY - 10, totalW - plotW, 20);
    ctx.fillStyle = '#050a14';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(curPrice.toFixed(2), plotW + 6, mouseY + 4);
    ctx.restore();
  }

  renderSubChart() {
    const ctx = this.subCtx;
    const w = this.subWidth;
    const h = this.subHeight;
    const plotH = h - 18;
    const plotW = w - this.paddingRight;

    ctx.clearRect(0, 0, w, h);

    const totalCandleSpace = this.candleWidth + this.candleGap;
    const maxVisibleCandles = Math.floor(plotW / totalCandleSpace);
    const endIndex = Math.max(0, this.candles.length - this.viewOffset);
    const startIndex = Math.max(0, endIndex - maxVisibleCandles);
    const visibleCandles = this.candles.slice(startIndex, endIndex);

    if (visibleCandles.length === 0) return;
    const getX = (i) => plotW - (visibleCandles.length - i) * totalCandleSpace + (this.candleWidth / 2);

    if (this.subchartMode === 'rsi') {
      this.renderRsiSubChart(ctx, visibleCandles, startIndex, plotW, plotH, getX);
    } else if (this.subchartMode === 'macd') {
      this.renderMacdSubChart(ctx, visibleCandles, startIndex, plotW, plotH, getX);
    } else if (this.subchartMode === 'equity') {
      this.renderEquitySubChart(ctx, visibleCandles, startIndex, plotW, plotH, getX);
    }
  }

  renderRsiSubChart(ctx, visibleCandles, startIndex, plotW, plotH, getX) {
    const rsi = this.indicators.rsi;
    if (!rsi) return;

    // RSI Bounds 0 to 100
    const getY = (val) => plotH - (val / 100) * plotH;

    // Overbought (70) and Oversold (30) levels
    ctx.strokeStyle = 'rgba(255, 51, 102, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, getY(70));
    ctx.lineTo(plotW, getY(70));
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 245, 155, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, getY(30));
    ctx.lineTo(plotW, getY(30));
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill oversold / overbought zones
    ctx.fillStyle = 'rgba(157, 78, 221, 0.08)';
    ctx.fillRect(0, getY(70), plotW, getY(30) - getY(70));

    // Draw RSI Line
    this.drawSeries(ctx, visibleCandles, startIndex, rsi, '#c77dff', 1.8, getY, getX);

    // Label
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('70', plotW + 8, getY(70) + 3);
    ctx.fillText('30', plotW + 8, getY(30) + 3);
  }

  renderMacdSubChart(ctx, visibleCandles, startIndex, plotW, plotH, getX) {
    const macd = this.indicators.macd;
    if (!macd || !macd.histogram) return;

    let maxAbs = 0.01;
    for (let i = 0; i < visibleCandles.length; i++) {
      const idx = startIndex + i;
      const hVal = macd.histogram[idx];
      if (hVal !== null && Math.abs(hVal) > maxAbs) maxAbs = Math.abs(hVal);
    }

    const midY = plotH / 2;
    const getY = (val) => midY - (val / maxAbs) * (plotH * 0.45);

    // Zero Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(plotW, midY);
    ctx.stroke();

    // Histogram bars
    for (let i = 0; i < visibleCandles.length; i++) {
      const idx = startIndex + i;
      const hVal = macd.histogram[idx];
      if (hVal !== null && hVal !== undefined) {
        const x = getX(i) - (this.candleWidth / 2);
        const y = getY(hVal);
        const barH = Math.abs(y - midY);
        ctx.fillStyle = hVal >= 0 ? '#00f59b' : '#ff3366';
        ctx.fillRect(x, hVal >= 0 ? y : midY, this.candleWidth, barH);
      }
    }

    // MACD and Signal lines
    this.drawSeries(ctx, visibleCandles, startIndex, macd.macd, '#00f0ff', 1.5, getY, getX);
    this.drawSeries(ctx, visibleCandles, startIndex, macd.signal, '#f59e0b', 1.2, getY, getX, [3, 3]);
  }

  renderEquitySubChart(ctx, visibleCandles, startIndex, plotW, plotH, getX) {
    if (!this.equityCurve || this.equityCurve.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Run Backtest to visualize Strategy Equity vs Benchmark', plotW / 2, plotH / 2);
      return;
    }

    let minEq = Infinity;
    let maxEq = -Infinity;

    for (let i = 0; i < visibleCandles.length; i++) {
      const idx = startIndex + i;
      const eq = this.equityCurve[idx]?.equity;
      const bm = this.benchmarkCurve[idx]?.equity;
      if (eq !== undefined) {
        if (eq < minEq) minEq = eq;
        if (eq > maxEq) maxEq = eq;
      }
      if (bm !== undefined) {
        if (bm < minEq) minEq = bm;
        if (bm > maxEq) maxEq = bm;
      }
    }

    const range = (maxEq - minEq) || 1;
    minEq -= range * 0.05;
    maxEq += range * 0.05;
    const getY = (val) => plotH - ((val - minEq) / (maxEq - minEq)) * plotH;

    // Draw Benchmark line (gray dashed)
    const bmSeries = this.benchmarkCurve.map(b => b.equity);
    this.drawSeries(ctx, visibleCandles, startIndex, bmSeries, 'rgba(148, 163, 184, 0.5)', 1.2, getY, getX, [4, 4]);

    // Draw Gradient Area fill under Strategy Equity curve
    const eqSeries = this.equityCurve.map(e => e.equity);
    ctx.save();
    const areaGrad = ctx.createLinearGradient(0, 0, 0, plotH);
    areaGrad.addColorStop(0, 'rgba(0, 240, 255, 0.25)');
    areaGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
    ctx.fillStyle = areaGrad;
    ctx.beginPath();
    let started = false;
    let firstX = 0;
    let lastX = 0;

    for (let i = 0; i < visibleCandles.length; i++) {
      const val = eqSeries[startIndex + i];
      if (val !== undefined && val !== null) {
        const x = getX(i);
        const y = getY(val);
        if (!started) {
          ctx.moveTo(x, plotH);
          ctx.lineTo(x, y);
          firstX = x;
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        lastX = x;
      }
    }
    if (started) {
      ctx.lineTo(lastX, plotH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Draw Strategy Equity line (Cyan neon)
    this.drawSeries(ctx, visibleCandles, startIndex, eqSeries, '#00f0ff', 2, getY, getX);

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`$${maxEq.toFixed(0)}`, plotW + 6, 12);
    ctx.fillText(`$${minEq.toFixed(0)}`, plotW + 6, plotH);
  }

  updateHud(candle, globalIdx) {
    const oEl = document.getElementById('hudOpen');
    const hEl = document.getElementById('hudHigh');
    const lEl = document.getElementById('hudLow');
    const cEl = document.getElementById('hudClose');
    const vEl = document.getElementById('hudVolume');
    const rsiEl = document.getElementById('hudRsi');

    if (!candle) {
      if (this.candles.length > 0) {
        const last = this.candles[this.candles.length - 1];
        if (oEl) oEl.innerText = last.open.toFixed(2);
        if (hEl) hEl.innerText = last.high.toFixed(2);
        if (lEl) lEl.innerText = last.low.toFixed(2);
        if (cEl) cEl.innerText = last.close.toFixed(2);
        if (vEl) vEl.innerText = last.volume.toLocaleString();
      }
      return;
    }

    if (oEl) oEl.innerText = candle.open.toFixed(2);
    if (hEl) hEl.innerText = candle.high.toFixed(2);
    if (lEl) lEl.innerText = candle.low.toFixed(2);
    if (cEl) cEl.innerText = candle.close.toFixed(2);
    if (vEl) vEl.innerText = candle.volume.toLocaleString();

    if (rsiEl && this.indicators.rsi && globalIdx !== undefined) {
      const r = this.indicators.rsi[globalIdx];
      rsiEl.innerText = r !== null && r !== undefined ? r : '--';
    }
  }
}

window.ChartEngine = ChartEngine;
