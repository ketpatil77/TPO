@echo off
setlocal EnableExtensions
title TPO Portal Startup Check

cd /d "%~dp0"
echo.
echo [TPO] Startup checks

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Repair Node.js installation, then run this file again.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json missing. Keep start.bat inside TPO project root.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] .env missing.
  echo Copy .env.example to .env and configure JWT_SECRET before starting.
  pause
  exit /b 1
)

node -e "require('dotenv').config(); const s=process.env.JWT_SECRET||''; if(s.length<32){console.error('[ERROR] JWT_SECRET must contain at least 32 characters.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [TPO] Installing locked dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [TPO] Running security and automated checks...
call npm.cmd run check
if errorlevel 1 (
  echo [ERROR] Checks failed. Server not started.
  pause
  exit /b 1
)

node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
if not errorlevel 1 (
  echo [TPO] Portal already running.
  start "" "http://localhost:3000/login"
  exit /b 0
)

echo [TPO] Starting server in separate window...
start "TPO Portal Server" /D "%~dp0" cmd.exe /k "npm.cmd start"

echo [TPO] Waiting for health endpoint...
powershell.exe -NoProfile -Command "$ready=$false; for($i=0;$i -lt 20;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 2;if($r.StatusCode -eq 200){$ready=$true;break}}catch{};Start-Sleep -Seconds 1};if($ready){exit 0}else{exit 1}"
if errorlevel 1 (
  echo [ERROR] Server did not become healthy within 20 seconds.
  echo Check TPO Portal Server window for exact error.
  pause
  exit /b 1
)

echo [TPO] Healthy. Opening student login...
start "" "http://localhost:3000/login"
echo [TPO] Admin login: http://localhost:3000/admin/login
exit /b 0
