@echo off
chcp 65001 >nul
REM FanraAi Cloudflare Tunnels - auto start
REM Membuka akses publik ke service lokal (status sync + chat di portal)

set CF=C:\Program Files (x86)\cloudflared\cloudflared.exe
set LOGS=C:\Users\ASUS\FanraAi\logs

start "fanra-tunnel-ruang" /min "" "%CF%" tunnel --url http://127.0.0.1:3001 > "%LOGS%\cloudflared-ruang.log" 2>&1
timeout /t 3 /nobreak >nul
start "fanra-tunnel-touchpad" /min "" "%CF%" tunnel --url http://127.0.0.1:8000 > "%LOGS%\cloudflared-touchpad.log" 2>&1
timeout /t 3 /nobreak >nul
start "fanra-tunnel-dashboard" /min "" "%CF%" tunnel --url http://127.0.0.1:3001 > "%LOGS%\cloudflared-dashboard.log" 2>&1
timeout /t 3 /nobreak >nul
start "fanra-tunnel-llm" /min "" "%CF%" tunnel --url http://127.0.0.1:20128 > "%LOGS%\cloudflared-llm.log" 2>&1

echo FanraAi tunnels started.
