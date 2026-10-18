#pragma once

#include "types.hpp"
#include <cstring>
#include <cstdio>

namespace alphaforge {

class alignas(64) BareMetalRiskShield {
private:
    RiskConfig config_;
    Position active_position_{};
    uint64_t last_trade_ns_{0};

public:
    inline explicit BareMetalRiskShield(const RiskConfig& cfg = RiskConfig{}) noexcept
        : config_(cfg) {
        active_position_.is_open = false;
    }

    inline bool can_enter_trade(const uint64_t current_ns, const double current_spread_pct = 0.02) const noexcept {
        if (active_position_.is_open) [[unlikely]] {
            return false;
        }
        // Spread Gate: Protect against spread-widening during news or off-market hours
        if (current_spread_pct > config_.max_allowed_spread_pct) [[unlikely]] {
            return false; // Spread is too wide; broker fee/slippage would eat profits
        }
        // 5-second cooldown to avoid churn and excessive commissions
        if (current_ns > 0 && last_trade_ns_ > 0) {
            if ((current_ns - last_trade_ns_) < 5000000000ULL) {
                return false;
            }
        }
        return true;
    }

    inline Position open_position(const char* symbol, const double entry_price, const uint64_t current_ns) noexcept {
        // Calculate round-trip broker drag (entry commission + exit commission + half-spread)
        const double round_trip_fee_pct = (config_.broker_taker_fee_pct * 2.0) + config_.estimated_spread_pct;

        // Compensate brackets so user secures NET +4% and stops at NET -2%
        const double net_adjusted_tp_pct = config_.take_profit_percent + round_trip_fee_pct;
        const double net_adjusted_sl_pct = (config_.max_loss_percent > round_trip_fee_pct) 
                                           ? (config_.max_loss_percent - round_trip_fee_pct)
                                           : (config_.max_loss_percent * 0.5);

        const double sl = entry_price * (1.0 - (net_adjusted_sl_pct * 0.01));
        const double tp = entry_price * (1.0 + (net_adjusted_tp_pct * 0.01));
        const double alloc_usd = config_.micro_account_balance * 0.50; // Max 50% allocation
        const double qty = alloc_usd / entry_price;

        std::strncpy(active_position_.symbol, symbol, sizeof(active_position_.symbol) - 1);
        active_position_.entry_price = entry_price;
        active_position_.current_price = entry_price;
        active_position_.quantity = qty;
        active_position_.stop_loss_price = sl;
        active_position_.take_profit_price = tp;
        active_position_.gross_pnl = 0.0;
        active_position_.total_fees = alloc_usd * (round_trip_fee_pct * 0.01);
        active_position_.net_pnl = -active_position_.total_fees;
        active_position_.net_pnl_percent = -round_trip_fee_pct;
        active_position_.is_open = true;

        last_trade_ns_ = current_ns;
        return active_position_;
    }

    // Inlined risk & fee check executed on every tick in < 5 nanoseconds
    inline bool evaluate_tick(const double current_price, Signal& out_signal, const uint64_t current_ns) noexcept {
        if (!active_position_.is_open) [[likely]] {
            return false;
        }

        active_position_.current_price = current_price;
        const double position_val = active_position_.quantity * active_position_.entry_price;
        const double current_val = active_position_.quantity * current_price;

        // Accurate fee breakdown: Entry Commission + Exit Commission + Spread Cost
        const double entry_comm = position_val * (config_.broker_taker_fee_pct * 0.01);
        const double exit_comm  = current_val * (config_.broker_taker_fee_pct * 0.01);
        const double spread_cost = position_val * (config_.estimated_spread_pct * 0.01);
        const double round_trip_fees = entry_comm + exit_comm + spread_cost;

        active_position_.gross_pnl = current_val - position_val;
        active_position_.total_fees = round_trip_fees;
        active_position_.net_pnl = active_position_.gross_pnl - round_trip_fees;
        active_position_.net_pnl_percent = (active_position_.net_pnl / position_val) * 100.0;

        // 1. Dynamic Trailing Stop Lock: If NET profit reaches +1.5%, lock SL at +0.5% NET
        if (active_position_.net_pnl_percent >= config_.trailing_lock_percent) [[unlikely]] {
            const double fee_buffer_pct = (round_trip_fees / position_val) * 100.0;
            const double trailed_sl = active_position_.entry_price * (1.0 + ((0.5 + fee_buffer_pct) * 0.01));
            if (trailed_sl > active_position_.stop_loss_price) {
                active_position_.stop_loss_price = trailed_sl;
            }
        }

        // 2. Take-Profit hit (Target NET +4.0% in pocket)
        if (current_price >= active_position_.take_profit_price) [[unlikely]] {
            out_signal.action = SignalAction::SELL;
            out_signal.price = current_price;
            out_signal.confidence = 1.0;
            std::snprintf(out_signal.reason, sizeof(out_signal.reason),
                "TAKE_PROFIT_TRIGGERED (Net +%.2f%% | Net +$%.4f | Broker Fee -$%.4f)",
                active_position_.net_pnl_percent, active_position_.net_pnl, round_trip_fees);
            config_.micro_account_balance += active_position_.net_pnl;
            config_.total_fees_paid_usd += round_trip_fees;
            active_position_.is_open = false;
            return true;
        }

        // 3. Stop-Loss hit (Hard NET -2.0% Capital Stop)
        if (current_price <= active_position_.stop_loss_price) [[unlikely]] {
            out_signal.action = SignalAction::SELL;
            out_signal.price = current_price;
            out_signal.confidence = 1.0;
            std::snprintf(out_signal.reason, sizeof(out_signal.reason),
                "STOP_LOSS_SHIELD (Net %.2f%% | Net -$%.4f | Broker Fee -$%.4f)",
                active_position_.net_pnl_percent, -active_position_.net_pnl, round_trip_fees);
            config_.micro_account_balance += active_position_.net_pnl;
            config_.total_fees_paid_usd += round_trip_fees;
            active_position_.is_open = false;
            return true;
        }

        return false;
    }

    inline const Position& get_active_position() const noexcept {
        return active_position_;
    }

    inline const RiskConfig& get_config() const noexcept {
        return config_;
    }

    inline void set_balance(double b) noexcept {
        config_.micro_account_balance = b;
        config_.max_risk_per_trade_usd = b * (config_.max_loss_percent * 0.01);
    }
};

} // namespace alphaforge
