@echo off
title AlphaForge Autonomous Trading Bot - Gold & BTC
color 0A
echo ==============================================================
echo       ⚡ ALPHAFORGE AUTONOMOUS DUAL-ASSET TRADING BOT ⚡
echo       Gold (XAU-USD) Trend Hunter ^& BTC Volatility Reversion
echo       Institutional Risk Guards: Stop-Loss (-2%) ^& AI Filter
echo ==============================================================
echo.
echo [1/3] Navigating to directory...
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo [2/3] Verifying all institutional risk guards (30/30 Tests)...
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Unit tests failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Checking if AlphaForge Quant Engine is running on port 4000...
netstat -aon | findstr /C:":4000 " | findstr "LISTENING" >nul 2>&1
if "%ERRORLEVEL%"=="1" (
    echo Starting Quant Engine in background on port 4000...
    start /B node server/index.js
    ping 127.0.0.1 -n 3 >nul
) else (
    echo [INFO] Quant Engine already active on port 4000.
)

echo Starting Live Auto-Trader Monitor HUD...
node scripts/runAutoTrader.js
pause
