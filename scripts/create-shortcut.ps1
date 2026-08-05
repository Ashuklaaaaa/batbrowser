# ═══════════════════════════════════════════════════════════════
# BatBrowser — Desktop Shortcut Creator
# Automatically creates a shortcut on the User's Desktop
# ═══════════════════════════════════════════════════════════════

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DesktopPath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), "BatBrowser.lnk")
$TargetFile  = Join-Path $ProjectRoot "Start-BatBrowser.bat"

$IconPath = Join-Path $ProjectRoot "assets\icon.ico"

Write-Host "Creating BatBrowser Desktop Shortcut at $DesktopPath..." -ForegroundColor Cyan

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($DesktopPath)
$Shortcut.TargetPath = $TargetFile
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "Launch BatBrowser X"
$Shortcut.IconLocation = $IconPath
$Shortcut.Save()

# Create a local shortcut inside the project directory too
$LocalShortcutPath = Join-Path $ProjectRoot "Start-BatBrowser.lnk"
$LocalShortcut = $WshShell.CreateShortcut($LocalShortcutPath)
$LocalShortcut.TargetPath = $TargetFile
$LocalShortcut.WorkingDirectory = $ProjectRoot
$LocalShortcut.Description = "Launch BatBrowser X"
$LocalShortcut.IconLocation = $IconPath
$LocalShortcut.Save()

Write-Host "Desktop Shortcut successfully created!" -ForegroundColor Green
