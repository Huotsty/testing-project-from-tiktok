/**
 * Institutional-Grade Event-Driven & Vectorized Backtester Engine
 * Simulates realistic trade execution with slippage, commissions, and computes quant performance tearsheet.
 */
const Indicators = require('./indicators');

class Backtester {
  /**
   * Run backtest simulation
   * @param {Array} candles - OHLCV candle array
   * @param {Object} strategyResult - { name, signals, indicatorData }
   * @param {Object} config - { initialCapital, slippagePct, commissionPct, positionSizePct }
   */
  static run(candles, strategyResult, config = {}) {
    const initialCapital = (config.initialCapital !== undefined && !isNaN(Number(config.initialCapital))) ? Number(config.initialCapital) : 10000;
    if (initialCapital <= 0) {
      return {
        strategyName: strategyResult.name,
        summary: {
          initialCapital: 0,
          finalEquity: 0,
          totalNetProfit: 0,
          totalReturnPct: 0,
          benchmarkReturnPct: 0,
          alphaPct: 0,
          sharpeRatio: 0,
          sortinoRatio: 0,
          maxDrawdownPct: 0,
          totalTrades: 0,
          winningTradesCount: 0,
          losingTradesCount: 0,
          winRatePct: 0,
          profitFactor: 0,
          winLossRatio: 0,
          avgTradeReturnPct: 0,
          exposurePct: 0,
          slippageBps: 0,
          commissionBps: 0
        },
        trades: [],
        equityCurve: [],
        benchmarkCurve: [],
        indicators: strategyResult.indicatorData
      };
    }
    const slippagePct = (config.slippagePct !== undefined && !isNaN(Number(config.slippagePct))) ? Number(config.slippagePct) : 0.0005;
    const commissionPct = (config.commissionPct !== undefined && !isNaN(Number(config.commissionPct))) ? Number(config.commissionPct) : 0.00075;
    const positionSizePct = Number(config.positionSizePct) || 1.0; // 100% of available cash

    let cash = initialCapital;
    let position = 0; // Number of units held
    let entryPrice = 0;
    let entryTime = 0;
    let entryIndex = 0;
    let entryFee = 0;

    const trades = [];
    const equityCurve = [];
    const benchmarkCurve = [];
    const returns = [];

    // Benchmark Buy & Hold reference
    const benchmarkInitialUnits = initialCapital / (candles[0]?.close || 1);

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const signal = strategyResult.signals[i] || { action: 'HOLD' };
      const currentPrice = candle.close;

      // 1. Check Signal Execution
      if (signal.action === 'BUY' && position === 0) {
        // Calculate fill price with slippage (buyer pays slightly more)
        const fillPrice = currentPrice * (1 + slippagePct);
        // Deduct commission from allocation so totalCost is strictly within available cash
        const maxSpend = cash * positionSizePct;
        const fee = maxSpend * commissionPct;
        const capitalToAllocate = maxSpend - fee;
        const tentativeUnits = capitalToAllocate / fillPrice;
        const totalCost = capitalToAllocate + fee;

        if (tentativeUnits > 0 && totalCost <= cash + 0.001) {
          position = tentativeUnits;
          cash = Math.max(0, cash - totalCost);
          entryPrice = fillPrice;
          entryTime = candle.timestamp;
          entryIndex = i;
          entryFee = fee;
        }
      } else if (signal.action === 'SELL' && position > 0) {
        // Calculate fill price with slippage (seller gets slightly less)
        const fillPrice = currentPrice * (1 - slippagePct);
        const grossProceeds = position * fillPrice;
        const exitFee = grossProceeds * commissionPct;
        const netProceeds = grossProceeds - exitFee;
        
        cash += netProceeds;

        const totalFees = entryFee + exitFee;
        const grossPnL = (fillPrice - entryPrice) * position;
        const netPnL = grossPnL - totalFees;
        const returnPct = ((fillPrice - entryPrice) / entryPrice) * 100;
        const durationBars = i - entryIndex;

        trades.push({
          id: trades.length + 1,
          entryTime,
          exitTime: candle.timestamp,
          entryPrice: Number(entryPrice.toFixed(2)),
          exitPrice: Number(fillPrice.toFixed(2)),
          units: Number(position.toFixed(4)),
          grossPnL: Number(grossPnL.toFixed(2)),
          totalFees: Number(totalFees.toFixed(2)),
          netPnL: Number(netPnL.toFixed(2)),
          returnPct: Number(returnPct.toFixed(2)),
          durationBars,
          reason: signal.reason || 'Exit signal'
        });

        position = 0;
        entryPrice = 0;
        entryFee = 0;
      }

      // Mark-to-market portfolio equity
      const markToMarketEquity = cash + (position * currentPrice);
      equityCurve.push({
        time: candle.time,
        timestamp: candle.timestamp,
        equity: Number(markToMarketEquity.toFixed(2)),
        cash: Number(cash.toFixed(2)),
        positionValue: Number((position * currentPrice).toFixed(2))
      });

      // Benchmark Buy & Hold equity
      benchmarkCurve.push({
        time: candle.time,
        timestamp: candle.timestamp,
        equity: Number((benchmarkInitialUnits * currentPrice).toFixed(2))
      });

      // Calculate bar-to-bar returns for Sharpe and Sortino
      if (i > 0) {
        const prevEquity = equityCurve[i - 1].equity;
        const barReturn = prevEquity > 0 ? (markToMarketEquity - prevEquity) / prevEquity : 0;
        returns.push(barReturn);
      }
    }

