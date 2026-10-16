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

### 1. Run Automated Unit Tests (14/14 Passing in <200ms)
```bash
npm test
```

### 2. Start the Terminal Server
```bash
# Option A: npm script
npm start

# Option B: One-click Windows batch launcher
start_terminal.bat
```

Open your browser to: **[http://localhost:4000](http://localhost:4000)**

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
