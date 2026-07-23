# Start both dev servers
Write-Host "🚀 Starting Platform dev environment..." -ForegroundColor Cyan

# Kill any existing servers
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = try { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine } catch { "" }
    if ($cmd -match "vite|tsx.*index\.ts") {
        Write-Host "  Killing PID $($_.Id)..." -ForegroundColor Yellow
        Stop-Process -Id $_.Id -Force
    }
}
Start-Sleep -Seconds 1

# Start Express server
Write-Host "  Starting Express server..." -ForegroundColor Green
$expJob = Start-Job -Name "express" -ScriptBlock {
    Set-Location "C:\Users\Usuario\proyects\deposito\apps\platform\server"
    npx tsx src/index.ts
}
Start-Sleep -Seconds 3

# Verify Express
$health = curl.exe -s http://localhost:3000/api/health 2>&1
if ($health) { Write-Host "  ✅ Express running: $health" -ForegroundColor Green }
else { Write-Host "  ❌ Express failed to start" -ForegroundColor Red; exit 1 }

# Start Vite
Write-Host "  Starting Vite..." -ForegroundColor Green
$viteJob = Start-Job -Name "vite" -ScriptBlock {
    Set-Location "C:\Users\Usuario\proyects\deposito\apps\platform\client"
    npx vite --port 5176
}
Start-Sleep -Seconds 3

# Verify Vite
$viteStatus = curl.exe -s -o /dev/null -w "%{http_code}" http://localhost:5176/ 2>&1
if ($viteStatus -eq "200") { Write-Host "  ✅ Vite running (port 5176)" -ForegroundColor Green }
else { Write-Host "  ❌ Vite failed to start" -ForegroundColor Red }

Write-Host "`n✅ Dev environment ready!" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:5176" -ForegroundColor Cyan
Write-Host "  API:      http://localhost:3000" -ForegroundColor Cyan
Write-Host "`n📧 Login: admin@example.com / una-contrasena-segura" -ForegroundColor Yellow
