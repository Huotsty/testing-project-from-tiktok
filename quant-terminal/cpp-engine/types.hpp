#pragma once

#include <cstdint>
#include <string>
#include <chrono>

namespace alphaforge {

// Cache-line aligned tick structure (64-byte boundary for L1 Cache optimization)
struct alignas(64) Tick {
    double price;
    double quantity;
    uint64_t timestamp_ns;
    bool is_buyer_maker; // false = aggressive buyer (bullish), true = aggressive seller (bearish)
    char symbol[16];
};

enum class SignalAction : uint8_t {
    HOLD = 0,
    BUY  = 1,
    SELL = 2
};

struct alignas(64) IndicatorState {
    double fast_ema; // EMA 9
    double slow_ema; // EMA 21
    double rsi;      // RSI 14
    double obi;      // Order Book Flow Imbalance [-1.0, 1.0]
    bool ready;
};

struct alignas(64) Signal {
    SignalAction action;
    double price;
    double stop_loss;
    double take_profit;
    double confidence;
    uint64_t latency_cycles;
    double latency_ns;
    char reason[128];
};

struct alignas(64) Position {
    char symbol[16];
    double entry_price;
    double current_price;
    double quantity;
    double stop_loss_price;
    double take_profit_price;
    double gross_pnl;
    double total_fees;      // Entry commission + exit commission + spread drag
    double net_pnl;         // Gross PnL - Total Fees
    double net_pnl_percent; // Net PnL % after all broker fees
    bool is_open;
};

struct RiskConfig {
    double max_loss_percent       = 2.0;  // Hard stop at -2% NET of fees
    double take_profit_percent    = 4.0;  // 1:2 asymmetric payoff (+4% NET of fees)
    double trailing_lock_percent  = 1.5;  // Lock at breakeven + fee buffer once +1.5%
    double micro_account_balance  = 20.0; // $20.00 micro capital
    double max_risk_per_trade_usd = 0.40; // 2% of $20 = $0.40
    
    // Broker Fee & Spread Armor
    double broker_taker_fee_pct   = 0.08; // 0.08% taker commission (standard Binance/Capital.com)
    double broker_maker_fee_pct   = 0.04; // 0.04% maker commission
    double estimated_spread_pct   = 0.02; // ~0.02% typical bid/ask spread on Spot Gold ($0.50/oz)
    double max_allowed_spread_pct = 0.05; // Spread gate: reject entry if spread > 0.05% (news spikes)
    double min_alpha_hurdle_pct   = 0.45; // Minimum signal profit hurdle before taking trade
    double total_fees_paid_usd    = 0.0;  // Cumulative broker commission tracker
};

} // namespace alphaforge

