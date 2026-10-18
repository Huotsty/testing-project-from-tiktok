package main

import (
	"time"
)

// Tick represents a single raw trade tick from exchange feeds (Binance / Capital.com)
type Tick struct {
	Symbol       string    `json:"symbol"`
	Price        float64   `json:"price"`
	Quantity     float64   `json:"quantity"`
	IsBuyerMaker bool      `json:"is_buyer_maker"`
	Timestamp    time.Time `json:"timestamp"`
	RawTime      int64     `json:"raw_time"`
}

// IndicatorState holds high-frequency mathematical indicators
type IndicatorState struct {
	FastEMA float64 `json:"fast_ema"` // EMA 9
	SlowEMA float64 `json:"slow_ema"` // EMA 21
	RSI     float64 `json:"rsi"`      // RSI 14
	OBI     float64 `json:"obi"`      // Order Book Imbalance [-1.0, 1.0]
	Ready   bool    `json:"ready"`
}

// SignalAction represents execution directives
type SignalAction string

const (
	ActionBuy  SignalAction = "BUY"
	ActionSell SignalAction = "SELL"
	ActionHold SignalAction = "HOLD"
)

// Signal represents an actionable trading instruction produced by the engine
type Signal struct {
	ID             string       `json:"id"`
	Symbol         string       `json:"symbol"`
	Action         SignalAction `json:"action"`
	Price          float64      `json:"price"`
	Reason         string       `json:"reason"`
	StopLoss       float64      `json:"stop_loss"`
	TakeProfit     float64      `json:"take_profit"`
	Confidence     float64      `json:"confidence"`
	LatencyMicros  int64        `json:"latency_micros"`
	LatencyNanos   int64        `json:"latency_nanos"`
	Timestamp      time.Time    `json:"timestamp"`
	Indicators     IndicatorState `json:"indicators"`
}

// Position tracks active paper or live trade status
type Position struct {
	Symbol          string    `json:"symbol"`
	EntryPrice      float64   `json:"entry_price"`
	CurrentPrice    float64   `json:"current_price"`
	Quantity        float64   `json:"quantity"`
	StopLossPrice   float64   `json:"stop_loss_price"`
	TakeProfitPrice float64   `json:"take_profit_price"`
	GrossPnL        float64   `json:"gross_pnl"`
	TotalFees       float64   `json:"total_fees"`
	NetPnL          float64   `json:"net_pnl"`
	NetPnLPercent   float64   `json:"net_pnl_percent"`
	EntryTime       time.Time `json:"entry_time"`
	Status          string    `json:"status"` // "OPEN", "CLOSED_TP", "CLOSED_SL"
}

// RiskConfig enforces strict, non-negotiable capital preservation rules
type RiskConfig struct {
	MaxLossPercent       float64 `json:"max_loss_percent"`       // Default 2.0% NET
	TakeProfitPercent    float64 `json:"take_profit_percent"`    // Default 4.0% NET
	TrailingLockPercent  float64 `json:"trailing_lock_percent"`  // Default 1.5% NET
	MicroAccountBalance  float64 `json:"micro_account_balance"`  // e.g. $10.00 - $20.00
	MaxRiskPerTradeUSD   float64 `json:"max_risk_per_trade_usd"` // e.g. $0.40 on a $20 balance
	BrokerTakerFeePct    float64 `json:"broker_taker_fee_pct"`   // 0.08% taker fee
	BrokerMakerFeePct    float64 `json:"broker_maker_fee_pct"`   // 0.04% maker fee
	EstimatedSpreadPct   float64 `json:"estimated_spread_pct"`   // 0.02% spread on Spot Gold
	MaxAllowedSpreadPct  float64 `json:"max_allowed_spread_pct"` // 0.05% spread gate killswitch
	MinAlphaHurdlePct    float64 `json:"min_alpha_hurdle_pct"`   // 0.45% minimum profit hurdle
	TotalFeesPaidUSD     float64 `json:"total_fees_paid_usd"`    // Cumulative commissions paid
}

// EngineStatus reports runtime health and latency benchmarks
type EngineStatus struct {
	EngineName       string         `json:"engine_name"`
	Language         string         `json:"language"`
	Version          string         `json:"version"`
	UptimeSeconds    float64        `json:"uptime_seconds"`
	TicksProcessed   uint64         `json:"ticks_processed"`
	SignalsGenerated uint64         `json:"signals_generated"`
	AvgLatencyNanos  int64          `json:"avg_latency_nanos"`
	AvgLatencyMicros float64        `json:"avg_latency_micros"`
	ActiveSymbol     string         `json:"active_symbol"`
	LatestPrice      float64        `json:"latest_price"`
	Indicators       IndicatorState `json:"indicators"`
	ActivePosition   *Position      `json:"active_position,omitempty"`
	RiskConfig       RiskConfig     `json:"risk_config"`
	NumGoroutines    int            `json:"num_goroutines"`
	AllocatedMemKB   uint64         `json:"allocated_mem_kb"`
}
