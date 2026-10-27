use crate::types::IndicatorState;

pub struct IndicatorPipeline {
    fast_period: usize,
    slow_period: usize,
    rsi_period: usize,
    fast_ema: f64,
    slow_ema: f64,
    fast_k: f64,
    slow_k: f64,
    avg_gain: f64,
    avg_loss: f64,
    prev_price: f64,
    bid_vol: f64,
    ask_vol: f64,
    tick_count: usize,
}

impl IndicatorPipeline {
    pub fn new(fast_period: usize, slow_period: usize, rsi_period: usize) -> Self {
        Self {
            fast_period,
            slow_period,
            rsi_period,
            fast_ema: 0.0,
            slow_ema: 0.0,
            fast_k: 2.0 / (fast_period as f64 + 1.0),
            slow_k: 2.0 / (slow_period as f64 + 1.0),
            avg_gain: 0.0,
            avg_loss: 0.0,
            prev_price: 0.0,
            bid_vol: 0.0,
            ask_vol: 0.0,
            tick_count: 0,
        }
    }

    #[inline(always)]
    pub fn update_tick(&mut self, price: f64, qty: f64, is_buyer_maker: bool) -> IndicatorState {
        self.tick_count += 1;

        // 1. Exponential Moving Averages (EMA)
        if self.tick_count == 1 {
            self.fast_ema = price;
            self.slow_ema = price;
            self.prev_price = price;
        } else {
            self.fast_ema = (price * self.fast_k) + (self.fast_ema * (1.0 - self.fast_k));
            self.slow_ema = (price * self.slow_k) + (self.slow_ema * (1.0 - self.slow_k));
        }

        // 2. Wilder's Smoothed Relative Strength Index (RSI)
        if self.tick_count > 1 {
            let change = price - self.prev_price;
            let gain = if change > 0.0 { change } else { 0.0 };
            let loss = if change < 0.0 { -change } else { 0.0 };

            let n = self.rsi_period as f64;
            if self.tick_count <= self.rsi_period + 1 {
                self.avg_gain += gain / n;
                self.avg_loss += loss / n;
            } else {
                self.avg_gain = (self.avg_gain * (n - 1.0) + gain) / n;
                self.avg_loss = (self.avg_loss * (n - 1.0) + loss) / n;
            }
        }
        self.prev_price = price;

        let rsi = if self.avg_loss == 0.0 {
            100.0
        } else {
            let rs = self.avg_gain / self.avg_loss;
            100.0 - (100.0 / (1.0 + rs))
        };

        // 3. High-Frequency Order Flow Imbalance (OBI)
        // If buyer maker is true: seller was the aggressor (taker sold to maker bid)
        if is_buyer_maker {
            self.ask_vol = (self.ask_vol * 0.95) + qty;
        } else {
            self.bid_vol = (self.bid_vol * 0.95) + qty;
        }

        let tot_vol = self.bid_vol + self.ask_vol;
        let obi = if tot_vol > 0.0 {
            (self.bid_vol - self.ask_vol) / tot_vol
        } else {
            0.0
        };

        IndicatorState {
            fast_ema: (self.fast_ema * 100.0).round() / 100.0,
            slow_ema: (self.slow_ema * 100.0).round() / 100.0,
            rsi: (rsi * 10.0).round() / 10.0,
            obi: (obi * 100.0).round() / 100.0,
            ready: self.tick_count >= self.slow_period,
        }
    }
}
