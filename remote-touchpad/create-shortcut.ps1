$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Remote Touchpad.lnk")
$Shortcut.TargetPath = "C:\Users\ASUS\remote-touchpad\start-server.bat"
$Shortcut.WorkingDirectory = "C:\Users\ASUS\remote-touchpad"
$Shortcut.Save()