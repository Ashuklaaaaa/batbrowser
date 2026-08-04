@echo off
title BatBrowser X Launcher
cd /d "%~dp0"

:: Ensure electron runtime exists, download if missing
if not exist "%~dp0electron-bin\electron.exe" (
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\download-electron.ps1"
)

:: Auto-create or update desktop shortcut
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\create-shortcut.ps1" >nul 2>&1


:: Launch BatBrowser
start "" "%~dp0electron-bin\electron.exe" "%~dp0."
