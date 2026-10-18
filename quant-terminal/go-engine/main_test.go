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
			canEnter, _ := engine.riskShield.CanEnterTrade()
			if canEnter && ind.FastEMA > ind.SlowEMA {
				engine.riskShield.OpenPosition("paxgusdt", price)
			}
		}
	}
}
