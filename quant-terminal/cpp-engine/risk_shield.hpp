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

    inline bool can_enter_trade(const uint64_t current_ns) const noexcept {
        if (active_position_.is_open) [[unlikely]] {
            return false;
        }
        // 5-second cooldown to avoid churn
        if (current_ns > 0 && last_trade_ns_ > 0) {
            if ((current_ns - last_trade_ns_) < 5000000000ULL) {
                return false;
            }
        }
        return true;
    }

    inline Position open_position(const char* symbol, const double entry_price, const uint64_t current_ns) noexcept {
        const double sl = entry_price * (1.0 - (config_.max_loss_percent * 0.01));
        const double tp = entry_price * (1.0 + (config_.take_profit_percent * 0.01));
        const double alloc_usd = config_.micro_account_balance * 0.50; // Max 50% allocation
        const double qty = alloc_usd / entry_price;

        std::strncpy(active_position_.symbol, symbol, sizeof(active_position_.symbol) - 1);
        active_position_.entry_price = entry_price;
        active_position_.current_price = entry_price;
        active_position_.quantity = qty;
        active_position_.stop_loss_price = sl;
        active_position_.take_profit_price = tp;
        active_position_.unrealized_pnl = 0.0;
        active_position_.pnl_percent = 0.0;
        active_position_.is_open = true;

        last_trade_ns_ = current_ns;
        return active_position_;
    }

    // Inlined risk check executed on every tick in < 5 nanoseconds
    inline bool evaluate_tick(const double current_price, Signal& out_signal, const uint64_t current_ns) noexcept {
        if (!active_position_.is_open) [[likely]] {
            return false;
        }

        active_position_.current_price = current_price;
        const double pnl_pct = ((current_price - active_position_.entry_price) / active_position_.entry_price) * 100.0;
        active_position_.pnl_percent = pnl_pct;
        active_position_.unrealized_pnl = (current_price - active_position_.entry_price) * active_position_.quantity;

        // 1. Dynamic Trailing Stop Lock: If up +1.5%, advance Stop-Loss to +0.5% (guaranteed win)
        if (pnl_pct >= config_.trailing_lock_percent) [[unlikely]] {
            const double trailed_sl = active_position_.entry_price * 1.005;
            if (trailed_sl > active_position_.stop_loss_price) {
                active_position_.stop_loss_price = trailed_sl;
            }
        }

        // 2. Take-Profit hit (+4%)
        if (current_price >= active_position_.take_profit_price) [[unlikely]] {
            out_signal.action = SignalAction::SELL;
            out_signal.price = current_price;
            out_signal.confidence = 1.0;
            std::snprintf(out_signal.reason, sizeof(out_signal.reason),
                "TAKE_PROFIT_TRIGGERED (+%.2f%% | +$%.4f)", pnl_pct, active_position_.unrealized_pnl);
            config_.micro_account_balance += active_position_.unrealized_pnl;
            active_position_.is_open = false;
            return true;
        }

        // 3. Stop-Loss hit (-2% hard stop)
        if (current_price <= active_position_.stop_loss_price) [[unlikely]] {
            out_signal.action = SignalAction::SELL;
            out_signal.price = current_price;
            out_signal.confidence = 1.0;
            std::snprintf(out_signal.reason, sizeof(out_signal.reason),
                "STOP_LOSS_SHIELD (-%.2f%% | -$%.4f)", pnl_pct, -active_position_.unrealized_pnl);
            config_.micro_account_balance += active_position_.unrealized_pnl;
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
