use crate::types::{Position, RiskConfig};
use chrono::Utc;

pub struct RiskShield {
    pub config: RiskConfig,
    pub active_position: Option<Position>,
    pub trade_history: Vec<Position>,
}

impl RiskShield {
    pub fn new(balance: f64) -> Self {
        let mut cfg = RiskConfig::default();
        if balance > 0.0 {
            cfg.micro_account_balance = balance;
            cfg.max_risk_per_trade_usd = balance * (cfg.max_loss_percent / 100.0);
        }
        Self {
            config: cfg,
            active_position: None,
            trade_history: Vec::with_capacity(100),
        }
    }

    pub fn can_enter_trade(&self, current_spread_pct: f64) -> (bool, &'static str) {
        if self.active_position.is_some() {
            return (false, "ACTIVE_POSITION_EXISTS: only 1 concurrent position allowed for micro accounts");
        }
        if current_spread_pct > self.config.max_allowed_spread_pct {
            return (false, "SPREAD_GATE_BLOCKED: Current spread exceeds safety limit");
        }
        (true, "READY")
    }

    pub fn open_position(&mut self, symbol: &str, entry_price: f64) -> Position {
        let round_trip_fee_pct = (self.config.broker_taker_fee_pct * 2.0) + self.config.estimated_spread_pct;
        let net_adjusted_tp_pct = self.config.take_profit_percent + round_trip_fee_pct;
        let net_adjusted_sl_pct = if self.config.max_loss_percent > round_trip_fee_pct {
            self.config.max_loss_percent - round_trip_fee_pct
        } else {
            self.config.max_loss_percent * 0.5
        };

        let sl_price = entry_price * (1.0 - (net_adjusted_sl_pct / 100.0));
        let tp_price = entry_price * (1.0 + (net_adjusted_tp_pct / 100.0));

        let alloc_usd = self.config.micro_account_balance * 0.50; // Max 50% allocation
        let qty = alloc_usd / entry_price;
        let initial_fees = alloc_usd * (round_trip_fee_pct / 100.0);

        let pos = Position {
            symbol: symbol.to_string(),
            entry_price: (entry_price * 10000.0).round() / 10000.0,
            current_price: (entry_price * 10000.0).round() / 10000.0,
            quantity: (qty * 1000000.0).round() / 1000000.0,
            stop_loss_price: (sl_price * 100.0).round() / 100.0,
            take_profit_price: (tp_price * 100.0).round() / 100.0,
            gross_pnl: 0.0,
            total_fees: (initial_fees * 10000.0).round() / 10000.0,
            net_pnl: (-initial_fees * 10000.0).round() / 10000.0,
            net_pnl_percent: -round_trip_fee_pct,
            status: "OPEN".to_string(),
            is_open: true,
            entry_time: Utc::now().to_rfc3339(),
        };

        self.active_position = Some(pos.clone());
        pos
    }

    pub fn evaluate_risk(&mut self, current_price: f64) -> (bool, String, Option<Position>) {
        let pos = match self.active_position.as_mut() {
            Some(p) if p.is_open => p,
            _ => return (false, "NO_OPEN_POSITION".to_string(), None),
        };

        pos.current_price = (current_price * 10000.0).round() / 10000.0;
        let position_val = pos.quantity * pos.entry_price;
        let current_val = pos.quantity * current_price;

        let entry_comm = position_val * (self.config.broker_taker_fee_pct / 100.0);
        let exit_comm = current_val * (self.config.broker_taker_fee_pct / 100.0);
        let spread_cost = position_val * (self.config.estimated_spread_pct / 100.0);
        let round_trip_fees = entry_comm + exit_comm + spread_cost;

        pos.gross_pnl = current_val - position_val;
        pos.total_fees = round_trip_fees;
        pos.net_pnl = pos.gross_pnl - round_trip_fees;
        pos.net_pnl_percent = (pos.net_pnl / position_val) * 100.0;

        // 1. Dynamic Trailing Lock: If Net PnL reaches +1.5%, lock SL at +0.5% NET
        if pos.net_pnl_percent >= self.config.trailing_lock_percent {
            let fee_buffer_pct = (round_trip_fees / position_val) * 100.0;
            let trailed_sl = pos.entry_price * (1.0 + ((0.5 + fee_buffer_pct) / 100.0));
            if trailed_sl > pos.stop_loss_price {
                pos.stop_loss_price = (trailed_sl * 100.0).round() / 100.0;
            }
        }

        // 2. Take-Profit hit (Target Net +4.0% cash in pocket)
        if current_price >= pos.take_profit_price {
            pos.status = "CLOSED_TP".to_string();
            pos.is_open = false;
            let closed = pos.clone();
            self.config.micro_account_balance += closed.net_pnl;
            self.trade_history.push(closed.clone());
            self.active_position = None;
            return (
                true,
                format!(
                    "TAKE_PROFIT_TRIGGERED: Target Net +{:.2}% reached (Net Gain +${:.4} | Fees -${:.4})",
                    closed.net_pnl_percent, closed.net_pnl, round_trip_fees
                ),
                Some(closed),
            );
        }

        // 3. Stop-Loss hit (Hard Net -2.0% Capital Stop)
        if current_price <= pos.stop_loss_price {
            pos.status = "CLOSED_SL".to_string();
            pos.is_open = false;
            let closed = pos.clone();
            self.config.micro_account_balance += closed.net_pnl;
            self.trade_history.push(closed.clone());
            self.active_position = None;
            return (
                true,
                format!(
                    "STOP_LOSS_SHIELD_TRIGGERED: Hard capital stop at Net {:.2}% (Net Loss -${:.4} | Fees -${:.4})",
                    closed.net_pnl_percent, -closed.net_pnl, round_trip_fees
                ),
                Some(closed),
            );
        }

        (false, "HOLDING".to_string(), Some(pos.clone()))
    }
}
