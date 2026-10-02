@echo off
chcp 65001 >nul
title FanraAi Services - STATUS
cd /d "C:\Users\ASUS\FanraAi"

echo ========================================
echo   FanraAi - Service Status
echo ========================================
echo.

pm2 status

echo.
echo ========================================
echo   Ports in use:
echo ========================================
netstat -ano | findstr "5173 8000 3000"

echo.
echo ========================================
echo   Logs location: C:\Users\ASUS\FanraAi\logs\
echo ========================================
pause