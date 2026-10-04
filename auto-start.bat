@echo off
chcp 65001 >nul
title FanraAi Services - AUTO START (Windows Boot)
cd /d "C:\Users\ASUS\FanraAi"

echo ========================================
echo   FanraAi - Auto Start on Windows Boot
echo ========================================
echo.

rem Tunggu network siap
timeout /t 10 /nobreak >nul
call "%~dp0start-tunnels.bat"
timeout /t 25 /nobreak >nul
rem sync-tunnels dijalankan PM2 (sync-tunnels.py) - tanpa window console
rem call "%~dp0sync-tunnels.bat"

echo [1/6] Starting PM2 daemon...
pm2 resurrect 2>nul || echo "No saved PM2 processes, starting fresh..."

echo [2/6] Starting all services...
pm2 start ecosystem.config.js

echo [3/6] Saving PM2 process list for next boot...
pm2 save

echo [4/6] Starting Cloudflare tunnels...
call "%~dp0start-tunnels.bat"

echo [5/6] Sinkronisasi URL tunnel ke GitHub...
timeout /t 25 /nobreak >nul
call "%~dp0sync-tunnels.bat"

echo [6/6] Starting tunnel watchdog (auto-heal + auto-sync)...
start "FanraAi Tunnel Watchdog" /min "" "%~dp0tunnel-watchdog.bat"

echo.
echo ========================================
echo   FanraAi services started on boot!
echo ========================================
echo.
echo Akses lokal:
echo   ruang (builder 3D)        : http://localhost:5173
echo   touchpad server (WS/REST) : http://localhost:8000
echo   touchpad dashboard        : http://localhost:3000
echo.
echo Portal baca URL tunnel dari GitHub (auto-sync tiap 60 detik).
echo.
timeout /t 5 /nobreak >nul