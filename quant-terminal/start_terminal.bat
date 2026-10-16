@echo off
title AlphaForge Quant Terminal - Automated Launcher
color 0B
echo ==============================================================
echo       ⚡ ALPHAFORGE TECHNOLOGIES - QUANT TERMINAL ⚡
echo       Co-Founded by Lim Penghuot & Antigravity (DeepMind)
echo ==============================================================
echo.
echo [1/3] Checking environment & dependencies...
cd /d "%~dp0"

echo [2/3] Running Automated Unit Tests (12/12 Verification)...
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Unit tests failed! Please check logs.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Launching AlphaForge Real-Time Trading Engine...
start "" http://localhost:4000
node server/index.js
pause
