$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ElectronBinPath = Join-Path $ProjectRoot "electron-bin"
$ElectronExePath = Join-Path $ElectronBinPath "electron.exe"

if (Test-Path $ElectronExePath) {
    # Already downloaded
    exit 0
}

Write-Host "`n[BatBrowser X] First-time setup: Downloading required runtime (Electron)..." -ForegroundColor Cyan
Write-Host "This will only happen once and takes about 1-2 minutes depending on your internet speed.`n" -ForegroundColor Yellow

$ElectronVer = "v31.0.0"
$ZipUrl = "https://github.com/electron/electron/releases/download/$ElectronVer/electron-$ElectronVer-win32-x64.zip"
$ZipPath = Join-Path $env:TEMP "electron-batbrowser.zip"

try {
    Write-Host "Downloading Electron runtime from GitHub... ($ElectronVer)" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath
    
    if (-not (Test-Path $ElectronBinPath)) {
        New-Item -ItemType Directory -Path $ElectronBinPath | Out-Null
    }
    
    Write-Host "Extracting files..." -ForegroundColor Cyan
    Expand-Archive -Path $ZipPath -DestinationPath $ElectronBinPath -Force
    
    Write-Host "Cleaning up temporary files..." -ForegroundColor Cyan
    Remove-Item $ZipPath -Force
    
    Write-Host "`nSetup complete! BatBrowser is ready to launch.`n" -ForegroundColor Green
} catch {
    Write-Host "`n[Error] Failed to download or extract Electron runtime." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Please check your internet connection and try again.`n" -ForegroundColor Yellow
    exit 1
}
