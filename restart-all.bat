@echo off
chcp 65001 >nul
title FanraAi Services - RESTART ALL
cd /d "C:\Users\ASUS\FanraAi"

echo ========================================
echo   FanraAi - Restarting All Services
echo ========================================
echo.

pm2 restart all

echo.
echo ========================================
echo   All services restarted.
echo ========================================
pause