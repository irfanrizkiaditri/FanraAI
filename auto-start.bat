@echo off
chcp 65001 >nul
title FanraAi Services - AUTO START (Windows Boot)
cd /d "C:\Users\ASUS\FanraAi"

echo ========================================
echo   FanraAi - Auto Start on Windows Boot
echo ========================================
echo.

rem Wait a bit for network to be ready
timeout /t 10 /nobreak >nul

echo [1/3] Starting PM2 daemon...
pm2 resurrect 2>nul || echo "No saved PM2 processes, starting fresh..."

echo [2/3] Starting all services...
pm2 start ecosystem.config.js

echo [3/3] Saving PM2 process list for next boot...
pm2 save

echo.
echo ========================================
echo   FanraAi services started on boot!
echo ========================================
echo.
echo Akses:
echo   ruang (builder 3D)        : http://localhost:5173
echo   touchpad server (WS/REST) : http://localhost:8000
echo   touchpad dashboard        : http://localhost:3000
echo.
rem Keep window open for 5 seconds to show status, then close
timeout /t 5 /nobreak >nul