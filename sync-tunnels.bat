@echo off
chcp 65001 >nul
REM FanraAi - Sync tunnel URLs ke GitHub (portal baca dari sini)
REM Dipanggil setelah start-tunnels.bat

setlocal enabledelayedexpansion
set LOGS=C:\Users\ASUS\FanraAi\logs
set OUT=C:\Users\ASUS\FanraAi\public-tunnels.json

rem Tunggu tunnel dapat URL
timeout /t 15 /nobreak >nul

:WAIT_LOOP
set FOUND=0
for %%S in (ruang touchpad dashboard) do (
  for /f "tokens=*" %%U in ('grep -a -oE "https://[a-z0-9-]+\.trycloudflare\.com" "%LOGS%\cloudflared-%%S.log" 2^>nul ^| tail -n 1') do (
    set URL_%%S=%%U
    set FOUND=1
  )
)
if "%FOUND%"=="0" (
  timeout /t 5 /nobreak >nul
  goto WAIT_LOOP
)

(
  echo {
  echo   "ruang": "!URL_ruang!",
  echo   "touchpad": "!URL_touchpad!",
  echo   "dashboard": "!URL_dashboard!",
  echo   "updated": "%DATE% %TIME%"
  echo }
) > "%OUT%"

echo Tunnel URLs synced ke %OUT%
type "%OUT%"
