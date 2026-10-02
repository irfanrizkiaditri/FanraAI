@echo off
chcp 65001 >nul
title FanraAi Services - STOP ALL
cd /d "C:\Users\ASUS\FanraAi"

echo ========================================
echo   FanraAi - Stopping All Services
echo ========================================
echo.

pm2 stop all
pm2 delete all

echo.
echo ========================================
echo   All services stopped.
echo ========================================
pause