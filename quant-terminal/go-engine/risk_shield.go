package main

import (
	"fmt"
	"sync"
	"time"
)

// RiskShield guards the trading capital with mathematical discipline
type RiskShield struct {
	mu             sync.RWMutex
	config         RiskConfig
	activePosition *Position
	tradeHistory   []Position
	lastTradeTime  time.Time
}

// NewRiskShield initializes default settings optimized for micro accounts ($10 - $20)
func NewRiskShield(balance float64) *RiskShield {
	if balance <= 0 {
		balance = 20.0 // Default initial micro testing capital
	}
	cfg := RiskConfig{
		MaxLossPercent:      2.0, // Hard stop at -2%
		TakeProfitPercent:   4.0, // 1:2 asymmetric payoff (+4%)
		TrailingLockPercent: 1.5, // Lock at breakeven + buffer once +1.5%
		MicroAccountBalance: balance,
		MaxRiskPerTradeUSD:  balance * 0.02, // $0.40 on a $20 balance
	}
	return &RiskShield{
		config:       cfg,
		tradeHistory: make([]Position, 0, 100),
	}
}

// CanEnterTrade validates whether opening a new position passes all safety filters
func (r *RiskShield) CanEnterTrade() (bool, string) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.activePosition != nil && r.activePosition.Status == "OPEN" {
		return false, "ACTIVE_POSITION_EXISTS: only 1 concurrent position allowed for micro accounts"
	}

	// 10-second cooldown between trades to eliminate high-frequency churn
	if time.Since(r.lastTradeTime) < 10*time.Second {
		return false, fmt.Sprintf("COOLDOWN_ACTIVE: waiting %.1fs before next trade", 10.0-time.Since(r.lastTradeTime).Seconds())
	}

	return true, "READY"
}

// OpenPosition calculates strict bracket orders (Stop-Loss and Take-Profit)
func (r *RiskShield) OpenPosition(symbol string, entryPrice float64) (*Position, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	slPrice := entryPrice * (1.0 - (r.config.MaxLossPercent / 100.0))
	tpPrice := entryPrice * (1.0 + (r.config.TakeProfitPercent / 100.0))

	// Micro-position sizing: Allocate max 50% of capital to single trade
	positionUSD := r.config.MicroAccountBalance * 0.50
	qty := positionUSD / entryPrice

	pos := &Position{
		Symbol:          symbol,
		EntryPrice:      roundTo(entryPrice, 4),
		CurrentPrice:    roundTo(entryPrice, 4),
		Quantity:        roundTo(qty, 6),
		StopLossPrice:   roundTo(slPrice, 4),
		TakeProfitPrice: roundTo(tpPrice, 4),
		UnrealizedPnL:   0.0,
		PnLPercent:      0.0,
		EntryTime:       time.Now(),
		Status:          "OPEN",
	}

	r.activePosition = pos
	r.lastTradeTime = time.Now()
	return pos, nil
}

// EvaluateRisk inspects the latest price tick against Stop-Loss and Take-Profit brackets
func (r *RiskShield) EvaluateRisk(currentPrice float64) (shouldClose bool, reason string, pos *Position) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.activePosition == nil || r.activePosition.Status != "OPEN" {
		return false, "NO_OPEN_POSITION", nil
	}

	p := r.activePosition
	p.CurrentPrice = roundTo(currentPrice, 4)
	pnlPercent := ((p.CurrentPrice - p.EntryPrice) / p.EntryPrice) * 100.0
	p.PnLPercent = roundTo(pnlPercent, 2)
	p.UnrealizedPnL = roundTo((p.CurrentPrice-p.EntryPrice)*p.Quantity, 4)

	// 1. Dynamic Trailing Stop: If profit hit +1.5%, advance Stop-Loss to +0.5% (Risk-free trade)
	if pnlPercent >= r.config.TrailingLockPercent {
		trailedSL := p.EntryPrice * (1.0 + 0.005)
		if trailedSL > p.StopLossPrice {
			p.StopLossPrice = roundTo(trailedSL, 4)
		}
	}

	// 2. Take-Profit hit (+4%)
	if p.CurrentPrice >= p.TakeProfitPrice {
		p.Status = "CLOSED_TP"
		r.tradeHistory = append(r.tradeHistory, *p)
		r.config.MicroAccountBalance += p.UnrealizedPnL
		r.activePosition = nil
		return true, fmt.Sprintf("TAKE_PROFIT_TRIGGERED: Target +%.2f%% reached (Gain +$%.4f)", p.PnLPercent, p.UnrealizedPnL), p
	}

	// 3. Stop-Loss hit (-2% hard stop)
	if p.CurrentPrice <= p.StopLossPrice {
		p.Status = "CLOSED_SL"
		r.tradeHistory = append(r.tradeHistory, *p)
		r.config.MicroAccountBalance += p.UnrealizedPnL
		r.activePosition = nil
		return true, fmt.Sprintf("STOP_LOSS_SHIELD_TRIGGERED: Hard capital stop at %.2f%% (Loss -$%.4f)", p.PnLPercent, -p.UnrealizedPnL), p
	}

	return false, "HOLDING", p
}

// GetActivePosition returns copy of the open position
func (r *RiskShield) GetActivePosition() *Position {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.activePosition == nil {
		return nil
	}
	cp := *r.activePosition
	return &cp
}

// GetConfig returns active risk configuration
func (r *RiskShield) GetConfig() RiskConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.config
}

// UpdateBalance updates account balance for compounding
func (r *RiskShield) UpdateBalance(balance float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.config.MicroAccountBalance = balance
	r.config.MaxRiskPerTradeUSD = balance * (r.config.MaxLossPercent / 100.0)
}
