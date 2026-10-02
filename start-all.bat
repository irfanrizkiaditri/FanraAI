@echo off
chcp 65001 >nul
title FanraAi Services - START ALL
cd /d "C:\Users\ASUS\FanraAi"

echo ========================================
echo   FanraAi - Starting All Services
echo ========================================
echo.

echo [1/3] Installing PM2 globally (if needed)...
npm list -g pm2 >nul 2>&1 || npm install -g pm2

echo [2/3] Installing dependencies for each service...
echo.
echo --- ruang ---
cd /d "C:\Users\ASUS\FanraAi\ruang"
npm install --legacy-peer-deps 2>&1 | findstr /V "npm WARN"

echo.
echo --- remote-touchpad ---
cd /d "C:\Users\ASUS\FanraAi\remote-touchpad"
pip install -r requirements.txt -q 2>&1 | findstr /V "WARNING"

echo.
echo --- touchpad-dashboard ---
cd /d "C:\Users\ASUS\FanraAi\touchpad-dashboard"
npm install --legacy-peer-deps 2>&1 | findstr /V "npm WARN"

echo.
echo [3/3] Starting all services via PM2...
cd /d "C:\Users\ASUS\FanraAi"
pm2 start ecosystem.config.js

echo.
echo ========================================
echo   Done! Services starting in background.
echo ========================================
echo.
echo Commands:
echo   pm2 status        - Cek status semua
echo   pm2 logs          - Lihat log real-time
echo   pm2 stop all      - Stop semua
echo   pm2 restart all   - Restart semua
echo.
echo Akses:
echo   ruang (builder 3D)        : http://localhost:5173
echo   touchpad server (WS/REST) : http://localhost:8000
echo   touchpad dashboard        : http://localhost:3000
echo.
pause