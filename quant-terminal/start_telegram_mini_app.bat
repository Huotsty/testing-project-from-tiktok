@echo off
title AlphaForge Telegram Mini App - HTTPS Tunnel
color 0A
echo ==============================================================
echo       📱 ALPHAFORGE TELEGRAM MINI APP - LIVE TUNNEL 📱
echo ==============================================================
echo.
echo Launching free secure HTTPS tunnel via Cloudflare...
echo Copy the "https://....trycloudflare.com" link below and paste it
echo into @BotFather (/setmenubutton) to open your terminal on mobile!
echo.
npx -y cloudflared tunnel --url http://localhost:4000
pause
