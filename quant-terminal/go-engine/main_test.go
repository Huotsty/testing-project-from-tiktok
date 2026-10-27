package main

import (
	"testing"
)

// BenchmarkIndicatorPipeline tests raw calculation speed of EMA(9), EMA(21), RSI(14), and OBI
func BenchmarkIndicatorPipeline(b *testing.B) {
	p := NewIndicatorPipeline(9, 21, 14)
	price := 2750.0

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		price += 0.05
		p.UpdateTick(price, 1.25, false)
	}
}

// BenchmarkEngineTickProcessing tests end-to-end tick ingestion, risk checks, and signal evaluation
func BenchmarkEngineTickProcessing(b *testing.B) {
	engine := NewQuantEngine("paxgusdt", 20.0)
	price := 2750.0

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		price += 0.02
		ind := engine.pipeline.UpdateTick(price, 1.0, false)
		shouldClose, _, _ := engine.riskShield.EvaluateRisk(price)
		if !shouldClose && ind.Ready {
			canEnter, _ := engine.riskShield.CanEnterTrade(0.02)
			if canEnter && ind.FastEMA > ind.SlowEMA {
				engine.riskShield.OpenPosition("paxgusdt", price)
			}
		}
	}
}

// TestIndicatorPipeline tests accuracy and warm-up of indicators
func TestIndicatorPipeline(t *testing.T) {
	p := NewIndicatorPipeline(9, 21, 14)
	price := 2750.0

	// Feed 30 ticks to warm up pipeline
	for i := 0; i < 30; i++ {
		price += 1.0
		ind := p.UpdateTick(price, 1.0, false)
		if i == 29 {
			if !ind.Ready {
				t.Fatalf("expected pipeline to be ready after 30 ticks")
			}
			if ind.FastEMA <= 0 || ind.SlowEMA <= 0 {
				t.Fatalf("expected positive EMA values, got fast=%.2f, slow=%.2f", ind.FastEMA, ind.SlowEMA)
			}
			if ind.RSI < 0 || ind.RSI > 100 {
				t.Fatalf("RSI out of bounds: %.2f", ind.RSI)
			}
		}
	}
}

// TestRiskShieldStopLoss validates strict -2% stop-loss protection
func TestRiskShieldStopLoss(t *testing.T) {
	shield := NewRiskShield(20.0)
	pos, err := shield.OpenPosition("PAXGUSDT", 2700.0)
	if err != nil {
		t.Fatalf("failed to open position: %v", err)
	}

	if pos.StopLossPrice >= 2700.0 {
		t.Fatalf("StopLossPrice (%.2f) must be below entry price (2700.0)", pos.StopLossPrice)
	}

	// Price drops below stop-loss
	shouldClose, reason, closedPos := shield.EvaluateRisk(pos.StopLossPrice - 5.0)
	if !shouldClose {
		t.Fatalf("expected stop-loss trigger, but evaluate returned false")
	}
	if closedPos.Status != "CLOSED_SL" {
		t.Fatalf("expected status CLOSED_SL, got %s", closedPos.Status)
	}
	if reason == "" {
		t.Fatalf("expected close reason, got empty string")
	}
}

// TestRiskShieldTakeProfit validates +4% take-profit target
func TestRiskShieldTakeProfit(t *testing.T) {
	shield := NewRiskShield(20.0)
	pos, err := shield.OpenPosition("PAXGUSDT", 2700.0)
	if err != nil {
		t.Fatalf("failed to open position: %v", err)
	}

	// Price rises to take-profit
	shouldClose, _, closedPos := shield.EvaluateRisk(pos.TakeProfitPrice + 2.0)
	if !shouldClose {
		t.Fatalf("expected take-profit trigger, but evaluate returned false")
	}
	if closedPos.Status != "CLOSED_TP" {
		t.Fatalf("expected status CLOSED_TP, got %s", closedPos.Status)
	}
	if closedPos.NetPnL <= 0 {
		t.Fatalf("expected positive NetPnL on take profit, got %.4f", closedPos.NetPnL)
	}
}
