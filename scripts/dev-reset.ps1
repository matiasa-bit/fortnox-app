$ErrorActionPreference = 'Continue'

Write-Host "[dev:reset] Stänger gamla Next.js-processer..."
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -match 'next\\dist\\server\\lib\\start-server\.js' } |
  ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      Write-Host "[dev:reset] Stoppade PID $($_.ProcessId)"
    } catch {
      Write-Warning "[dev:reset] Kunde inte stoppa PID $($_.ProcessId): $($_.Exception.Message)"
    }
  }

Start-Sleep -Seconds 1

Write-Host "[dev:reset] Tar bort lockfil om den finns..."
Remove-Item -Path ".next/dev/lock" -Force -ErrorAction SilentlyContinue

Write-Host "[dev:reset] Startar dev-server..."
npm run dev
