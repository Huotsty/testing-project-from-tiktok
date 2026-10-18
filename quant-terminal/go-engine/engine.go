package main

import (
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
)

// QuantEngine orchestrates the live tick pipeline, indicator math, and signal execution
type QuantEngine struct {
	symbol          string
	pipeline        *IndicatorPipeline
	riskShield      *RiskShield
	tickChan        chan Tick
	signals         []Signal
	signalMu        sync.RWMutex
	maxSignals      int
	ticksProcessed  uint64
	signalsProduced uint64
	totalLatencyNs  int64
	startTime       time.Time
	latestTick      Tick
	latestIndicators IndicatorState
	stopChan        chan struct{}
}

// NewQuantEngine constructs the engine with preallocated buffers
func NewQuantEngine(symbol string, initialBalance float64) *QuantEngine {
	return &QuantEngine{
		symbol:     symbol,
		pipeline:   NewIndicatorPipeline(9, 21, 14),
		riskShield: NewRiskShield(initialBalance),
		tickChan:   make(chan Tick, 10000), // Preallocated buffered queue for burst ticks
		signals:    make([]Signal, 0, 500),
		maxSignals: 100,
		startTime:  time.Now(),
		stopChan:   make(chan struct{}),
	}
}

// Start launches the dedicated execution goroutine
func (e *QuantEngine) Start() {
	go e.eventLoop()
}

// Stop gracefully shuts down the engine
func (e *QuantEngine) Stop() {
	close(e.stopChan)
}

// IngestTick queues an incoming trade tick into the engine channel
func (e *QuantEngine) IngestTick(t Tick) {
	select {
	case e.tickChan <- t:
	default:
		// Queue full during extreme network spikes: drop oldest or log
	}
}

// eventLoop is the ultra-fast hot loop running in a dedicated Goroutine
func (e *QuantEngine) eventLoop() {
	for {
		select {
		case <-e.stopChan:
			return
		case t := <-e.tickChan:
			start := time.Now()

			// Process indicators
			ind := e.pipeline.UpdateTick(t.Price, t.Quantity, t.IsBuyerMaker)
			e.latestTick = t
			e.latestIndicators = ind

			// Check active positions with Risk Shield
			shouldClose, reason, pos := e.riskShield.EvaluateRisk(t.Price)
			if shouldClose && pos != nil {
				e.recordSignal(Signal{
					ID:            fmt.Sprintf("SIG-%d", atomic.AddUint64(&e.signalsProduced, 1)),
					Symbol:        t.Symbol,
					Action:        ActionSell,
					Price:         t.Price,
					Reason:        reason,
					StopLoss:      pos.StopLossPrice,
					TakeProfit:    pos.TakeProfitPrice,
					Confidence:    1.0,
					LatencyNanos:  time.Since(start).Nanoseconds(),
					LatencyMicros: time.Since(start).Microseconds(),
					Timestamp:     time.Now(),
					Indicators:    ind,
				})
			}

			// If no position is open, evaluate entry conditions
			if ind.Ready && !shouldClose {
				canEnter, _ := e.riskShield.CanEnterTrade()
				if canEnter {
					// Core Alpha Strategy:
					// 1. Fast EMA (9) > Slow EMA (21) [Trend Bullish]
					// 2. RSI between 42 and 65 [Healthy Momentum, not overbought]
					// 3. Order Book Imbalance > 0.05 [Aggressive buyer order flow dominant]
					if ind.FastEMA > ind.SlowEMA && ind.RSI >= 42.0 && ind.RSI <= 68.0 && ind.OBI > 0.05 {
						newPos, err := e.riskShield.OpenPosition(t.Symbol, t.Price)
						if err == nil {
							e.recordSignal(Signal{
								ID:            fmt.Sprintf("SIG-%d", atomic.AddUint64(&e.signalsProduced, 1)),
								Symbol:        t.Symbol,
								Action:        ActionBuy,
								Price:         t.Price,
								Reason:        fmt.Sprintf("ALPHA_GOLDEN_CROSS: EMA9(%.2f) > EMA21(%.2f) + RSI(%.1f) + Bullish OBI(%.2f)", ind.FastEMA, ind.SlowEMA, ind.RSI, ind.OBI),
								StopLoss:      newPos.StopLossPrice,
								TakeProfit:    newPos.TakeProfitPrice,
								Confidence:    0.92,
								LatencyNanos:  time.Since(start).Nanoseconds(),
								LatencyMicros: time.Since(start).Microseconds(),
								Timestamp:     time.Now(),
								Indicators:    ind,
							})
						}
					}
				}
			}

			// Benchmark latency metric
			durNs := time.Since(start).Nanoseconds()
			atomic.AddInt64(&e.totalLatencyNs, durNs)
			atomic.AddUint64(&e.ticksProcessed, 1)
		}
	}
}

func (e *QuantEngine) recordSignal(sig Signal) {
	e.signalMu.Lock()
	defer e.signalMu.Unlock()

	e.signals = append([]Signal{sig}, e.signals...)
	if len(e.signals) > e.maxSignals {
		e.signals = e.signals[:e.maxSignals]
	}
	fmt.Printf("[%s] %s | Price: $%.2f | Latency: %dns (%dµs) | %s\n",
		sig.Action, sig.Symbol, sig.Price, sig.LatencyNanos, sig.LatencyMicros, sig.Reason)
}

// GetSignals returns recent signals
func (e *QuantEngine) GetSignals() []Signal {
	e.signalMu.RLock()
	defer e.signalMu.RUnlock()
	res := make([]Signal, len(e.signals))
	copy(res, e.signals)
	return res
}

// GetStatus compiles instant real-time telemetry
func (e *QuantEngine) GetStatus() EngineStatus {
	ticks := atomic.LoadUint64(&e.ticksProcessed)
	totalNs := atomic.LoadInt64(&e.totalLatencyNs)
	var avgNs int64
	var avgMicros float64
	if ticks > 0 {
		avgNs = totalNs / int64(ticks)
		avgMicros = float64(avgNs) / 1000.0
	}

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	return EngineStatus{
		EngineName:       "AlphaForge Go Ultra-HFT Engine",
		Language:         "Go (Golang compiled machine code)",
		Version:          "v2.4.0",
		UptimeSeconds:    roundTo(time.Since(e.startTime).Seconds(), 1),
		TicksProcessed:   ticks,
		SignalsGenerated: atomic.LoadUint64(&e.signalsProduced),
		AvgLatencyNanos:  avgNs,
		AvgLatencyMicros: roundTo(avgMicros, 3),
		ActiveSymbol:     e.symbol,
		LatestPrice:      e.latestTick.Price,
		Indicators:       e.latestIndicators,
		ActivePosition:   e.riskShield.GetActivePosition(),
		RiskConfig:       e.riskShield.GetConfig(),
		NumGoroutines:    runtime.NumGoroutine(),
		AllocatedMemKB:   m.Alloc / 1024,
	}
}
