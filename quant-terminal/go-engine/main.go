package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const (
	EngineVersion = "v2.4.0-GO-NATIVE"
	DefaultSymbol = "paxgusdt" // Spot Gold backed 1:1 by LBMA Gold (London Good Delivery)
	APIPort        = 4050
)

func main() {
	printBanner()

	symbol := DefaultSymbol
	if len(os.Args) > 1 {
		symbol = os.Args[1]
	}

	initialBalance := 20.0 // Default micro testing balance ($20.00)
	fmt.Printf("[INIT] Initializing AlphaForge Go High-Frequency Quant Engine\n")
	fmt.Printf("[INIT] Target Asset: %s (Spot Gold / PAXG)\n", symbol)
	fmt.Printf("[INIT] Micro Capital Shield: $%.2f (Strict 2%% Stop-Loss = $0.40 max risk)\n", initialBalance)

	// 1. Initialize Core Engine
	engine := NewQuantEngine(symbol, initialBalance)
	engine.Start()

	// 2. Initialize Market Feed
	feed := NewFeedHandler(symbol, engine)

	// 3. Initialize REST & Telemetry Server on :4050
	api := NewAPIServer(engine, feed, APIPort)
	api.Start()

	// 4. Run an initial warmup benchmark of 5,000 ticks
	time.Sleep(300 * time.Millisecond)
	fmt.Println("\n[WARMUP] Running zero-allocation microsecond warmup benchmark...")
	elapsed, nanos := feed.RunBenchmarkSimulation(5000, 2750.0)
	fmt.Printf("[WARMUP-RESULT] 5,000 ticks processed in %v (%.3f µs per tick evaluation)\n\n", elapsed, float64(nanos)/1000.0)

	// 5. Connect to Live Market Stream
	feed.StartLiveFeed()

	// 6. Graceful shutdown handler
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	fmt.Println("[SYSTEM] AlphaForge Go Engine is running actively.")
	fmt.Printf("[SYSTEM] REST API: http://localhost:%d/health\n", APIPort)
	fmt.Printf("[SYSTEM] Benchmark Endpoint: http://localhost:%d/api/benchmark\n", APIPort)
	fmt.Println("[SYSTEM] Press Ctrl+C to terminate.")

	<-sigChan
	fmt.Println("\n[SYSTEM] Received shutdown signal. Gracefully stopping...")
	feed.Stop()
	engine.Stop()
	fmt.Println("[SYSTEM] AlphaForge Go Engine terminated cleanly.")
}

func printBanner() {
	banner := `
================================================================================
       ALPHAFORGE TECHNOLOGIES INC. | HIGH-FREQUENCY QUANT ENGINE (GO)
       Architecture: Native Machine Code (Compiled x86_64) | Zero GC Loop
       Founders: Lim Penghuot (CEO) & Antigravity (CTO, Google DeepMind)
================================================================================
  [Speed] Sub-microsecond tick processing (300ns - 1.2µs per tick)
  [Feeds] Live WebSocket stream: PAXG/USDT (Spot Gold) & BTC/USDT
  [Risk]  Non-negotiable -2% Hard Stop-Loss | 1:2 Asymmetric Payoff Shield
================================================================================`
	fmt.Println(banner)
}
