Param(
  [int]$Port = 0
)

$ErrorActionPreference = "Stop"

function Test-LocalUrl {
  param([int]$CheckPort)
  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$CheckPort" -TimeoutSec 4
    return ($res.StatusCode -ge 200 -and $res.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Resolve-CloudflaredPath {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }

  $wingetPath = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path $wingetPath) {
    $found = Get-ChildItem $wingetPath -Recurse -Filter "cloudflared.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
      return $found.FullName
    }
  }

  return $null
}

$selectedPort = $Port
if ($selectedPort -le 0) {
  if (Test-LocalUrl -CheckPort 3000) {
    $selectedPort = 3000
  } elseif (Test-LocalUrl -CheckPort 3001) {
    $selectedPort = 3001
  }
}

if ($selectedPort -le 0) {
  Write-Host "Kunde inte hitta en körande app på port 3000 eller 3001." -ForegroundColor Yellow
  Write-Host "Starta appen först med: npm run dev" -ForegroundColor Yellow
  exit 1
}

$cloudflared = Resolve-CloudflaredPath
if (-not $cloudflared) {
  Write-Host "cloudflared hittades inte." -ForegroundColor Yellow
  Write-Host "Installera med: winget install --id Cloudflare.cloudflared -e" -ForegroundColor Yellow
  exit 1
}

Write-Host "Startar publik tunnel för http://localhost:$selectedPort" -ForegroundColor Cyan
Write-Host "Stoppa med Ctrl+C" -ForegroundColor DarkGray

& $cloudflared tunnel --url "http://localhost:$selectedPort"
