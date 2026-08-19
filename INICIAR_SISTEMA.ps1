# ================================================
# JEJ - BODEGA INTERNACIONAL PEDERNALES
# ================================================
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

Write-Host ""
Write-Host "JEJ - Bodega Internacional Pedernales" -ForegroundColor Cyan
Write-Host ""

# Backend
Write-Host "Iniciando Backend (puerto 3007)..." -ForegroundColor Yellow
$backend = Start-Process -FilePath "node" -ArgumentList "--experimental-sqlite", "src/server.js" `
  -WorkingDirectory "$PSScriptRoot\backend" `
  -PassThru -WindowStyle Minimized
Write-Host "  Backend PID: $($backend.Id)" -ForegroundColor Green

Start-Sleep -Seconds 3

# Frontend
Write-Host "Iniciando Frontend (puerto 5210)..." -ForegroundColor Yellow
$frontend = Start-Process -FilePath "npx" -ArgumentList "vite" `
  -WorkingDirectory "$PSScriptRoot\frontend" `
  -PassThru -WindowStyle Minimized
Write-Host "  Frontend PID: $($frontend.Id)" -ForegroundColor Green

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "Abriendo navegador..." -ForegroundColor Yellow
Start-Process "http://localhost:5210"
