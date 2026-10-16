# 🏛️ AlphaForge Quant: Software Engineering (SWE) Standards & Best Practices

> **Mission**: In financial software engineering, bugs do not just cause crashes—**they cause direct financial loss**. This document defines the engineering standards, architecture patterns, and verification pipelines governing this codebase.

---

## 📐 1. Architectural Design Principles (SOLID)

### S — Single Responsibility Principle (SRP)
Each module in [`server/core/`](file:///d:/testing%20the%20project/quant-terminal/server/core/) owns exactly one domain:
- **[`indicators.js`](file:///d:/testing%20the%20project/quant-terminal/server/core/indicators.js)**: Pure mathematical functions (EMA, SMA, RSI, Sharpe, Sortino). Zero network calls, zero state.
- **[`backtester.js`](file:///d:/testing%20the%20project/quant-terminal/server/core/backtester.js)**: Event-driven portfolio accounting, order fill simulation, fee deduction, and equity curve generation.
- **[`liveFeedService.js`](file:///d:/testing%20the%20project/quant-terminal/server/core/liveFeedService.js)**: WebSocket network socket lifecycle, auto-reconnection backoff, and tick broadcasting.
- **[`regimeFilter.js`](file:///d:/testing%20the%20project/quant-terminal/server/core/regimeFilter.js)**: Statistical classification of market regimes (Bull, Bear, Volatility Shock).
- **[`telegramService.js`](file:///d:/testing%20the%20project/quant-terminal/server/services/telegramService.js)**: Formatting, sanitization, and delivery of trade push notifications.

### O — Open / Closed Principle (OCP)
The strategy layer in **[`strategies.js`](file:///d:/testing%20the%20project/quant-terminal/server/core/strategies.js)** is open for extension but closed for modification. New strategies (like Machine Learning models or custom arbitrage) can be added as standalone evaluator functions without altering the execution or backtesting engines.

---

## 🧪 2. Automated Testing Suite & CI/CD

All mathematical formulas, risk rules, and execution engines are backed by automated unit tests located in the **[`tests/`](file:///d:/testing%20the%20project/quant-terminal/tests/)** directory:

```bash
# Run the complete test suite
npm test
```

### Test Coverage Matrix:
1. **[`indicators.test.js`](file:///d:/testing%20the%20project/quant-terminal/tests/indicators.test.js)**:
   - Validates rolling mathematical accuracy of SMA and exponential smoothing of EMA.
   - Asserts RSI strictly bounded between $[0, 100]$.
   - Asserts Sharpe & Sortino ratios handle zero-variance / flat markets without division-by-zero crashes.
   - Tests Maximum Drawdown calculation from historical peaks.
2. **[`backtester.test.js`](file:///d:/testing%20the%20project/quant-terminal/tests/backtester.test.js)**:
   - Asserts realistic order fill execution, slippage penalty, and commission fee deductions.
   - Asserts zero or negative capital blocks order entry cleanly.
   - Verifies trade blotter ID sequencing and holding period calculations.
3. **[`riskGuards.test.js`](file:///d:/testing%20the%20project/quant-terminal/tests/riskGuards.test.js)**:
   - Tests AI Regime Filter during artificial volatility shock spikes.
   - Verifies false breakout signals are rejected in choppy conditions.

---

## 🛡️ 3. Defensive Programming & Fault Tolerance

### 3.1 Idempotent Order Execution
To prevent **duplicate order execution** if multiple ticks arrive within milliseconds:
- The trading engine checks state invariants before firing:
  $$\text{Can BUY} \iff (\text{position} = 0) \land (\text{cash} \ge \text{minAllocation}) \land (\text{bot.active} = \text{true})$$
- Orders are locked with state transitions so concurrent tick callbacks cannot trigger multiple parallel buys.

### 3.2 Safe Fallbacks & Divide-by-Zero Guards
- In financial math, variance ($\sigma^2$) or downside deviation can equal zero (e.g. during flat price movement).
- All indicators check `if (stdDev === 0 || !isFinite(stdDev)) return 0;` rather than allowing `NaN` or `Infinity` to propagate into portfolio accounting.

### 3.3 Fail-Safe State Machine
- If an exchange WebSocket disconnects, the socket layer automatically enters an exponential backoff reconnect loop (3s).
- The bot retains its current position in memory and preserves Stop-Loss levels until connection is re-established.

---

## 🔒 4. The 12-Factor App & Secret Management

1. **Strict Zero-Secrets in Git**:
   - Private API keys, Telegram Bot Tokens, and personal Chat IDs are saved in `.env` or `telegram_config.json`.
   - Both files are permanently declared in [`.gitignore`](file:///d:/testing%20the%20project/quant-terminal/.gitignore).
2. **Input Sanitization**:
   - Incoming Telegram commands and user-configured credentials are sanitized via regex validation and HTML escaping to prevent cross-site scripting (XSS) or command injection.

---

## 📊 5. Observability & Audit Logs

Every order executed by the bot records an immutable blotter entry with:
- **Timestamp**: Microsecond-accurate execution time.
- **Fill Price**: Slippage-adjusted execution price.
- **Position Size**: Exact units bought/sold.
- **Strategy Trigger & AI Confidence**: The exact mathematical rationale behind the trade.
- **Realized PnL & Cumulative Equity**: Auditable profit/loss accounting.
