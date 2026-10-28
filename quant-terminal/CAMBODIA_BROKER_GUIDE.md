# 🇰🇭 Local Cambodia Broker Trading Guide — Spot Gold, Bitcoin & Global Equities
**Author:** Co-Founders CEO Lim Penghuot & Antigravity (Google DeepMind)  
**Target Markets:** Spot Gold (`XAU/USD`), Bitcoin (`BTC/USD`), US Indices (`US30`, `NAS100`) & Global Equities  
**Banking Rails:** Domestic Cambodian Banks (ABA Bank, Bakong, Canadia Bank in USD)  
**Regulatory Framework:** Securities and Exchange Regulator of Cambodia (SERC)  

---

## 🏛️ 1. Executive Summary: Keeping Money Local in Cambodia

If you want to trade international assets (Gold, Bitcoin, US Stocks) **without sending funds abroad or paying high SWIFT bank wire fees**, you can use a broker licensed by the **Securities and Exchange Regulator of Cambodia (SERC)**.

Under SERC regulations:
* Client funds are held in **segregated local bank accounts** in Cambodia (e.g., ABA Bank, Canadia Bank, BIDC).
* Deposits and withdrawals occur **domestically in USD** with zero or minimal local transfer fees.
* You are trading **CFDs (Contracts for Difference)** on international market prices, allowing both Long (Buy) and Short (Sell) execution.

---

## ⚖️ 2. Comprehensive Broker Comparison: ATFX vs. ST Market

| Feature | **ATFX Cambodia** (`atfx.com.kh`) | **ST Market Cambodia** (`stmarket.com.kh`) |
| :--- | :--- | :--- |
| **SERC License** | **License No. 040** (Active) | **License No. 021** (Active) |
| **Trading Platform** | **MetaTrader 4 (MT4)** & **MetaTrader 5 (MT5)** | **EZQT** & Proprietary Web/Mobile App |
| **Bot / Algorithmic Trading** |  **Full Support** (EAs, Python MT5, Webhooks) | ❌ **No Retail Bot Support** (Manual UI only) |
| **FIX API Direct Access** |  Available for MT5 / Institutional accounts | ❌ Not available for retail clients |
| **Spot Gold (XAU/USD)** |  Available (0.01 micro-lot minimum) |  Available |
| **Bitcoin (BTC/USD)** |  Available (24/7 trading) |  Available |
| **US Stocks & Indices** |  Available (US30, NAS100, Apple, Tesla) |  Available (Stock & Index CFDs) |
| **Local Deposit / Withdrawal** | **ABA Bank** & **Bakong** direct integration | **ABA Bank** & Local bank transfer |
| **Gold Leverage (SERC Cap)** | Max **1:100** (1% initial margin) | Max **1:100** (1% initial margin) |
| **Demo Account Access** |  Free instant MT5 Demo |  Free Demo on EZQT |
| **Local Office** | AMASS Central Tower, Floor 24, BKK 1, Phnom Penh | AMASS Tower, Floor 23, BKK 1, Phnom Penh |
| **Local Support Phone** | `+855 17 500 048` | `+855 (0) 23 977 688` |
| **Support Email** | `cs@atfx.com.kh` | `info@stmarket.com.kh` |

### Key Takeaway for Bot Developers:
* **ST Market** is strictly a **manual-click platform** via their proprietary EZQT app. There is no open API for custom JavaScript or Python bots.
* **ATFX Cambodia** runs on **MetaTrader 5 (MT5)**, which provides full programmatic access for your bots and automated quant strategies.

---

## 🔍 3. What About the Cambodia Securities Exchange (CSX)?
* **CSX** is Cambodia’s domestic stock exchange for local companies (such as ACLEDA Bank `ABC`, Phnom Penh Water Supply `PWSA`, Sihanoukville Autonomous Port `PAS`).
* CSX trades exclusively through the **CSX Trade / MTS app** via brokers like ACLEDA Securities or Canadia Securities.
* **CSX does NOT offer an open API for retail trading bots**, and trading volume/liquidity is generally not suited for intraday algorithmic trading.

---

## ⚡ 4. What is the ATFX FIX API? (`https://www.atfx.com.kh/en/atfx-fix-api`)

If you visit the ATFX Cambodia website, you will find a dedicated page for **ATFX FIX API**:

### What It Is:
* **FIX (Financial Information eXchange)** is the global protocol used by institutional trading firms and hedge funds to send orders directly to liquidity providers (hosted in Equinix LD4 data centers in London via OneZero).
* It bypasses the MetaTrader client desktop app completely, providing ultra-low latency (< 5 ms).

### FIX API vs. Standard MT5 Bot Trading:
* **FIX API:** Requires filling out an institutional application, manual approval, and typically **$5,000 to $25,000+ in minimum capital** to maintain a dedicated server port.
* **MT5 Bot Trading (Recommended for You):** Free, instant, zero minimum capital requirement, and works with standard demo/live accounts.

---

## 📐 5. Asset Specifications & Margin Math (Gold & BTC)

> [!WARNING]
> If testing with a micro-balance ($10 – $20), understand the margin rules to avoid immediate margin stop-outs.

