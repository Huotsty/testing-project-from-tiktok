const test = require('node:test');
const assert = require('node:assert/strict');
const AutoBotManager = require('../server/services/autoBotManager');

test('AutoBotManager Suite', async (t) => {
  await t.test('Initializes with default Gold and BTC bots', () => {
    const manager = new AutoBotManager();
    const status = manager.getStatus();

    assert.ok(status['XAU-USD'], 'XAU-USD bot must exist');
    assert.ok(status['BTC-USD'], 'BTC-USD bot must exist');
    assert.strictEqual(status['XAU-USD'].stopLossPct, 2.0);
    assert.strictEqual(status['XAU-USD'].takeProfitPct, 4.0);
    assert.strictEqual(status['BTC-USD'].strategy, 'bollingerReversion');
  });

  await t.test('Triggers hard stop-loss when price drops by 2%', () => {
    const manager = new AutoBotManager();
    manager.reset('XAU-USD');
    manager.startBot('XAU-USD');
    const bot = manager.bots['XAU-USD'];

    // Manually simulate a bought position at $2700
    bot.position = 1.0;
    bot.entryPrice = 2700.00;
    bot.cash = 0;

    // Send a 30-candle series where last price is $2640 (-2.2% drop)
    const candles = Array.from({ length: 30 }, (_, i) => ({
      open: 2700, high: 2705, low: 2695, close: 2700, volume: 100
    }));
    candles[29].close = 2640.00; // -2.2% drop

    manager.onTick('XAU-USD', 2640.00, candles);

    assert.strictEqual(bot.position, 0, 'Position must be flattened by Stop-Loss');
    assert.strictEqual(bot.lossTrades, 1, 'Must register 1 loss trade');
    assert.ok(bot.trades[bot.trades.length - 1].reason.includes('HARD STOP-LOSS'), 'Trade blotter must record Hard Stop-Loss');
  });

  await t.test('Triggers take-profit target when price gains 4%', () => {
    const manager = new AutoBotManager();
    manager.reset('XAU-USD');
    manager.startBot('XAU-USD');
    const bot = manager.bots['XAU-USD'];

    // Manually simulate a bought position at $2700
    bot.position = 1.0;
    bot.entryPrice = 2700.00;
    bot.cash = 0;

    // Send a 30-candle series where last price is $2820 (+4.4% gain)
    const candles = Array.from({ length: 30 }, (_, i) => ({
      open: 2700, high: 2705, low: 2695, close: 2700, volume: 100
    }));
    candles[29].close = 2820.00;

    manager.onTick('XAU-USD', 2820.00, candles);

    assert.strictEqual(bot.position, 0, 'Position must be flattened to lock in profits');
    assert.strictEqual(bot.winTrades, 1, 'Must register 1 win trade');
    assert.ok(bot.trades[bot.trades.length - 1].pnl > 100, 'Must record substantial profit');
    assert.ok(bot.trades[bot.trades.length - 1].reason.includes('TAKE-PROFIT'), 'Trade blotter must record Take-Profit');
  });

  await t.test('Prevents buy signal execution if AI regime is high volatility shock', () => {
    const manager = new AutoBotManager();
    manager.startBot('XAU-USD');
    const bot = manager.bots['XAU-USD'];

    let blockedBroadcast = false;
    manager.addListener((event) => {
      if (event.type === 'AI_FILTER_BLOCKED') {
        blockedBroadcast = true;
      }
    });

    // Create a 30-candle series with wild 10% swings (Volatility Shock)
    const candles = Array.from({ length: 30 }, (_, i) => {
      const swing = (i % 2 === 0 ? 1 : -1) * (50 + i * 15);
      return {
        open: 2700 + swing,
        high: 2850 + swing,
        low: 2550 + swing,
        close: 2700 + swing,
        volume: 50000
      };
    });

    // Strategy signal would be checked, but high volatility should block it
    manager.onTick('XAU-USD', 2700.00, candles);

    // Bot should remain in 100% cash, 0 position
    assert.strictEqual(bot.position, 0, 'Must protect capital and not buy during shock');
  });
});
