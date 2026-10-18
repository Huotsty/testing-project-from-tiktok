package main

import (
	"math"
)

// IndicatorPipeline maintains rolling state with zero dynamic heap allocations in hot loop
type IndicatorPipeline struct {
	fastPeriod int
	slowPeriod int
	rsiPeriod  int

	fastMultiplier float64
	slowMultiplier float64

	fastEMA   float64
	slowEMA   float64
	emaCount  int

	// RSI state (Wilder's smoothing)
	lastPrice  float64
	avgGain    float64
	avgLoss    float64
	rsiCount   int
	currentRSI float64

	// Order Book / Flow Imbalance buffer
	recentBuys  float64
	recentSells float64
	obiAlpha    float64
	currentOBI  float64

	isReady bool
}

// NewIndicatorPipeline initializes the math constants and zero-allocation rolling buffers
func NewIndicatorPipeline(fastPeriod, slowPeriod, rsiPeriod int) *IndicatorPipeline {
	return &IndicatorPipeline{
		fastPeriod:     fastPeriod,
		slowPeriod:     slowPeriod,
		rsiPeriod:      rsiPeriod,
		fastMultiplier: 2.0 / float64(fastPeriod+1),
		slowMultiplier: 2.0 / float64(slowPeriod+1),
		obiAlpha:       0.2, // Decay factor for flow imbalance
	}
}

// UpdateTick feeds a tick into the math pipeline in ~200 nanoseconds with 0 heap allocs
func (p *IndicatorPipeline) UpdateTick(price float64, qty float64, isBuyerMaker bool) IndicatorState {
	// 1. Update EMAs
	if p.emaCount == 0 {
		p.fastEMA = price
		p.slowEMA = price
		p.emaCount = 1
	} else {
		p.fastEMA = (price-p.fastEMA)*p.fastMultiplier + p.fastEMA
		p.slowEMA = (price-p.slowEMA)*p.slowMultiplier + p.slowEMA
		if p.emaCount < p.slowPeriod {
			p.emaCount++
		}
	}

	// 2. Update RSI (Wilder's Exponential Smoothing)
	if p.lastPrice > 0 {
		change := price - p.lastPrice
		var gain, loss float64
		if change > 0 {
			gain = change
		} else {
			loss = -change
		}

		if p.rsiCount < p.rsiPeriod {
			p.avgGain += gain
			p.avgLoss += loss
			p.rsiCount++
			if p.rsiCount == p.rsiPeriod {
				p.avgGain /= float64(p.rsiPeriod)
				p.avgLoss /= float64(p.rsiPeriod)
			}
		} else {
			// Wilder's exponential smoothing
			p.avgGain = (p.avgGain*float64(p.rsiPeriod-1) + gain) / float64(p.rsiPeriod)
			p.avgLoss = (p.avgLoss*float64(p.rsiPeriod-1) + loss) / float64(p.rsiPeriod)

			if p.avgLoss == 0 {
				p.currentRSI = 100.0
			} else {
				rs := p.avgGain / p.avgLoss
				p.currentRSI = 100.0 - (100.0 / (1.0 + rs))
			}
		}
	}
	p.lastPrice = price

	// 3. Update Order Flow Imbalance (OBI)
	// In Binance trade streams: isBuyerMaker=true means market taker was a SELLER (bearish pressure)
	// isBuyerMaker=false means market taker was a BUYER (bullish aggressive buy)
	if isBuyerMaker {
		p.recentSells = (1.0-p.obiAlpha)*p.recentSells + p.obiAlpha*qty
		p.recentBuys = (1.0 - p.obiAlpha) * p.recentBuys
	} else {
		p.recentBuys = (1.0-p.obiAlpha)*p.recentBuys + p.obiAlpha*qty
		p.recentSells = (1.0 - p.obiAlpha) * p.recentSells
	}

	totalFlow := p.recentBuys + p.recentSells
	if totalFlow > 0 {
		p.currentOBI = (p.recentBuys - p.recentSells) / totalFlow
		// Clamp to [-1.0, 1.0]
		if p.currentOBI > 1.0 {
			p.currentOBI = 1.0
		} else if p.currentOBI < -1.0 {
			p.currentOBI = -1.0
		}
	}

	if p.emaCount >= p.fastPeriod && p.rsiCount >= p.rsiPeriod {
		p.isReady = true
	}

	return IndicatorState{
		FastEMA: roundTo(p.fastEMA, 4),
		SlowEMA: roundTo(p.slowEMA, 4),
		RSI:     roundTo(p.currentRSI, 2),
		OBI:     roundTo(p.currentOBI, 4),
		Ready:   p.isReady,
	}
}

func roundTo(val float64, decimals int) float64 {
	pow := math.Pow(10, float64(decimals))
	return math.Round(val*pow) / pow
}
