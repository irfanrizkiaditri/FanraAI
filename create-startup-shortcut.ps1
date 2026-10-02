$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\FanraAi Auto Start.lnk")
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = "/c C:\Users\ASUS\FanraAi\auto-start.bat"
$Shortcut.WorkingDirectory = "C:\Users\ASUS\FanraAi"
$Shortcut.Description = "Auto-start FanraAi services (ruang, touchpad, dashboard) on Windows boot"
$Shortcut.IconLocation = "C:\Windows\System32\cmd.exe,0"
$Shortcut.Save()
Write-Host "Shortcut created at: $env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\FanraAi Auto Start.lnk"