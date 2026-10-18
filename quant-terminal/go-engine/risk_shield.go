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
		MaxLossPercent:      2.0,  // Hard stop at -2.0% NET
		TakeProfitPercent:   4.0,  // 1:2 asymmetric payoff (+4.0% NET)
		TrailingLockPercent: 1.5,  // Lock at breakeven + fee buffer once +1.5% NET
		MicroAccountBalance: balance,
		MaxRiskPerTradeUSD:  balance * 0.02, // $0.40 on a $20 balance
		BrokerTakerFeePct:   0.08, // 0.08% taker commission
		BrokerMakerFeePct:   0.04, // 0.04% maker commission
		EstimatedSpreadPct:  0.02, // 0.02% spread on Spot Gold
		MaxAllowedSpreadPct: 0.05, // 0.05% spread gate killswitch
		MinAlphaHurdlePct:   0.45, // 0.45% minimum profit hurdle
		TotalFeesPaidUSD:    0.0,
	}
	return &RiskShield{
		config:       cfg,
		tradeHistory: make([]Position, 0, 100),
	}
}

// CanEnterTrade validates whether opening a new position passes all safety filters
func (r *RiskShield) CanEnterTrade(currentSpreadPct float64) (bool, string) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.activePosition != nil && r.activePosition.Status == "OPEN" {
		return false, "ACTIVE_POSITION_EXISTS: only 1 concurrent position allowed for micro accounts"
	}

	// Spread Gate Killswitch: Protects against spread expansion during high volatility
	if currentSpreadPct > r.config.MaxAllowedSpreadPct {
		return false, fmt.Sprintf("SPREAD_GATE_BLOCKED: Current spread (%.3f%%) exceeds safety limit (%.3f%%). Fee drag too high.", currentSpreadPct, r.config.MaxAllowedSpreadPct)
	}

	// 10-second cooldown between trades to eliminate high-frequency churn fees
	if time.Since(r.lastTradeTime) < 10*time.Second {
		return false, fmt.Sprintf("COOLDOWN_ACTIVE: waiting %.1fs before next trade", 10.0-time.Since(r.lastTradeTime).Seconds())
	}

	return true, "READY"
}

// OpenPosition calculates strict bracket orders compensated for round-trip broker fees
func (r *RiskShield) OpenPosition(symbol string, entryPrice float64) (*Position, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Calculate round-trip broker drag (entry fee + exit fee + half spread)
	roundTripFeePct := (r.config.BrokerTakerFeePct * 2.0) + r.config.EstimatedSpreadPct

	// Compensate brackets so user takes home NET +4% and stops out at NET -2%
	netAdjustedTPPct := r.config.TakeProfitPercent + roundTripFeePct
	netAdjustedSLPct := r.config.MaxLossPercent - roundTripFeePct
	if netAdjustedSLPct <= 0 {
		netAdjustedSLPct = r.config.MaxLossPercent * 0.5
	}

	slPrice := entryPrice * (1.0 - (netAdjustedSLPct / 100.0))
	tpPrice := entryPrice * (1.0 + (netAdjustedTPPct / 100.0))

	// Micro-position sizing: Allocate max 50% of capital to single trade
	positionUSD := r.config.MicroAccountBalance * 0.50
	qty := positionUSD / entryPrice

	initialFees := positionUSD * (roundTripFeePct / 100.0)

	pos := &Position{
		Symbol:          symbol,
		EntryPrice:      roundTo(entryPrice, 4),
		CurrentPrice:    roundTo(entryPrice, 4),
		Quantity:        roundTo(qty, 6),
		StopLossPrice:   roundTo(slPrice, 4),
		TakeProfitPrice: roundTo(tpPrice, 4),
		GrossPnL:        0.0,
		TotalFees:       roundTo(initialFees, 4),
		NetPnL:          roundTo(-initialFees, 4),
		NetPnLPercent:   roundTo(-roundTripFeePct, 2),
		EntryTime:       time.Now(),
		Status:          "OPEN",
	}

	r.activePosition = pos
	r.lastTradeTime = time.Now()
	return pos, nil
}

// EvaluateRisk inspects the latest price tick against net-of-fee Stop-Loss and Take-Profit brackets
func (r *RiskShield) EvaluateRisk(currentPrice float64) (shouldClose bool, reason string, pos *Position) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.activePosition == nil || r.activePosition.Status != "OPEN" {
		return false, "NO_OPEN_POSITION", nil
	}

	p := r.activePosition
	p.CurrentPrice = roundTo(currentPrice, 4)

	positionVal := p.Quantity * p.EntryPrice
	currentVal := p.Quantity * p.CurrentPrice

	// Real-time broker fee breakdown
	entryComm := positionVal * (r.config.BrokerTakerFeePct / 100.0)
	exitComm := currentVal * (r.config.BrokerTakerFeePct / 100.0)
	spreadCost := positionVal * (r.config.EstimatedSpreadPct / 100.0)
	roundTripFees := entryComm + exitComm + spreadCost

	p.GrossPnL = roundTo(currentVal-positionVal, 4)
	p.TotalFees = roundTo(roundTripFees, 4)
	p.NetPnL = roundTo(p.GrossPnL-roundTripFees, 4)
	p.NetPnLPercent = roundTo((p.NetPnL/positionVal)*100.0, 2)

	// 1. Dynamic Trailing Stop: If NET profit hits +1.5%, lock SL at +0.5% NET (Guaranteed green trade)
	if p.NetPnLPercent >= r.config.TrailingLockPercent {
		trailedSL := p.EntryPrice * (1.0 + ((0.5 + (roundTripFees/positionVal)*100.0) / 100.0))
		if trailedSL > p.StopLossPrice {
			p.StopLossPrice = roundTo(trailedSL, 4)
		}
	}

	// 2. Take-Profit hit (Target NET +4.0% cash in pocket)
	if p.CurrentPrice >= p.TakeProfitPrice {
		p.Status = "CLOSED_TP"
		r.tradeHistory = append(r.tradeHistory, *p)
		r.config.MicroAccountBalance += p.NetPnL
		r.config.TotalFeesPaidUSD += roundTripFees
		r.activePosition = nil
		return true, fmt.Sprintf("TAKE_PROFIT_TRIGGERED: Target Net +%.2f%% reached (Net Gain +$%.4f | Broker Fee -$%.4f)", p.NetPnLPercent, p.NetPnL, roundTripFees), p
	}

	// 3. Stop-Loss hit (Hard NET -2.0% Capital Stop)
	if p.CurrentPrice <= p.StopLossPrice {
		p.Status = "CLOSED_SL"
		r.tradeHistory = append(r.tradeHistory, *p)
		r.config.MicroAccountBalance += p.NetPnL
		r.config.TotalFeesPaidUSD += roundTripFees
		r.activePosition = nil
		return true, fmt.Sprintf("STOP_LOSS_SHIELD_TRIGGERED: Hard capital stop at Net %.2f%% (Net Loss -$%.4f | Broker Fee -$%.4f)", p.NetPnLPercent, -p.NetPnL, roundTripFees), p
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
