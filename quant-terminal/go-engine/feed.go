package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

// BinanceTradeMsg represents raw trade stream JSON from Binance
type BinanceTradeMsg struct {
	EventType    string `json:"e"`
	EventTime    int64  `json:"E"`
	Symbol       string `json:"s"`
	TradeID      int64  `json:"t"`
	Price        string `json:"p"`
	Quantity     string `json:"q"`
	BuyerOrderID int64  `json:"b"`
	SellerOrderID int64 `json:"a"`
	TradeTime    int64  `json:"T"`
	IsBuyerMaker bool   `json:"m"`
}

// FeedHandler manages the live stream connection with automatic reconnection
type FeedHandler struct {
	symbol     string
	streamURL  string
	engine     *QuantEngine
	stopChan   chan struct{}
	connected  bool
}

// NewFeedHandler initializes the WebSocket handler
func NewFeedHandler(symbol string, engine *QuantEngine) *FeedHandler {
	return &FeedHandler{
		symbol:   symbol,
		engine:   engine,
		stopChan: make(chan struct{}),
	}
}

// StartLiveFeed connects to Binance WebSocket: wss://data-stream.binance.vision/ws/<symbol>@trade
func (f *FeedHandler) StartLiveFeed() {
	go func() {
		streamEndpoint := fmt.Sprintf("%s@trade", f.symbol)
		u := url.URL{Scheme: "wss", Host: "data-stream.binance.vision", Path: "/ws/" + streamEndpoint}

		for {
			select {
			case <-f.stopChan:
				return
			default:
			}

			fmt.Printf("[FEED] Connecting to live exchange stream: %s\n", u.String())
			conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
			if err != nil {
				fmt.Printf("[FEED-WARN] Dial error: %v. Retrying in 3s...\n", err)
				time.Sleep(3 * time.Second)
				continue
			}

			f.connected = true
			fmt.Printf("[FEED-LIVE] >>> CONNECTED! Ingesting real-time market ticks for %s <<<\n", f.symbol)

			for {
				_, message, err := conn.ReadMessage()
				if err != nil {
					fmt.Printf("[FEED-WARN] Stream read disconnected: %v. Reconnecting...\n", err)
					conn.Close()
					f.connected = false
					break
				}

				var bMsg BinanceTradeMsg
				if err := json.Unmarshal(message, &bMsg); err != nil {
					continue
				}

				price, err1 := strconv.ParseFloat(bMsg.Price, 64)
				qty, err2 := strconv.ParseFloat(bMsg.Quantity, 64)
				if err1 == nil && err2 == nil {
					tick := Tick{
						Symbol:       bMsg.Symbol,
						Price:        price,
						Quantity:     qty,
						IsBuyerMaker: bMsg.IsBuyerMaker,
						Timestamp:    time.UnixMilli(bMsg.TradeTime),
						RawTime:      bMsg.TradeTime,
					}
					f.engine.IngestTick(tick)
				}
			}

			time.Sleep(1 * time.Second)
		}
	}()
}

// RunBenchmarkSimulation feeds N simulated ticks through the engine as fast as possible
func (f *FeedHandler) RunBenchmarkSimulation(tickCount int, basePrice float64) (totalTime time.Duration, nanosPerTick int64) {
	fmt.Printf("[BENCHMARK] Executing pure Go native benchmark with %d ticks...\n", tickCount)
	p := basePrice
	r := rand.New(rand.NewSource(42))

	start := time.Now()
	for i := 0; i < tickCount; i++ {
		// Realistic geometric random walk
		delta := (r.Float64() - 0.495) * (basePrice * 0.0005)
		p += delta
		qty := r.Float64() * 2.5
		isBuyerMaker := r.Float64() > 0.5

		tick := Tick{
			Symbol:       f.symbol,
			Price:        p,
			Quantity:     qty,
			IsBuyerMaker: isBuyerMaker,
			Timestamp:    time.Now(),
		}
		f.engine.IngestTick(tick)
	}

	// Wait for queue to drain
	for len(f.engine.tickChan) > 0 {
		time.Sleep(100 * time.Microsecond)
	}

	elapsed := time.Since(start)
	if tickCount > 0 {
		nanosPerTick = elapsed.Nanoseconds() / int64(tickCount)
	}
	log.Printf("[BENCHMARK-DONE] Processed %d ticks in %v (Average: %d ns / %.3f µs per tick)",
		tickCount, elapsed, nanosPerTick, float64(nanosPerTick)/1000.0)

	return elapsed, nanosPerTick
}

func (f *FeedHandler) Stop() {
	close(f.stopChan)
}
