@echo off
title AlphaForge Quant Terminal - Automated Launcher
color 0B
echo ==============================================================
echo       ⚡ ALPHAFORGE TECHNOLOGIES - QUANT TERMINAL ⚡
echo       Co-Founded by Lim Penghuot ^& Antigravity (DeepMind)
echo ==============================================================
echo.
echo [1/3] Checking environment ^& dependencies...
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo [2/3] Running Automated Unit Tests (30/30 Institutional Verification)...
call npm test
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Unit tests failed! Please check logs.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Checking port 4000 availability...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr /C:":4000 "') do (
    echo [INFO] Freeing port 4000 from lingering process PID %%p...
    taskkill /F /PID %%p >nul 2>&1
)
ping 127.0.0.1 -n 2 >nul

echo [4/4] Launching AlphaForge Real-Time Trading Engine...
start "" http://localhost:4000
node server/index.js
pause
