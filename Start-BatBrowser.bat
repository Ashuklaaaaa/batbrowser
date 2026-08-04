@echo off
title BatBrowser X Launcher
cd /d "%~dp0"

:: Auto-create desktop shortcut if missing
if not exist "%USERPROFILE%\Desktop\BatBrowser.lnk" (
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\create-shortcut.ps1" >nul 2>&1
)

:: Launch BatBrowser
start "" "%~dp0electron-bin\electron.exe" "%~dp0."
