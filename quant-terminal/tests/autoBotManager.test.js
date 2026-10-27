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

  await t.test('Updates bot strategy dynamically to kronosAlpha', () => {
    const manager = new AutoBotManager();
    const updated = manager.updateStrategy('BTC-USD', 'kronosAlpha', { horizon: 12, minReturn: 0.5 });
    assert.strictEqual(updated, true, 'Update strategy should succeed');
    assert.strictEqual(manager.bots['BTC-USD'].strategy, 'kronosAlpha', 'Bot strategy updated to kronosAlpha');
    assert.strictEqual(manager.bots['BTC-USD'].params.horizon, 12, 'Param horizon updated');
  });

  await t.test('1-Click Master Auto-Pilot activates across all assets with strict risk shields', () => {
    const manager = new AutoBotManager();
    const bots = manager.activateMasterAutoPilot();

    assert.strictEqual(bots['XAU-USD'].strategy, 'masterAutoPilot');
    assert.strictEqual(bots['BTC-USD'].strategy, 'masterAutoPilot');
    assert.strictEqual(bots['XAU-USD'].active, true);
    assert.strictEqual(bots['BTC-USD'].active, true);
    assert.strictEqual(bots['XAU-USD'].aiFilterEnabled, true);
    assert.strictEqual(bots['XAU-USD'].stopLossPct, 2.0);
  });

  await t.test('Dynamic trailing profit lock engages when unrealized profit reaches +1.5%', () => {
    const manager = new AutoBotManager();
    manager.reset('XAU-USD');
    manager.activateMasterAutoPilot();
    const bot = manager.bots['XAU-USD'];

    // Simulate entry at $2700
    bot.position = 1.0;
    bot.entryPrice = 2700.00;
    bot.cash = 0;
    assert.strictEqual(bot.trailingLocked, false);

    // Price moves to $2745 (+1.67% profit)
    const candles = Array.from({ length: 30 }, () => ({
      open: 2740, high: 2750, low: 2735, close: 2745, volume: 100
    }));

    manager.onTick('XAU-USD', 2745.00, candles);

    assert.strictEqual(bot.trailingLocked, true, 'Trailing lock must engage at +1.5% profit');
    assert.ok(bot.trailingLockPrice > bot.entryPrice, 'Trailing lock price must be above entry price');
  });
});


