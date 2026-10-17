@echo off
title AlphaForge Autonomous Trading Bot - Gold & BTC
color 0A
echo ==============================================================
echo       ⚡ ALPHAFORGE AUTONOMOUS DUAL-ASSET TRADING BOT ⚡
echo       Gold (XAU-USD) Trend Hunter & BTC Volatility Reversion
echo       Institutional Risk Guards: Stop-Loss (-2%) & AI Filter
echo ==============================================================
echo.
echo [1/3] Navigating to directory...
cd /d "%~dp0"

echo [2/3] Verifying all test guards (19/19 Tests)...
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Unit tests failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Checking if AlphaForge Quant Engine is running...
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo Starting Quant Engine in background...
    start /B node server/index.js
    timeout /t 2 /nobreak >nul
)

echo Starting Live Auto-Trader Monitor HUD...
node scripts/runAutoTrader.js
pause
