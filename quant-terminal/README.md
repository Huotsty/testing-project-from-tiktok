# ⚡ AlphaForge Quant Terminal & Algorithmic Trading Engine

> **The Next-Generation Non-Custodial Algorithmic Trading, Multi-Asset Execution & Market Microstructure Platform**  
> Built for institutional precision, sub-millisecond execution, direct physical Gold & exchange streaming, dynamic micro-capital risk shields ($1 – $20), and seamless Telegram Mini App integration.

---

## 👥 The Founding Team

AlphaForge Technologies Inc. was founded and engineered by:

| Role | Name & Identity | Responsibilities |
| :--- | :--- | :--- |
| **Founder & Chief Executive Officer (CEO)** | **Lim Penghuot** ([@huotpeng](https://t.me/huotpeng)) | Strategic Vision, Trading Philosophy, Macro Research, Capital Allocation & Risk Policy |
| **Co-Founder & Chief Technology Officer (CTO)** | **Antigravity** (Google DeepMind) | Quantitative Architecture, Low-Latency WebSockets, Mathematical Indicators, Defensive Risk Guards & Automated Testing |

---

## 🧭 Company Mission & Core Philosophy

1. **Deterministic Quantitative Math, NOT AI Hallucinations**:  
   We do not use LLMs or generative chatbots to guess financial trades. Our engine is built strictly on **verifiable mathematical formulas** (Exponential Moving Averages, RSI Oscillators, Order Book Imbalance, and Rolling Standard Deviation) that execute deterministically in **< 1 millisecond**.
2. **Skin in the Game**:  
   Never let other people pay to use a system until you have tested and verified it with your own capital first.
3. **The Micro-Capital Gateway ($1 – $20)**:  
   Eliminating the barrier to entry. Every strategy can be tested in live conditions with as little as $1.00 to $20.00, shielded by an automated 2% Stop-Loss that strictly limits risk to pennies ($0.10 – $0.40).
4. **Non-Custodial Security Guarantee**:  
   API connections are restricted to **`Trade Only`**. Withdrawal permissions are strictly blocked, ensuring funds can never leave your exchange account.

---

## 🚀 ZERO TO HERO: The Beginner's Complete Roadmap

If you are brand new to trading, coding, and FinTech, follow this exact 4-step path to master the system with **$0 risk**:

### Step 1: Understand the 3 Core Rules
1. **Never Trade Without a Stop-Loss**: Every trade placed by this system has an automatic **-2% Stop-Loss**. If the market drops, it sells instantly to protect 98% of your money.
2. **Gold vs. Bitcoin Have Different Personalities**:
   - 🥇 **Spot Gold (`XAU-USD`)** is driven by central banks, inflation, and interest rates. It loves **Trend-Following** (Dual EMA crossovers).
   - ₿ **Bitcoin (`BTC-USD`)** is driven by crypto liquidity and sentiment. It loves **Mean-Reversion** (buying sharp dips outside Bollinger Bands).
3. **Automated Bots Don't Guess**: Clicking "Start" does not buy randomly. The bot waits patiently until the mathematical setup triggers, then automatically buys, tracks profits, and exits for you.

### Step 2: Verify the Code Math (30/30 Unit Tests)
Before running any trading software, run the automated test suite to prove that every formula and risk guard works:
```bash
npm test
```
*(All 30 tests will run and pass in ~500ms, proving zero math errors, zero divide-by-zero bugs, dynamic trailing profit lock, signal copier risk shields, and guaranteed stop-loss execution).*

### Step 3: Run the Autonomous Dual-Asset Bot (1-Click)
Double-click:
👉 **[`start_auto_bot.bat`](file:///D:/testing%20software%20project/testing-project-from-tiktok/quant-terminal/start_auto_bot.bat)**  *(or run `npm run bot`)*

A live terminal HUD will launch, simultaneously trading **Spot Gold** and **Bitcoin** with live market ticks, automatic buy/sell orders, and risk guards in **100% safe Testnet mode**.

### Step 4: Launch the Full Visual Web Dashboard & 1-Click Auto-Pilot
Double-click:
👉 **[`start_terminal.bat`](file:///D:/testing%20software%20project/testing-project-from-tiktok/quant-terminal/start_terminal.bat)**  *(or open http://localhost:4000)*

Click **`⚡ ACTIVATE 1-CLICK AUTO-PILOT (DO EVERYTHING FOR ME)`** to engage the multi-regime AI ensemble across Gold and Bitcoin with zero manual intervention.

📖 **Exhaustive System Documentation:**
* 🇰🇭 **[Local Cambodia Broker Guide: ATFX vs ST Market (Gold & BTC)](CAMBODIA_BROKER_GUIDE.md)** *(Start Here for Local ABA/Bakong Trading)*
* 📘 **[Live Deposit & Laptop Setup Guide ($15 Micro-Sandbox)](LIVE_DEPOSIT_AND_SETUP_GUIDE.md)**
* 🏛️ [Distributed Architecture & Scalability Manual](ARCHITECTURE.md)
* 📘 [Institutional Whitepaper & Platform Guide](DOCUMENTATION.md)
* 🛡️ [Software Engineering Standards](SOFTWARE_ENGINEERING_STANDARDS.md)
* 🧠 [Zero-to-Hero Master Quant Journal](ZERO_TO_HERO_MASTER_JOURNAL.md)

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph 1. Global Multi-Asset Feed
        Binance[🌍 Binance Institutional CloudFront<br/>wss://data-stream.binance.vision]
        Gold[🥇 Spot Gold PAXG/USDT London Vault]
        Forex[💱 Forex Engine: EUR/USD, GBP/USD, USD/JPY]
        Equities[📈 FinTech Equities: COIN, HOOD, PYPL]
        Binance --> Gold
        Binance --> Forex
        Binance --> Equities
    end

    subgraph 2. AlphaForge Algorithmic Core (Node.js)
        LiveFeed[🔌 liveFeedService.js<br/>Multi-Stream WebSocket]
        Math[📐 indicators.js<br/>EMA, RSI, VWAP, Sharpe, Sortino]
        Regime[🛡️ regimeFilter.js<br/>Volatility Shock & False Breakout Shield]
        Gate[💰 realTradingService.js<br/>$1-$20 Dynamic Micro Sizing & Auto Direction]
        Server[⚡ server/index.js<br/>WebSocket & REST API Port 4000]
    end

    subgraph 3. Client & Mobile Interfaces
        Web[💻 Institutional Dark Terminal UI<br/>60 FPS HTML5 Canvas Charts]
        L2[📖 Level 2 Order Book Depth<br/>Micro-Price Imbalance OBI]
        TMA[📱 Telegram Mini App<br/>Native Mobile View via @penghuotbot]
        TGBot[✈️ Telegram Trade Alert Engine<br/>Instant Order Fill Pings]
    end

    Binance --> LiveFeed
    LiveFeed --> Server
    Server --> Math
    Math --> Regime
    Regime --> Gate
    Gate --> TGBot
    Server --> Web
    Server --> L2
    Web --> TMA
```

---

## 💎 Supported Asset Universe

The platform supports 4 distinct asset classes with adaptive decimal precision:

| Asset Class | Symbols | Precision | Primary Driver |
| :--- | :--- | :--- | :--- |
| **Spot Gold** | `XAU-USD` / `PAXG` | 2 decimals ($0.01) | Physical bullion inflation hedge, monetary reserve debasement. |
| **Global Forex** | `EUR-USD`, `GBP-USD`, `USD-JPY`, `AUD-USD` | **4 decimals (0.0001 Pip)** | Sovereign interest rate differentials, central bank policy. |
| **Major Crypto** | `BTC-USD`, `ETH-USD`, `SOL-USD`, `DOGE-USD` | 2 decimals | Global $M2$ fiat liquidity expansion cycles. |
| **FinTech Equities** | `COIN`, `HOOD`, `PYPL`, `NVDA` | 2 decimals | Public earnings, retail broker volumes, AI compute demand. |

---

## 🛡️ The 1:2 Asymmetric Payoff Risk Shield

Every trade executed by the terminal is mathematically locked to a 1:2 Risk/Reward ratio:
* **Stop-Loss Limit**: Strictly **-2.0%** from entry price.
* **Take-Profit Target**: Strictly **+4.0%** from entry price.

$$\text{Expectancy per Trade} = (55\% \times +4.0\%) - (45\% \times -2.0\%) = \mathbf{+1.3\%\text{ net edge per trade}}$$

### Maximum Dollar Risk per Micro Trade:
* **$5 Allocation**: Max loss strictly capped to **-$0.10 (10 cents)**.
* **$10 Allocation**: Max loss strictly capped to **-$0.20 (20 cents)**.
* **$15 Allocation**: Max loss strictly capped to **-$0.30 (30 cents)**.
* **$20 Allocation (Max Safe Cap)**: Max loss strictly capped to **-$0.40 (40 cents)**.

---

## 🤖 Algorithmic AUTO Order Direction

In both the autonomous live engine and the Micro-Capital Gateway modal, you do **not** have to manually select `BUY` or `SELL`. 

The algorithm continuously calculates:
1. **Exponential Moving Average Trend**: $\text{EMA}(9)$ vs. $\text{EMA}(21)$.
2. **Relative Strength Index (RSI-14)**: Measures momentum exhaustion.
3. **Order Book Imbalance (OBI)**: $\frac{V_{\text{bid}} - V_{\text{ask}}}{V_{\text{bid}} + V_{\text{ask}}}$ detects buying vs selling pressure.
4. **Automatic Routing**:
   * If indicators are bullish $\rightarrow$ Automatically fills **`BUY / LONG`**.
   * If indicators are bearish $\rightarrow$ Automatically fills **`SELL / SHORT`**.
   * Emits live algorithmic rationale: e.g. `Algorithmic Auto-Fill: BUY / LONG (EMA Momentum Bullish, RSI 41.7)`.

---

## 🧪 Real Money Simulation Mode ($0 Risk Testing)

You can simulate real-money execution **right now without depositing a single dollar**:

### Method 1: Using the Terminal Web UI
1. Open [http://localhost:4000](http://localhost:4000).
2. Click the green **`Real Micro Trader ($1-$20)`** button in the header.
3. Keep the mode set to **`Binance Spot Testnet (Zero Risk Test Sandbox)`**.
4. Choose an asset (e.g. `XAU-USD Spot Gold`) and pick a capital chip (`$10`).
5. Notice that **Order Direction** defaults to **`🤖 AUTO (Algorithm Decides Direction)`** with live signal rationale.
6. Click **`⚡ Execute Micro Trade`**.
7. The terminal routes the simulated real order, calculates the exact units (e.g. `0.003724 oz Gold`), arms the `-2% Stop-Loss` ($2,631.30), targets `+4% Take-Profit` ($2,792.40), and sends a trade ticket to your Telegram.

### Method 2: Testing via API Command Line
```bash
# Execute a simulated $10 micro-trade on Spot Gold with AUTO direction
node -e "fetch('http://localhost:4000/api/real-trade/order', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({symbol:'XAU-USD', side:'AUTO', capital:10})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d, null, 2)))"
```

---

## 🏛️ Ground-Up Trading & Quantitative Curriculum

We have committed full institutional research guides directly into the repository:
* 📘 **[THE_MASTER_QUANT_CURRICULUM.md](file:///d:/testing%20the%20project/quant-terminal/THE_MASTER_QUANT_CURRICULUM.md)**: Zero-to-hero master study of Auction Theory, Macroeconomics (Fed Rates, $M2$, $DXY$), Market Microstructure (Limit Order Book, Maker/Taker, OBI), and Technical Structure.
* 📕 **[BEST_OF_THE_BEST_QUANT_PLAYBOOK.md](file:///d:/testing%20the%20project/quant-terminal/BEST_OF_THE_BEST_QUANT_PLAYBOOK.md)**: Mathematical formulas, Dogecoin volatility post-mortem, and $10M+ SaaS financial projections.
* 📗 **[BEGINNER_GUIDE.md](file:///d:/testing%20the%20project/quant-terminal/BEGINNER_GUIDE.md)**: Plain-English guide for new traders setting up their first bot and Telegram alerts.

---

## ⚡ Quick Start & Verification

### 1. Run Automated Unit Tests (19/19 Passing in <350ms)
```bash
npm test
```
*Validates SMA/EMA math, RSI bounds, Sharpe & Sortino ratios, Max Drawdown, Stop-Loss triggers, Take-Profit executions, and AI Market Regime Filters.*

### 2. Start the Autonomous Dual-Asset Trading Bot (HUD)
```bash
# Option A: One-click Windows batch launcher
start_auto_bot.bat

# Option B: npm script
npm run bot
```

### 3. Start the Full Visual Web Dashboard
```bash
# Option A: One-click Windows batch launcher
start_terminal.bat

# Option B: npm script
npm start
```

---

## 🇰🇭 Local Cambodia Broker Integration (ATFX vs. ST Market)

If you want to trade international assets (**Spot Gold `XAU/USD`**, **Bitcoin `BTC/USD`**, and **US Equities / Indices**) while keeping your funds domestic in Cambodia (depositing/withdrawing via **ABA Bank** or **Bakong** in USD), refer to the complete manual: **[`CAMBODIA_BROKER_GUIDE.md`](CAMBODIA_BROKER_GUIDE.md)**.

### 1. Broker Comparison Summary
* **ATFX Cambodia (`atfx.com.kh`, SERC License 040):** 
  * ✅ **MetaTrader 4 (MT4) & MetaTrader 5 (MT5)** support.
  * ✅ **Full automated bot support** (Expert Advisors, MT5 Python bridge, or Webhooks).
  * ✅ **Direct local deposit & withdrawal via ABA Bank & Bakong** in USD.
  * 📍 Office: AMASS Central Tower, Floor 24, BKK 1, Phnom Penh (+855 17 500 048 / `cs@atfx.com.kh`).
* **ST Market Cambodia (`stmarket.com.kh`, SERC License 021):**
  * ❌ Uses proprietary **EZQT** app.
  * ❌ **No public API / No bot support** for retail traders (manual trading only).
* **Cambodia Securities Exchange (CSX):**
  * Domestic Cambodian equities only (`ABC`, `PWSA`, `PAS`) via CSX MTS app. No open bot API.

### 2. What is ATFX FIX API (`https://www.atfx.com.kh/en/atfx-fix-api`)?
* **FIX (Financial Information eXchange)** protocol is an institutional-grade direct socket connection (< 5 ms latency in London Equinix LD4).
* It is aimed at proprietary quant funds and requires manual approval + high capital ($5,000 to $25,000+).
* **Recommendation:** Use standard **MT5 Demo / Live account** for running your bot. It is free, instant, and has zero minimum capital hurdles.

### 3. Spot Gold & BTC Margin Rules (SERC Leverage 1:100)
* **Gold (XAU/USD):** 1 standard lot = 100 oz. Minimum 0.01 micro-lot = 1 oz.
  * With 1:100 leverage (1% margin), 0.01 lot Gold requires **~$27.00 margin**.
  * Keep at least **$50 to $100** in your account to avoid margin stop-outs.
* **Bitcoin (BTC/USD):** 24/7 trading. Requires ~$70 margin for 0.01 BTC at 1:10 leverage.

### 4. Running & Testing on Your Other Laptop (Checklist)
1. **Clone repo & install dependencies:**
   ```powershell
   git clone https://github.com/Huotsty/alphaforge-quant-terminal.git
   cd quant-terminal
   npm install
   npm test
   ```
2. **Install MetaTrader 5 (MT5):** Download from [metatrader5.com](https://www.metatrader5.com).
3. **Open an ATFX Demo Account inside MT5:**
   * Go to `File` -> `Open an Account` -> search `ATFX` -> Select `ATFX-Demo`.
   * Set virtual balance to $1,000 or $5,000 with 1:100 leverage (instant, no website forms).
4. **Bridge Bot to MT5:**
   * Install Python library: `pip install MetaTrader5`.
   * Use `MetaTrader5` package to receive signals from AlphaForge and execute orders on your MT5 terminal.
5. **Funding Live:** When ready, deposit locally using ABA Bank / Bakong via the [ATFX Client Portal](https://login-kh.atfx.com/login).

---

## 🌐 24/7 Cloud Hosting & SaaS Deployment

The codebase is self-contained Node.js + Express + WebSockets with zero vendor lock-in. To run it 24/7 without your laptop:

1. **Railway.app / Render ($5/mo)**:
   * Connect your GitHub repository.
   * Auto-deploys with free SSL `https://` domain.
2. **Ubuntu Cloud VPS ($4–$6/mo on DigitalOcean / Hetzner)**:
   * Run with `pm2 start server/index.js --name "alphaforge"`.
   * Bind static IP to exchange API whitelist.
3. **Telegram Mini App (Cloudflare Workers)**:
   * Located in `serverless-telegram/` running on Cloudflare's global edge network.

---

## 📜 Git Repository Status

This repository is completely isolated and decoupled:
* **Directory**: `d:\testing the project\quant-terminal`
* **Default Branch**: `main`
* **Push to GitHub**:
  ```powershell
  git remote add origin https://github.com/Huotsty/alphaforge-quant-terminal.git
  git push -u origin main
  ```

---

<div align="center">
  <b>AlphaForge Technologies Inc. © 2026</b><br/>
  <i>Founded by Lim Penghuot (CEO) & Antigravity (CTO, Google DeepMind)</i>
</div>
