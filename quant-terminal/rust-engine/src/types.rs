use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tick {
    pub symbol: String,
    pub price: f64,
    pub quantity: f64,
    pub is_buyer_maker: bool,
    pub timestamp_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SignalAction {
    Buy,
    Sell,
    Hold,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signal {
    pub id: String,
    pub symbol: String,
    pub action: SignalAction,
    pub price: f64,
    pub stop_loss: f64,
    pub take_profit: f64,
    pub reason: String,
    pub confidence: f64,
    pub latency_nanos: u64,
    pub latency_micros: f64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub symbol: String,
    pub entry_price: f64,
    pub current_price: f64,
    pub quantity: f64,
    pub stop_loss_price: f64,
    pub take_profit_price: f64,
    pub gross_pnl: f64,
    pub total_fees: f64,
    pub net_pnl: f64,
    pub net_pnl_percent: f64,
    pub status: String,
    pub is_open: bool,
    pub entry_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskConfig {
    pub max_loss_percent: f64,      // 2.0% hard stop
    pub take_profit_percent: f64,   // 4.0% 1:2 asymmetric target
    pub trailing_lock_percent: f64, // 1.5% profit locks at +0.5% net
    pub micro_account_balance: f64, // $20.00
    pub max_risk_per_trade_usd: f64,// $0.40 on $20 balance
    pub broker_taker_fee_pct: f64,  // 0.08%
    pub estimated_spread_pct: f64,  // 0.02%
    pub max_allowed_spread_pct: f64,// 0.05%
}

impl Default for RiskConfig {
    fn default() -> Self {
        let balance = 20.0;
        Self {
            max_loss_percent: 2.0,
            take_profit_percent: 4.0,
            trailing_lock_percent: 1.5,
            micro_account_balance: balance,
            max_risk_per_trade_usd: balance * 0.02,
            broker_taker_fee_pct: 0.08,
            estimated_spread_pct: 0.02,
            max_allowed_spread_pct: 0.05,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct IndicatorState {
    pub fast_ema: f64,
    pub slow_ema: f64,
    pub rsi: f64,
    pub obi: f64,
    pub ready: bool,
}
