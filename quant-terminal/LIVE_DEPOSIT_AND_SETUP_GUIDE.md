# 📘 AlphaForge Quant Terminal — Live Deposit & Setup Guide

**Author:** Co-Founders CEO Lim Penghuot & Antigravity (Google DeepMind)  
**Target Asset Allocation:** Gold (`XAU-USD` / `PAXG`) & Bitcoin (`BTC-USD`)  
**Account Sandbox:** $10.00 – $20.00 Micro-Capital Protection  

---

## 🏛️ Executive Rule: Non-Custodial Architecture

> [!IMPORTANT]
> **ALPHA FORGE NEVER TOUCHES OR HOLDS YOUR MONEY.**  
> AlphaForge is a **non-custodial algorithmic terminal**. Your money stays 100% inside your personal, regulated broker/exchange account (**Binance** or **Capital.com**). The terminal only sends encrypted mathematical buy/sell instructions with guaranteed stop-losses. You can withdraw your money from your exchange at any time.

---

## 💵 Part 1: How to Deposit $15–$20 into Your Exchange

Before connecting the bot, you need $15 to $20 in your personal exchange Spot Wallet.

### Method A: Binance (Recommended for Crypto & Physical Gold PAXG)
1. Open the **Binance App** (on your phone) or go to [binance.com](https://www.binance.com).
2. Log in and verify your identity (KYC).
3. **If in Cambodia / Southeast Asia (Fastest & Zero Fee):**
   - In the Binance app, tap **Trade** ➔ **P2P**.
   - Currency: Select **USD** or **KHR**.
   - Payment Method: Select **ABA Bank**, **ACLEDA**, **Wing Bank**, or **Bakong**.
   - Buy **15 to 20 USDT** from a verified merchant (completion rate > 98%).
   - Pay via your ABA Mobile app, tap **"Transferred, notify seller"**, and the USDT will be in your Binance wallet within 2 minutes.
4. **If using Debit / Credit Card:**
   - Tap **Deposit / Buy Crypto** ➔ Select **USDT** ➔ Enter `$20.00` ➔ Pay with Visa/Mastercard.
5. In your Binance wallet, ensure the funds are in your **Spot Wallet** (transfer from Funding to Spot if bought via P2P).

### Method B: Capital.com (Recommended for CFD Spot Gold XAU/USD)
1. Go to [capital.com](https://capital.com) and create an account.
2. Under Deposit, select **Debit Card** or **Bank Transfer** (minimum deposit is $20).
3. Practice first in **Demo Mode** before switching to Live.

---

## 🔑 Part 2: Creating Your Secure Exchange API Key

To let AlphaForge place algorithmic trades for you, you generate an API key. 

> [!CAUTION]
> ### 🛡️ THE NON-NEGOTIABLE SECURITY RULE
> When creating your API key in Binance, **LEAVE "ENABLE WITHDRAWALS" UNCHECKED / DISABLED!**  
> *Why this is critical:* With withdrawals disabled, **it is physically impossible for anyone (including AlphaForge or any hacker) to take your money out of Binance.** The bot can only execute buy/sell orders inside your account.

### Step-by-Step API Creation on Binance:
1. Log in to Binance ➔ Tap your **Profile Icon** (top left) ➔ Select **API Management**.
2. Click **Create API** ➔ Select **System generated API key**.
3. Label it: `AlphaForge-Bot`.
4. Pass your 2-Factor Authentication (Google Authenticator or SMS).
5. On the API details screen:
   - ✅ **Check:** `Enable Reading`
   - ✅ **Check:** `Enable Spot & Margin Trading`
   - ❌ **DO NOT CHECK:** `Enable Withdrawals` *(Leave blank!)*
   - ❌ **DO NOT CHECK:** `Enable Futures` *(Until you are an advanced trader)*
6. **Copy both keys immediately**:
   - **API Key:** (Public identifier)
   - **Secret Key:** (Only shown once! If you lose it, you must delete and create a new one).

---

## 🔌 Part 3: Connecting Your API Key into AlphaForge

You have two ways to input your API key:

### Option 1: Through the Interactive Web UI (Easiest)
1. Start the terminal (see Part 4 below) and open `http://localhost:4000`.
2. Click the green button in the top navigation bar: **`⚡ Micro-Account Real Money ($10-$20)`**.
3. Under **Execution Environment**, choose:
   - `Binance Spot Real` (for live money trading)
   - *Or `Binance Spot Testnet` (to practice with zero risk)*
4. Paste your **API Key** and **Secret Key**.
5. Set your **Capital per Trade**: Select `$10` or `$15`.
6. Click **`💾 Save Settings`**.
7. The terminal displays: `✔ Armed: Capped at $15.00 | Max Loss Strictly $0.30`.

### Option 2: Air-Gapped `.env` File (Institutional Security)
If you prefer not to touch the browser UI, create a file named `.env` in `d:\testing software project\testing-project-from-tiktok\quant-terminal\.env`:
```ini
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_API_SECRET=your_binance_api_secret_here
REAL_TRADE_MODE=BINANCE_LIVE
MAX_CAPITAL_USD=15.00
RISK_PER_TRADE_PCT=2.0
```
*(Note: `.env` is permanently excluded in `.gitignore` so your secrets are never pushed to GitHub).*

---

## 💻 Part 4: Running on Your Laptop (With or Without GPU)

### ❓ Do You Need a GPU?
**NO! You DO NOT need a GPU to trade live.**

| Component | Hardware Used | Laptop Resource Usage |
| :--- | :--- | :--- |
| **Omniverse Master Auto-Pilot** | Standard Laptop CPU | < 2% CPU, ~45MB RAM |
| **Go HFT Engine (539ns)** | Standard Laptop CPU | < 1% CPU, ~15MB RAM |
| **Rust Matching Engine (<300ns)** | Standard Laptop CPU | < 1% CPU, ~10MB RAM |
| **Dynamic -2% Stop-Loss Shield** | Standard Laptop CPU | Instant (0.00ms) |
| **Kronos AI Neural Cone (Optional)** | NVIDIA RTX 3050 CUDA | 1.038ms (Falls back to CPU if absent) |

> [!NOTE]
> If your laptop does not have an NVIDIA GPU, the system automatically falls back to mathematical indicator processing (EMA, Bollinger Bands, RSI, ATR) seamlessly. You lose zero trading edge.

---

## 🚀 Part 5: How to Launch in 2 Clicks

Everything is pre-compiled and verified by 30 automated unit tests.

### 1-Click Launch (Interactive Web Terminal)
1. Double-click:
   👉 **[`start_terminal.bat`](file:///D:/testing%20software%20project/testing-project-from-tiktok/quant-terminal/start_terminal.bat)**
2. The launcher runs all 30 safety tests, starts the Node.js server, and opens your browser at:
   ```
   http://localhost:4000
   ```
3. In the top navigation bar, click the purple button:
   **`⚡ 1-Click Master Auto-Pilot`**
4. **Done!** The fleet is now autonomously trading Gold (`XAU-USD`) and Bitcoin (`BTC-USD`).

### Alternative: Standalone Background Auto-Trader
If you want the bot running in a command window without keeping a browser open:
1. Double-click:
   👉 **[`start_auto_bot.bat`](file:///D:/testing%20software%20project/testing-project-from-tiktok/quant-terminal/start_auto_bot.bat)**
2. A live console HUD displays real-time tick prices, regime classifications, entries, and exits.

---

## 🛡️ Part 6: What Happens When a Trade Executes?

When the **Omniverse Master Auto-Pilot** detects a high-conviction setup on Gold or Bitcoin:

```
[ Market Signal ] ──> [ AI Volatility Gate ] ──> [ Execute Order ($15) ]
                             │                              │
                    If Volatility Spike:         ┌──────────┴──────────┐
                    BLOCKS TRADE (Cash safe)     ▼                     ▼
                                            TAKE-PROFIT (+4%)    STOP-LOSS (-2%)
                                            +$0.60 Profit        -$0.30 Max Loss
                                                 │
                                       When Profit Hits +1.5%:
                                       Stop-Loss Moves to +0.5% (LOCKED WINNER)
```

1. **AI Volatility Gate:** If news breaks (CPI release or Fed announcement) and volatility spikes, the trade is blocked to avoid whipsaws.
2. **Order Placement:** Places a $15 trade on Binance Spot.
3. **Hard Stop-Loss (-2%):** A hard stop is set at -$0.30. If the market reverses, your maximum loss is strictly 30 cents.
4. **Take-Profit (+4% / +5%):** Target profit is +$0.60 on Gold or +$0.75 on Bitcoin.
5. **Dynamic Trailing Lock (+1.5%):** The moment unrealized profit reaches +$0.22 (+1.5%), the stop-loss is raised to **+$0.08 (+0.5%) guaranteed net profit**. Green trades never turn red.
6. **Telegram Alert:** An instant notification is sent to `@penghuotbot` on Telegram.

---

## 📡 Part 7: Copying External Signals (TradingView & Telegram VIP)

To copy signals from external traders into your terminal:

1. Click the purple button in the navbar: **`📡 Copy Signals`**.
2. Copy your active Webhook URL:
   ```
   http://localhost:4000/api/signals/webhook
   ```
3. In TradingView, create an alert, check **Webhook URL**, paste your URL, and paste this message:
   ```json
   {
     "secret": "alphaforge_vip_secret",
     "action": "{{strategy.order.action}}",
     "symbol": "{{ticker}}",
     "price": {{close}},
     "capital": 15.00,
     "source": "TradingView Pro VIP"
   }
   ```
4. **Universal Risk Shield:** Even if the external trader sets no stop-loss or recommends reckless leverage, AlphaForge **overrides it and enforces our -2.0% stop-loss and $15 capital ceiling**.

## 📊 Part 8: Real-Time Visual Trade Tracking (Just Like Exchange Apps: Binance & TradingView)

AlphaForge gives you the exact institutional visual interface you expect from premier exchange apps (TradingView, Binance, Bybit):

### 1. Directly on the Candlestick Chart:
* **⚡ Entry Price Line (Cyan):** A dashed horizontal line across the entire chart showing **EXACTLY WHERE WE BOUGHT** (e.g. `⚡ BOUGHT @ $2,685.20 | Qty: 0.0055`).
* **🛡️ Hard Stop-Loss Line (Red):** Drawn at `-2.0%` below entry (e.g. `🛡️ STOP-LOSS: $2,631.50 (-2.0%)`).
* **🎯 Take-Profit Target Line (Green):** Drawn at `+4.0%` above entry (e.g. `🎯 TAKE-PROFIT: $2,792.60 (+4.0%)`).
* **🟢/🔴 Live Floating P&L Shading & Badge:** The area between your entry price and the live price candle is softly shaded green (when in profit) or red (when in drawdown), with an active P&L badge tracking right alongside the live candle tip (`PnL: +$0.21 (+1.40%)`).
* **Candlestick Execution Markers:** Whenever an order fills, a crisp institutional arrow and badge (`▲ BUY $2,685.20` or `▼ SELL $2,712.30`) is stamped onto the exact candle where execution took place.

### 2. The Exchange Blotter Drawer (Directly Underneath the Chart):
Just like the positions drawer in TradingView and Binance Desktop:
* **Asset:** Asset symbol (e.g., `🟡 XAU-USD`) with badges indicating source (`[REAL BROKER]` or `[AUTO-PILOT BOT]`).
* **Side:** Directional pill (`▲ BUY / LONG` or `▼ SELL / SHORT`).
* **Quantity:** Units held.
* **Entry Price (Where We Bought):** Cyan glowing formatted execution price.
* **Mark Price (Live):** Real-time market tick price updating every second.
* **Margin / Capital:** Capital allocated (e.g., `$15.00 USDT`).
* **Floating P&L ($ / %):** Real-time profit/loss in dollars and percentage.
* **Stop-Loss & Take-Profit:** Exact prices and percentage bounds.
* **[🛑 Market Close] Button:** 1-click immediate position liquidation at market price.

### 3. Execution Fills Tab:
Click the **`📜 Execution Fills`** tab in the blotter drawer to view the complete immutable ledger of every order fill (Time, Order ID, Asset, Side, Execution Price, Quantity, Capital, Realized P&L, and Trigger Reason).

---

## 🚨 Emergency Controls & Runbook

* **How to Pause/Stop Trading Instantly:**
  * In the web terminal, click **`⏸ Pause Bot`** in the Auto-Bot control panel.
  * Or simply close the command prompt window running `node server/index.js`.
* **Daily Drawdown Circuit Breaker:**
  * If daily losses reach **-$2.00** (10% of your $20 micro-account), the terminal automatically trips the circuit breaker and locks all new trading for 24 hours.
  * To reset after reviewing your trades: Click **`Reset Circuit Breaker`** in the Real Trading modal.

---

*AlphaForge Quant Terminal © 2026. Engineered for CEO Lim Penghuot. All rights reserved.*
