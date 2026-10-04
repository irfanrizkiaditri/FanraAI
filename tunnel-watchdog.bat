@echo off
chcp 65001 >nul
REM FanraAi - Tunnel Watchdog
REM Cek tiap tunnel tiap 60 detik. Kalau mati, hidupkan lagi + sync URL ke GitHub.

set CF=C:\Program Files (x86)\cloudflared\cloudflared.exe
set LOGS=C:\Users\ASUS\FanraAi\logs
set REPO=C:\Users\ASUS\FanraAi

:LOOP

for %%S in (ruang touchpad dashboard llm) do call :CHECK %%S

call :SYNC
timeout /t 60 /nobreak >nul
goto LOOP

:CHECK
set SVC=%1
set PORT=3001
if "%SVC%"=="touchpad" set PORT=8000
if "%SVC%"=="dashboard" set PORT=3001
if "%SVC%"=="llm" set PORT=20128

rem Cek tunnel masih ada
curl -s -o nul -m 8 "https://TUNNELCHECK" 2>nul

rem Cek log punya URL valid & tunnel masih terdaftar
for /f "tokens=*" %%U in ('grep -a -oE "https://[a-z0-9-]+\.trycloudflare\.com" "%LOGS%\cloudflared-%SVC%.log" 2^>nul ^| tail -n 1') do set URL=%%U

if not defined URL (
  echo [%TIME%] %SVC%: tunnel mati, mulai ulang...
  start "" /min "%CF%" tunnel --url http://localhost:%PORT% > "%LOGS%\cloudflared-%SVC%.log" 2>&1
  timeout /t 20 /nobreak >nul
) else (
  rem Cek log terakhir ada error "not found"
  tail -n 5 "%LOGS%\cloudflared-%SVC%.log" 2>nul | grep -a -q "not found" && (
    echo [%TIME%] %SVC%: tunnel expired, mulai ulang...
    taskkill /f /im cloudflared.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
    start "" /min "%CF%" tunnel --url http://localhost:%PORT% > "%LOGS%\cloudflared-%SVC%.log" 2>&1
    timeout /t 20 /nobreak >nul
  )
)
set URL=
exit /b

:SYNC
rem Tulis URL terbaru ke public-tunnels.json lalu commit ke GitHub
setlocal enabledelayedexpansion
set OUT=%REPO%\public-tunnels.json
set R1=
set R2=
set R3=
for /f "tokens=*" %%U in ('grep -a -oE "https://[a-z0-9-]+\.trycloudflare\.com" "%LOGS%\cloudflared-ruang.log" 2^>nul ^| tail -n 1') do set R1=%%U
for /f "tokens=*" %%U in ('grep -a -oE "https://[a-z0-9-]+\.trycloudflare\.com" "%LOGS%\cloudflared-touchpad.log" 2^>nul ^| tail -n 1') do set R2=%%U
for /f "tokens=*" %%U in ('grep -a -oE "https://[a-z0-9-]+\.trycloudflare\.com" "%LOGS%\cloudflared-dashboard.log" 2^>nul ^| tail -n 1') do set R3=%%U
for /f "tokens=*" %%U in ('grep -a -oE "https://[a-z0-9-]+\.trycloudflare\.com" "%LOGS%\cloudflared-llm.log" 2^>nul ^| tail -n 1') do set R4=%%U

(
  echo {
  echo   "ruang": "!R1!",
  echo   "touchpad": "!R2!",
  echo   "dashboard": "!R3!",
  echo   "llm": "!R4!",
  echo   "updated": "%DATE% %TIME%"
  echo }
) > "%OUT%"

cd /d "%REPO%"
git add public-tunnels.json >nul 2>&1
git commit -m "chore: sync tunnel URLs [auto]" >nul 2>&1
git push origin main >nul 2>&1
endlocal
exit /b