### A. Spot Gold (`XAU/USD`)
* **Standard Lot:** 1.00 lot = 100 troy ounces.
* **Minimum Lot:** 0.01 micro-lot = 1 troy ounce (~$2,700 notional value).
* **SERC Leverage:** Max 1:100 (1% margin requirement).
$$\text{Required Margin for 0.01 lot Gold} = \frac{1 \text{ oz} \times \$2,700}{100} \approx \mathbf{\$27.00}$$
* *Recommendation:* Keep at least **$50 to $100** in your trading account when trading Gold with 0.01 micro-lots to safely absorb market swings.

### B. Bitcoin (`BTC/USD`)
* **Trading Hours:** 24 hours a day, 7 days a week.
* **Leverage:** Typically 1:5 to 1:20 under SERC risk guidelines.
* **Minimum Lot:** 0.01 BTC. At $70,000 BTC price and 1:10 leverage, required margin is approximately **$70.00**.

---

## 💻 6. Step-by-Step Setup Guide for Your Other Laptop

Follow this exact checklist to set up and test the trading bot on your other laptop:

```
[ Your Other Laptop ]
  ├── 1. Node.js + AlphaForge Quant Terminal (Web Dashboard & Bot Core)
  ├── 2. Official MetaTrader 5 (MT5) Desktop Terminal
  └── 3. Local Bridge (MT5 Python Package or Webhook EA)
```

### Step 1: Install Node.js & Project on the Other Laptop
1. Install **Node.js (v18 or v20 LTS)** from [nodejs.org](https://nodejs.org).
2. Copy or git clone the `testing-project-from-tiktok` repository:
   ```powershell
   git clone https://github.com/Huotsty/alphaforge-quant-terminal.git
   cd quant-terminal
   npm install
   ```
3. Run the unit tests to verify mathematical indicator accuracy:
   ```powershell
   npm test
   ```
   *(Ensure all 30 test suites pass).*

---

### Step 2: Install MetaTrader 5 (MT5) & Create a Free ATFX Demo Account
You do **not** need to wait for website approvals to start testing:
1. Download and install **MetaTrader 5** from [metatrader5.com](https://www.metatrader5.com) (or via `atfx.com.kh`).
2. Launch MT5 on your laptop.
3. In the top menu, go to: **File** ➔ **Open an Account**.
4. In the broker search bar, type `ATFX` and click **Find your broker**.
5. Select `ATFX Global Markets` or `ATFX-Demo`.
6. Select **"Open a demo account to trade virtual money"** ➔ click **Next**.
7. Enter your name, email, and set virtual deposit to **$1,000** or **$5,000** with **1:100 leverage**.
8. Note down your **Account Number (Login)** and **Password**.

---

### Step 3: Connect Your Node.js Bot to MT5

You can connect your AlphaForge Node.js bot to MT5 using either of these two methods:

#### Method A: Python MT5 Local Bridge (Recommended for Windows)
Python has an official MetaTrader 5 library that communicates directly with the running MT5 application:
1. Open PowerShell and install the library:
   ```powershell
   pip install MetaTrader5
   ```
2. Your Node.js terminal sends order signals to a local Python script (`server/services/mt5Bridge.py`):
   ```python
   import MetaTrader5 as mt5

   if not mt5.initialize():
       print("Failed to initialize MT5")
       quit()

   # Send 0.01 lot Gold Buy order
   request = {
       "action": mt5.TRADE_ACTION_DEAL,
       "symbol": "XAUUSD",
       "volume": 0.01,
       "type": mt5.ORDER_TYPE_BUY,
       "price": mt5.symbol_info_tick("XAUUSD").ask,
       "sl": mt5.symbol_info_tick("XAUUSD").ask - 5.0,  # 2% stop-loss
       "tp": mt5.symbol_info_tick("XAUUSD").ask + 10.0, # 4% take-profit
       "deviation": 20,
       "magic": 100001,
       "comment": "AlphaForge Bot Order",
       "type_time": mt5.ORDER_TIME_GTC,
       "type_filling": mt5.ORDER_FILLING_IOC,
   }
   result = mt5.order_send(request)
   print(f"Order executed: {result.retcode}")
   ```

#### Method B: Local Webhook / Socket EA
1. Attach an HTTP Webhook listener EA to a chart in MT5.
2. Whenever AlphaForge detects a quantitative buy/sell signal, it executes an HTTP POST request to `http://localhost:5000/trade` to execute the order.

---

### Step 4: Transitioning to Real Money (ABA Bank / Bakong Deposit)

When your bot strategy has proven consistent profits on the demo account:
1. Visit [https://www.atfx.com.kh](https://www.atfx.com.kh) and click **Open Live Account**.
2. Complete the online eKYC identity check using your Cambodian National ID or Passport.
3. In the ATFX Client Portal, navigate to **Deposit** ➔ Select **ABA Bank** or **Bank Transfer**.
4. Transfer funds from your local ABA USD account. Deposits are typically credited within minutes.
5. In MT5, log in with your Live account credentials and switch your bot's mode from `TESTNET` to `LIVE`.

---

### Step 5: Summary Checklist Before Running

- [ ] Node.js dependencies installed (`npm install`).
- [ ] Unit tests pass (`npm test`).
- [ ] MT5 installed and logged into an ATFX Demo account.
- [ ] Symbol verification: Check if broker symbol is named `XAUUSD`, `GOLD`, or `XAUUSD.m`.
- [ ] Risk guard active: Always enforce maximum 1–2% loss per trade.
- [ ] Never risk money you cannot afford to lose.