    // If still in position at the end, close it at final candle price for realistic blotter
    if (position > 0) {
      const finalCandle = candles[candles.length - 1];
      const fillPrice = finalCandle.close * (1 - slippagePct);
      const grossProceeds = position * fillPrice;
      const exitFee = grossProceeds * commissionPct;
      const netProceeds = grossProceeds - exitFee;
      const tradeNetPnL = netProceeds - (position * entryPrice + entryFee);
      const tradeReturnPct = (tradeNetPnL / (position * entryPrice + entryFee)) * 100;

      cash += netProceeds;
      trades.push({
        id: trades.length + 1,
        entryTime,
        exitTime: finalCandle.timestamp,
        entryPrice: Number(entryPrice.toFixed(2)),
        exitPrice: Number(fillPrice.toFixed(2)),
        units: Number(position.toFixed(4)),
        durationBars: candles.length - 1 - entryIndex,
        grossPnL: Number((grossProceeds - position * entryPrice).toFixed(2)),
        totalFees: Number((entryFee + exitFee).toFixed(2)),
        netPnL: Number(tradeNetPnL.toFixed(2)),
        returnPct: Number(tradeReturnPct.toFixed(2)),
        exitReason: 'End of Backtest Period (Mark to Market)'
      });
      position = 0;

      // Reconcile final equity curve point with realized closing fees
      if (equityCurve.length > 0) {
        equityCurve[equityCurve.length - 1].equity = Number(cash.toFixed(2));
        equityCurve[equityCurve.length - 1].cash = Number(cash.toFixed(2));
        equityCurve[equityCurve.length - 1].positionValue = 0;
      }
    }

    const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : cash;
    const totalNetProfit = finalEquity - initialCapital;
    const totalReturnPct = (totalNetProfit / initialCapital) * 100;

    // Benchmark performance
    const benchmarkFinal = benchmarkCurve[benchmarkCurve.length - 1].equity;
    const benchmarkReturnPct = ((benchmarkFinal - initialCapital) / initialCapital) * 100;
    const alphaPct = totalReturnPct - benchmarkReturnPct;

    // Trade Statistics
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.netPnL > 0);
    const losingTrades = trades.filter(t => t.netPnL <= 0);
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

    const grossProfit = winningTrades.reduce((acc, t) => acc + t.netPnL, 0);
    const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.netPnL, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99.99 : 0);

    const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 99.99 : 0);

    // Institutional Risk Ratios
    const rawEquities = equityCurve.map(e => e.equity);
    const drawdownData = Indicators.calculateMaxDrawdown(rawEquities);
    const sharpe = Indicators.calculateSharpeRatio(returns);
    const sortino = Indicators.calculateSortinoRatio(returns);

    // Exposure Time
    const inMarketBars = equityCurve.filter(e => e.positionValue > 0).length;
    const exposurePct = (inMarketBars / candles.length) * 100;

    return {
      strategyName: strategyResult.name,
      summary: {
        initialCapital,
        finalEquity: Number(finalEquity.toFixed(2)),
        totalNetProfit: Number(totalNetProfit.toFixed(2)),
        totalReturnPct: Number(totalReturnPct.toFixed(2)),
        benchmarkReturnPct: Number(benchmarkReturnPct.toFixed(2)),
        alphaPct: Number(alphaPct.toFixed(2)),
        sharpeRatio: sharpe,
        sortinoRatio: sortino,
        maxDrawdownPct: drawdownData.maxDrawdownPercent,
        totalTrades,
        winningTradesCount: winningTrades.length,
        losingTradesCount: losingTrades.length,
        winRatePct: Number(winRate.toFixed(1)),
        profitFactor: Number(profitFactor.toFixed(2)),
        winLossRatio: Number(winLossRatio.toFixed(2)),
        avgTradeReturnPct: totalTrades > 0 ? Number((trades.reduce((a, t) => a + t.returnPct, 0) / totalTrades).toFixed(2)) : 0,
        exposurePct: Number(exposurePct.toFixed(1)),
        slippageBps: slippagePct * 10000,
        commissionBps: commissionPct * 10000
      },
      trades,
      equityCurve,
      benchmarkCurve,
      indicators: strategyResult.indicatorData
    };
  }
}

module.exports = Backtester;
