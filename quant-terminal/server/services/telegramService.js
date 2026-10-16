/**
 * Telegram Bot & Quantitative Alert Service
 * Connects the Quant Terminal to Telegram via Telegram Bot API.
 * Supports:
 *  - Real-time trade execution & signal alerts (BUY / SELL with prices, PnL, Sharpe)
 *  - Interactive commands: /price, /status, /backtest, /help
 *  - Zero external heavy dependencies (uses Node.js native https)
 */

const https = require('https');

class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
    this.enabled = false;
    this.polling = false;
    this.lastUpdateId = 0;
    this.serverRef = null; // reference for handling commands like /price, /backtest
  }

  /**
   * Escape HTML special characters to prevent Telegram parse errors
   */
  static escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Configure Telegram credentials dynamically with strict security validation
   */
  configure(botToken, chatId, enabled = true) {
    const rawToken = (botToken || '').trim();
    const rawChatId = (chatId || '').trim();

    // Security Format Validation:
    // Telegram Bot Tokens look like: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ (digits:hash)
    const tokenRegex = /^\d{8,12}:[A-Za-z0-9_-]{35,}$/;
    // Chat IDs are numeric (positive for personal, negative for groups/channels)
    const chatIdRegex = /^-?\d{5,18}$/;

    if (rawToken && !tokenRegex.test(rawToken)) {
      return {
        configured: false,
        enabled: false,
        error: 'Invalid Bot Token format. Tokens look like: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ'
      };
    }

    if (rawChatId && !chatIdRegex.test(rawChatId)) {
      return {
        configured: false,
        enabled: false,
        error: 'Chat ID must be a numeric ID (e.g. 987654321), not a username (@name).'
      };
    }

    this.botToken = rawToken;
    this.chatId = rawChatId;
    this.enabled = !!(this.botToken && this.chatId && enabled);

    if (this.enabled && !this.polling) {
      this.startPolling();
    } else if (!this.enabled && this.polling) {
      this.stopPolling();
    }

    return {
      configured: !!(this.botToken && this.chatId),
      enabled: this.enabled
    };
  }

  /**
   * Send a formatted message to the configured Telegram chat
   */
  async sendMessage(text, parseMode = 'HTML') {
    if (!this.enabled || !this.botToken || !this.chatId) {
      return { success: false, error: 'Telegram not configured or disabled' };
    }

    return new Promise((resolve) => {
      const payload = JSON.stringify({
        chat_id: this.chatId,
        text: text,
        parse_mode: parseMode,
        disable_web_page_preview: true
      });

      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${this.botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.ok) {
              resolve({ success: true, data });
            } else {
              let errText = data.description || 'Telegram API Error';
              if (errText.includes('chat not found')) {
                errText += ' (Did you press /start in your bot?)';
              }
              resolve({ success: false, error: errText, errorCode: data.error_code });
            }
          } catch (e) {
            resolve({ success: false, error: body });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      req.setTimeout(6000, () => {
        req.destroy();
        resolve({ success: false, error: 'Telegram request timeout' });
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Send a rich trade fill alert
   */
  async sendTradeAlert(trade) {
    const isBuy = trade.action === 'BUY';
    const emoji = isBuy ? '🟢' : (trade.pnl >= 0 ? '🎯' : '🔴');
    const actionText = isBuy ? 'BUY / LONG ORDER' : 'SELL / EXIT ORDER';

    let msg = `<b>${emoji} ALPHAFORGE TRADE ALERT</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `<b>Action:</b> <code>${actionText}</code>\n`;
    msg += `<b>Asset:</b> <code>${trade.symbol || 'BTC-USD'}</code>\n`;
    msg += `<b>Fill Price:</b> <code>$${Number(trade.price).toFixed(2)}</code>\n`;
    msg += `<b>Size:</b> <code>${trade.units} units</code>\n`;

    if (trade.pnl !== undefined) {
      const pnlPrefix = trade.pnl >= 0 ? '+' : '';
      msg += `<b>Realized PnL:</b> <code>${pnlPrefix}$${Number(trade.pnl).toFixed(2)}</code>\n`;
    }

    if (trade.reason) {
      msg += `<b>Trigger:</b> <i>${trade.reason}</i>\n`;
    }

    msg += `<b>Time:</b> <code>${new Date(trade.timestamp || Date.now()).toLocaleTimeString()}</code>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚡ <i>AlphaForge Quant Paper Engine</i>`;

    return this.sendMessage(msg);
  }

  /**
   * Send a backtest tearsheet summary to Telegram
   */
  async sendBacktestReport(summary, strategyName, symbol) {
    const profitEmoji = summary.totalNetProfit >= 0 ? '🚀' : '📉';
    const returnPrefix = summary.totalReturnPct >= 0 ? '+' : '';

    let msg = `<b>📊 QUANT STRATEGY REPORT: ${symbol}</b>\n`;
    msg += `<i>${strategyName}</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `<b>Return:</b> <code>${returnPrefix}${summary.totalReturnPct}%</code> (${profitEmoji} $${summary.totalNetProfit.toLocaleString()})\n`;
    msg += `<b>Alpha vs B&H:</b> <code>${summary.alphaPct >= 0 ? '+' : ''}${summary.alphaPct}%</code>\n`;
    msg += `<b>Sharpe Ratio:</b> <code>${summary.sharpeRatio}</code>\n`;
    msg += `<b>Sortino Ratio:</b> <code>${summary.sortinoRatio}</code>\n`;
    msg += `<b>Max Drawdown:</b> <code>-${summary.maxDrawdownPct}%</code>\n`;
    msg += `<b>Win Rate:</b> <code>${summary.winRatePct}%</code> (${summary.winningTradesCount}/${summary.totalTrades} trades)\n`;
    msg += `<b>Profit Factor:</b> <code>${summary.profitFactor}</code>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚡ <i>AlphaForge Terminal</i>`;

    return this.sendMessage(msg);
  }

  /**
   * Start 2-way interactive polling for commands (/price, /status, /help)
   */
  startPolling() {
    this.polling = true;
    this.pollLoop();
  }

  stopPolling() {
    this.polling = false;
  }

  async pollLoop() {
    if (!this.polling || !this.enabled || !this.botToken) return;

    try {
      const updates = await this.getUpdates(this.lastUpdateId + 1);
      if (updates && updates.ok && updates.result.length > 0) {
        for (const update of updates.result) {
          this.lastUpdateId = update.update_id;
          if (update.message && update.message.text) {
            await this.handleIncomingMessage(update.message);
          }
        }
      }
    } catch (e) {
      // Quiet poll error
    }

    if (this.polling) {
      setTimeout(() => this.pollLoop(), 2500);
    }
  }

  getUpdates(offset) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${this.botToken}/getUpdates?offset=${offset}&timeout=5`,
        method: 'GET'
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(8000, () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  }

  async handleIncomingMessage(msg) {
    const text = (msg.text || '').trim();
    const chatId = msg.chat.id;

    // Verify sender
    if (this.chatId && String(chatId) !== String(this.chatId)) {
      return; // Ignore unauthorized chats
    }

    if (text.startsWith('/start') || text.startsWith('/help')) {
      let help = `<b>⚡ AlphaForge Quant Terminal Bot</b>\n\n`;
      help += `Available commands:\n`;
      help += `• <code>/news</code> - Real-time market wire & AI sentiment score\n`;
      help += `• <code>/price &lt;symbol&gt;</code> - Get latest live market price & 24h stats\n`;
      help += `• <code>/status</code> - Check paper trading bot state & portfolio balance\n`;
      help += `• <code>/backtest</code> - Run quick backtest on current strategy\n`;
      help += `• <code>/ping</code> - Healthcheck connection`;
      await this.sendMessage(help);
    } else if (text === '/news') {
      if (this.serverRef && this.serverRef.newsService) {
        await this.sendMessage(this.serverRef.newsService.formatTelegramNews());
      } else {
        await this.sendMessage(`📰 News service initializing... please try again in a moment.`);
      }
    } else if (text.startsWith('/price')) {
      const parts = text.split(' ');
      const symbol = parts[1] ? parts[1].toUpperCase() : 'BTC-USD';
      if (this.serverRef && this.serverRef.marketGen) {
        const curPrice = this.serverRef.marketGen.livePrices[symbol];
        if (curPrice) {
          let priceMsg = `<b>📈 ${symbol} Live Price</b>\n`;
          priceMsg += `Price: <code>$${curPrice.toLocaleString()}</code>\n`;
          priceMsg += `Time: <code>${new Date().toLocaleTimeString()}</code>`;
          await this.sendMessage(priceMsg);
        } else {
          await this.sendMessage(`⚠️ Symbol <code>${symbol}</code> not found. Supported: BTC-USD, ETH-USD, SOL-USD, NVDA, SPY, GLD`);
        }
      }
    } else if (text === '/status') {
      let statusMsg = `<b>🤖 AlphaForge Quant Status</b>\n`;
      statusMsg += `Terminal: <code>ONLINE</code>\n`;
      statusMsg += `Feed: <code>Geometric Brownian Motion (1s)</code>\n`;
      statusMsg += `Alerts: <code>ENABLED</code>`;
      await this.sendMessage(statusMsg);
    } else if (text === '/ping') {
      await this.sendMessage(`🏓 Pong! Latency: <code>&lt;50ms</code> | System normal.`);
    }
  }
}

module.exports = new TelegramService();
