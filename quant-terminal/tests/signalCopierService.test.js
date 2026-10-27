const test = require('node:test');
const assert = require('node:assert/strict');
const SignalCopierService = require('../server/services/signalCopierService');

test('SignalCopierService Suite', async (t) => {
  await t.test('Normalizes external tickers and action strings', () => {
    const copier = new SignalCopierService();
    assert.strictEqual(copier.normalizeSymbol('BTCUSDT'), 'BTC-USD');
    assert.strictEqual(copier.normalizeSymbol('GOLD'), 'XAU-USD');
    assert.strictEqual(copier.normalizeSymbol('XAUUSD'), 'XAU-USD');
    assert.strictEqual(copier.normalizeAction('BUY'), 'BUY');
    assert.strictEqual(copier.normalizeAction('LONG'), 'BUY');
    assert.strictEqual(copier.normalizeAction('SELL'), 'SELL');
    assert.strictEqual(copier.normalizeAction('SHORT'), 'SELL');
    assert.strictEqual(copier.normalizeAction('CLOSE'), 'SELL');
  });

  await t.test('Enforces hard -2% stop-loss when external signal omits stop-loss', async () => {
    const copier = new SignalCopierService();
    const result = await copier.ingestSignal({
      action: 'BUY',
      symbol: 'BTCUSDT',
      price: 60000.00,
      capital: 10.00,
      source: 'External VIP Channel'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.signal.symbol, 'BTC-USD');
    assert.strictEqual(result.signal.action, 'BUY');
    assert.strictEqual(result.signal.stopLoss, 58800.00, 'Stop-Loss must be enforced at exactly -2% ($58,800)');
    assert.strictEqual(result.signal.takeProfit, 63000.00, 'Take-Profit must be set to +5% target ($63,000)');
  });

  await t.test('Caps reckless capital allocations to micro-account ceiling ($20)', async () => {
    const copier = new SignalCopierService();
    const result = await copier.ingestSignal({
      action: 'BUY',
      symbol: 'GOLD',
      price: 2700.00,
      capital: 5000.00, // External signal asks to allocate $5,000!
      source: 'Reckless Telegram Signal'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.signal.capital, 20.00, 'Allocated capital must be safely capped at $20.00');
    assert.strictEqual(result.signal.symbol, 'XAU-USD');
  });

  await t.test('Rejects signal with invalid secret passphrase', async () => {
    const copier = new SignalCopierService();
    copier.webhookSecret = 'secure_passphrase_123';
    const result = await copier.ingestSignal({
      secret: 'wrong_secret',
      action: 'BUY',
      symbol: 'BTC-USD',
      price: 60000
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Unauthorized'));
  });
});
