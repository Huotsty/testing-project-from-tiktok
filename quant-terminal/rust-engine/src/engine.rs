use crate::indicators::IndicatorPipeline;
use crate::risk_shield::RiskShield;
use crate::types::{IndicatorState, Position, Signal, SignalAction, Tick};
use chrono::Utc;
use std::time::Instant;

pub struct QuantEngine {
    pub symbol: String,
    pub pipeline: IndicatorPipeline,
    pub risk_shield: RiskShield,
    pub signals: Vec<Signal>,
    pub ticks_processed: u64,
    pub signals_generated: u64,
    pub total_latency_nanos: u128,
    pub latest_tick: Option<Tick>,
    pub latest_indicators: Option<IndicatorState>,
    pub start_time: Instant,
}

impl QuantEngine {
    pub fn new(symbol: &str, initial_balance: f64) -> Self {
        Self {
            symbol: symbol.to_string(),
            pipeline: IndicatorPipeline::new(9, 21, 14),
            risk_shield: RiskShield::new(initial_balance),
            signals: Vec::with_capacity(200),
            ticks_processed: 0,
            signals_generated: 0,
            total_latency_nanos: 0,
            latest_tick: None,
            latest_indicators: None,
            start_time: Instant::now(),
        }
    }

    #[inline(always)]
    pub fn process_tick(&mut self, tick: Tick) -> Option<Signal> {
        let start = Instant::now();
        self.ticks_processed += 1;

        let ind = self.pipeline.update_tick(tick.price, tick.quantity, tick.is_buyer_maker);
        self.latest_tick = Some(tick.clone());
        self.latest_indicators = Some(ind);

        // 1. Check existing position risk
        let (should_close, reason, pos_opt) = self.risk_shield.evaluate_risk(tick.price);
        if should_close {
            if let Some(pos) = pos_opt {
                let latency_ns = start.elapsed().as_nanos() as u64;
                let sig = Signal {
                    id: format!("RUST-SIG-{}", self.signals_generated + 1),
                    symbol: tick.symbol.clone(),
                    action: SignalAction::Sell,
                    price: tick.price,
                    stop_loss: pos.stop_loss_price,
                    take_profit: pos.take_profit_price,
                    reason,
                    confidence: 1.0,
                    latency_nanos: latency_ns,
                    latency_micros: (latency_ns as f64) / 1000.0,
                    timestamp: Utc::now().to_rfc3339(),
                };
                self.signals_generated += 1;
                self.signals.push(sig.clone());
                return Some(sig);
            }
        }

        // 2. Evaluate entry condition if pipeline is primed and risk filter passes
        if ind.ready && !should_close {
            let (can_enter, _) = self.risk_shield.can_enter_trade(0.02);
            if can_enter {
                // Alpha Momentum: FastEMA > SlowEMA, RSI between 42 and 68, positive OBI order flow
                if ind.fast_ema > ind.slow_ema && ind.rsi >= 42.0 && ind.rsi <= 68.0 && ind.obi > 0.05 {
                    let pos = self.risk_shield.open_position(&tick.symbol, tick.price);
                    let latency_ns = start.elapsed().as_nanos() as u64;
                    let sig = Signal {
                        id: format!("RUST-SIG-{}", self.signals_generated + 1),
                        symbol: tick.symbol.clone(),
                        action: SignalAction::Buy,
                        price: tick.price,
                        stop_loss: pos.stop_loss_price,
                        take_profit: pos.take_profit_price,
                        reason: format!(
                            "RUST_ALPHA_CROSS: EMA9({:.2}) > EMA21({:.2}) + RSI({:.1}) + OBI({:.2})",
                            ind.fast_ema, ind.slow_ema, ind.rsi, ind.obi
                        ),
                        confidence: 0.94,
                        latency_nanos: latency_ns,
                        latency_micros: (latency_ns as f64) / 1000.0,
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    self.signals_generated += 1;
                    self.signals.push(sig.clone());
                    return Some(sig);
                }
            }
        }

        let elapsed = start.elapsed().as_nanos();
        self.total_latency_nanos += elapsed;
        None
    }

    pub fn benchmark_simulation(&mut self, num_ticks: usize, base_price: f64) -> (std::time::Duration, f64) {
        let mut price = base_price;
        let start = Instant::now();

        for i in 0..num_ticks {
            price += if i % 2 == 0 { 0.05 } else { -0.03 };
            let tick = Tick {
                symbol: self.symbol.clone(),
                price,
                quantity: 1.0,
                is_buyer_maker: i % 3 == 0,
                timestamp_ms: Utc::now().timestamp_millis(),
            };
            self.process_tick(tick);
        }

        let elapsed = start.elapsed();
        let nanos_per_tick = (elapsed.as_nanos() as f64) / (num_ticks as f64);
        (elapsed, nanos_per_tick)
    }
}
