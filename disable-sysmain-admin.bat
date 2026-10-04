@echo off
:: FanraAi - Matikan SysMain (Superfetch) untuk bebaskan RAM
:: Klik kanan file ini > "Run as administrator" lalu tekan sembarang tombol
:: Hanya perlu 1x, setelah itu permanen.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [!] File ini harus dijalankan sebagai Administrator.
    echo      Klik kanan file ini ^> pilih "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo.
echo  [FanraAi] Mematikan SysMain (Superfetch)...
sc stop SysMain >nul 2>&1
sc config SysMain start= disabled >nul 2>&1

echo  [FanraAi] Mematikan Windows Search indexing berat...
sc stop WSearch >nul 2>&1
sc config WSearch start= disabled >nul 2>&1

echo.
echo  Selesai. RAM akan terasa lebih lega setelah restart.
echo  Layanan yang dimatikan TIDAK mempengaruhi aplikasi kamu (Brave, Hermes, FanraAi).
echo.
pause
