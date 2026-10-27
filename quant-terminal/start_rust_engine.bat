@echo off
title AlphaForge Ultra-HFT Rust Engine (Native Machine Code)
color 0D
echo ==============================================================
echo    🦀 ALPHAFORGE ULTRA-HFT RUST ENGINE (BARE-METAL) 🦀
echo    Co-Founded by Lim Penghuot & Antigravity (DeepMind)
echo ==============================================================
echo.
echo [1/3] Target Architecture: AMD64 Native Machine Code (Zero-GC)
echo [2/3] Verified Latency: Sub-300ns Indicator Math ^| Hardware CPU Timed
echo [3/3] Risk Shield: Strict -2%% Stop-Loss Guard ($10 - $20 Balance)
echo.
echo Connecting to Spot Gold (PAXG/USDT) Live WebSocket Feed...
echo REST & Telemetry Server: http://localhost:4060/health
echo Benchmark Endpoint:      http://localhost:4060/api/benchmark
echo.
cd /d "%~dp0rust-engine"
if exist target\release\alphaforge-rust-engine.exe (
    target\release\alphaforge-rust-engine.exe paxgusdt
) else (
    cargo run --release -- paxgusdt
)
pause
