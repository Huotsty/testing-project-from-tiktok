/**
 * AlphaForge Autonomous Dual-Asset Auto-Trader CLI Monitor
 * Runs the Gold & Bitcoin automated trading bots in real time with live terminal dashboard.
 */

const http = require('http');

const SERVER_HOST = 'localhost';
const SERVER_PORT = 4000;

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[0f');
}

function formatUSD(num) {
  return (num >= 0 ? '+$' : '-$') + Math.abs(num).toFixed(2);
}

async function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function start() {
  clearScreen();
  console.log('⚡ Connecting to AlphaForge Quant Engine on port 4000...');

  // Start both bots
  try {
    await request('/api/auto-bot/start', 'POST', {});
    console.log('✅ Gold and Bitcoin Autonomous Trading Bots Started Successfully!');
  } catch (err) {
    console.log('❌ Could not connect to Quant Server. Please make sure `node server/index.js` or `start_terminal.bat` is running!');
    process.exit(1);
  }

  // Poll status every 1 second and render HUD
  setInterval(async () => {
    try {
      const res = await request('/api/auto-bot/status');
      if (!res || !res.bots) return;

      const gold = res.bots['XAU-USD'];
      const btc = res.bots['BTC-USD'];

      clearScreen();
      console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
      console.log('║       ⚡ ALPHAFORGE AUTONOMOUS TRADING BOT - LIVE TESTNET HUD                ║');
      console.log('║       Dual-Asset Real-Time Execution with Institutional Risk Guards          ║');
      console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
      console.log('');

      // Gold Section
      if (gold) {
        const goldStatus = gold.active ? '🟢 ACTIVE (AUTOTRADING)' : '🔴 STOPPED';
        const goldPnlColor = gold.totalNetProfit >= 0 ? '\x1b[32m' : '\x1b[31m';
        const goldReset = '\x1b[0m';

        console.log(`🥇 [${gold.name}] - ${goldStatus}`);
        console.log(`   • Market Price: $${gold.lastPrice.toFixed(2)} / oz | Capital: $${gold.cash.toFixed(2)} | Equity: $${gold.equity.toFixed(2)}`);
        console.log(`   • Holding: ${gold.position} units @ Avg $${gold.entryPrice.toFixed(2)}`);
        console.log(`   • Risk Rules: Hard Stop -${gold.stopLossPct}% ($${(gold.entryPrice * (1 - gold.stopLossPct/100)).toFixed(2)}) | Target +${gold.takeProfitPct}% ($${(gold.entryPrice * (1 + gold.takeProfitPct/100)).toFixed(2)})`);
        console.log(`   • Net Profit: ${goldPnlColor}${formatUSD(gold.totalNetProfit)} (${gold.returnPct.toFixed(2)}%)${goldReset} | Win Rate: ${gold.winRatePct}% (${gold.winTrades}W / ${gold.lossTrades}L)`);
        console.log('────────────────────────────────────────────────────────────────────────────────');
      }

      // BTC Section
      if (btc) {
        const btcStatus = btc.active ? '🟢 ACTIVE (AUTOTRADING)' : '🔴 STOPPED';
        const btcPnlColor = btc.totalNetProfit >= 0 ? '\x1b[32m' : '\x1b[31m';
        const btcReset = '\x1b[0m';

        console.log(`₿ [${btc.name}] - ${btcStatus}`);
        console.log(`   • Market Price: $${btc.lastPrice.toFixed(2)} | Capital: $${btc.cash.toFixed(2)} | Equity: $${btc.equity.toFixed(2)}`);
        console.log(`   • Holding: ${btc.position} units @ Avg $${btc.entryPrice.toFixed(2)}`);
        console.log(`   • Risk Rules: Hard Stop -${btc.stopLossPct}% ($${(btc.entryPrice * (1 - btc.stopLossPct/100)).toFixed(2)}) | Target +${btc.takeProfitPct}% ($${(btc.entryPrice * (1 + btc.takeProfitPct/100)).toFixed(2)})`);
        console.log(`   • Net Profit: ${btcPnlColor}${formatUSD(btc.totalNetProfit)} (${btc.returnPct.toFixed(2)}%)${btcReset} | Win Rate: ${btc.winRatePct}% (${btc.winTrades}W / ${btc.lossTrades}L)`);
        console.log('────────────────────────────────────────────────────────────────────────────────');
      }

      // Trade Blotter Section
      console.log('📋 LATEST BOT ORDER BLOTTER:');
      const allTrades = [
        ...(gold ? gold.recentTrades.map(t => ({ ...t, sym: 'XAU-USD' })) : []),
        ...(btc ? btc.recentTrades.map(t => ({ ...t, sym: 'BTC-USD' })) : [])
      ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);

      if (allTrades.length === 0) {
        console.log('   (Waiting for strategy triggers... Bot is monitoring live price action)');
      } else {
        allTrades.forEach(t => {
          const actionTag = t.type === 'BUY' ? '\x1b[32m[BUY]\x1b[0m ' : '\x1b[33m[SELL]\x1b[0m';
          const pnlInfo = t.pnl !== undefined ? `| PnL: ${formatUSD(t.pnl)} (${t.returnPct}%)` : '';
          console.log(`   • ${actionTag} ${t.sym} @ $${t.fillPrice.toFixed(2)} (${t.units} units) ${pnlInfo}`);
          console.log(`     └─ Rationale: ${t.reason}`);
        });
      }

      console.log('');
      console.log('💡 Press Ctrl+C in this terminal window anytime to disconnect.');
    } catch (e) {
      // transient network poll error
    }
  }, 1000);
}

start();
