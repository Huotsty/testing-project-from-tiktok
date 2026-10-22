@echo off
title AlphaForge - Kronos AI GPU Forecaster (RTX 3050 CUDA)
color 0E
echo ==============================================================
echo       🧠 ALPHAFORGE KRONOS FOUNDATION MODEL (AAAI 2026) 🧠
echo       Target: NVIDIA GeForce RTX 3050 Laptop GPU (CUDA 13.2)
echo       Port: 5050 (HTTP Microservice)
echo ==============================================================
echo.
cd /d "%~dp0"

echo [*] Initializing PyTorch CUDA Runtime...
"C:\Users\ASUS\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\python.exe" server\core\kronos_service.py

if %ERRORLEVEL% NEQ 0 (
    echo [FALLBACK] Attempting default Python environment...
    python server\core\kronos_service.py
)
pause
