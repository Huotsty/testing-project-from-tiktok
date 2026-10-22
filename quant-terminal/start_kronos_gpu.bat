@echo off
title AlphaForge - Kronos AI GPU Forecaster (NVIDIA RTX 3050 CUDA)
color 0B
echo ==============================================================
echo       🧠 ALPHAFORGE KRONOS FOUNDATION MODEL (AAAI 2026) 🧠
echo       Target: NVIDIA GeForce RTX 3050 Laptop GPU (CUDA 12.6)
echo       Port: 5050 (HTTP Microservice)
echo ==============================================================
echo.
cd /d "%~dp0"

echo [*] STEP 1: Running GPU Hardware & Tensor Benchmark...
echo.
py -3.13 test_gpu_kronos.py
if %ERRORLEVEL% NEQ 0 (
    echo [FALLBACK] Trying with default Python launcher...
    python test_gpu_kronos.py
)

echo.
echo ==============================================================
echo [*] STEP 2: Launching Live GPU Microservice on Port 5050...
echo     Watch below: Every incoming market prediction streams live!
echo ==============================================================
echo.

py -3.13 -u server\core\kronos_service.py
pause
