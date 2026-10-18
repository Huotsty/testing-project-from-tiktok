#pragma once

#include "types.hpp"
#include "indicators.hpp"
#include "risk_shield.hpp"
#include "ring_buffer.hpp"
#include <x86intrin.h> // __rdtsc() for hardware clock cycle measurement
#include <atomic>
#include <chrono>
#include <memory>

namespace alphaforge {

class alignas(64) BareMetalQuantEngine {
private:
    char symbol_[16];
    VectorizedIndicatorPipeline indicators_;
    BareMetalRiskShield risk_shield_;
    std::unique_ptr<SPSCRingBuffer<Tick, 131072>> queue_;
    
    std::atomic<uint64_t> ticks_processed_{0};
    std::atomic<uint64_t> total_cycles_{0};
    std::atomic<uint64_t> signals_produced_{0};

    Tick latest_tick_{};
    IndicatorState latest_indicators_{};

public:
    inline explicit BareMetalQuantEngine(const char* symbol = "PAXG/USDT", double balance = 20.0)
        : indicators_(9, 21, 14),
          risk_shield_(RiskConfig{.micro_account_balance = balance}),
          queue_(std::make_unique<SPSCRingBuffer<Tick, 131072>>()) {
        std::strncpy(symbol_, symbol, sizeof(symbol_) - 1);
    }

    inline bool submit_tick(const Tick& t) noexcept {
        return queue_->push(t);
    }

    // Inlined core processing function executing on hardware
    inline bool process_next_tick(Signal& out_signal) noexcept {
        Tick t;
        if (!queue_->pop(t)) {
            return false;
        }

        // Hardware CPU clock cycle start
        const uint64_t tsc_start = __rdtsc();

        latest_tick_ = t;
        const IndicatorState ind = indicators_.update(t.price, t.quantity, t.is_buyer_maker);
        latest_indicators_ = ind;

        bool signal_generated = false;

        // 1. Check open positions with Risk Shield
        if (risk_shield_.evaluate_tick(t.price, out_signal, t.timestamp_ns)) {
            signal_generated = true;
        } 
        // 2. If no position is open and indicators are warmed up, evaluate entry
        else if (ind.ready && risk_shield_.can_enter_trade(t.timestamp_ns)) {
            // Golden Cross Strategy with Momentum & Flow Confirmation
            // EMA9 > EMA21 AND RSI between 42 and 68 AND Order Book Imbalance > 0.05
            if (ind.fast_ema > ind.slow_ema && ind.rsi >= 42.0 && ind.rsi <= 68.0 && ind.obi > 0.05) {
                const Position pos = risk_shield_.open_position(t.symbol, t.price, t.timestamp_ns);
                out_signal.action = SignalAction::BUY;
                out_signal.price = t.price;
                out_signal.stop_loss = pos.stop_loss_price;
                out_signal.take_profit = pos.take_profit_price;
                out_signal.confidence = 0.94;
                std::snprintf(out_signal.reason, sizeof(out_signal.reason),
                    "ALPHA_GOLDEN_CROSS: EMA9(%.2f) > EMA21(%.2f) | RSI(%.1f) | OBI(%.2f)",
                    ind.fast_ema, ind.slow_ema, ind.rsi, ind.obi);
                signal_generated = true;
            }
        }

        const uint64_t tsc_end = __rdtsc();
        const uint64_t elapsed_cycles = (tsc_end > tsc_start) ? (tsc_end - tsc_start) : 0;

        ticks_processed_.fetch_add(1, std::memory_order_relaxed);
        total_cycles_.fetch_add(elapsed_cycles, std::memory_order_relaxed);

        if (signal_generated) {
            signals_produced_.fetch_add(1, std::memory_order_relaxed);
            out_signal.latency_cycles = elapsed_cycles;
            // Approximate clock cycles to nanoseconds based on ~2.7 GHz CPU (0.37ns per cycle)
            out_signal.latency_ns = static_cast<double>(elapsed_cycles) * 0.37;
        }

        return signal_generated;
    }

    inline uint64_t get_ticks_processed() const noexcept {
        return ticks_processed_.load(std::memory_order_relaxed);
    }

    inline uint64_t get_signals_produced() const noexcept {
        return signals_produced_.load(std::memory_order_relaxed);
    }

    inline uint64_t get_avg_cycles() const noexcept {
        const uint64_t t = ticks_processed_.load(std::memory_order_relaxed);
        return (t > 0) ? (total_cycles_.load(std::memory_order_relaxed) / t) : 0;
    }

    inline const IndicatorState& get_latest_indicators() const noexcept {
        return latest_indicators_;
    }

    inline const BareMetalRiskShield& get_risk_shield() const noexcept {
        return risk_shield_;
    }
};

} // namespace alphaforge
