$ErrorActionPreference = "Continue"
$BaseUrl = if ($env:LEITURAVERSO_WORKER_URL) { $env:LEITURAVERSO_WORKER_URL.TrimEnd("/") } else { "http://127.0.0.1:3030" }
$Delay = if ($env:LEITURAVERSO_WORKER_DELAY_SECONDS) { [Math]::Max(2,[int]$env:LEITURAVERSO_WORKER_DELAY_SECONDS) } else { 5 }
$HostProcess = $null

function Test-WorkerHost {
  try {
    Invoke-WebRequest -Uri ($BaseUrl + "/api/cron/book-analysis?limit=1") -Method Get -TimeoutSec 5 -UseBasicParsing | Out-Null
    return $true
  } catch {
    return $false
  }
}

Write-Host ""
Write-Host "LeituraVerso Worker" -ForegroundColor Magenta
Write-Host "O processamento fica neste PC e o servidor local escuta SOMENTE em 127.0.0.1." -ForegroundColor Cyan
Write-Host "Nenhuma porta precisa ser aberta no roteador e o computador nao fica publico." -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path ".next/BUILD_ID")) {
  Write-Host "Preparando a versao local do LeituraVerso..." -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Falha ao preparar o projeto. Corrija o erro acima e tente novamente." -ForegroundColor Red
    exit 1
  }
}

if (-not (Test-WorkerHost)) {
  Write-Host "Iniciando servidor privado em 127.0.0.1:3030..." -ForegroundColor Cyan
  $HostProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run start:worker-host" -PassThru -WindowStyle Hidden
  $ready=$false
  for($i=0;$i -lt 30;$i++){
    Start-Sleep -Seconds 2
    if(Test-WorkerHost){$ready=$true;break}
  }
  if(-not $ready){
    Write-Host "O servidor local nao iniciou. Confira o arquivo .env.local e tente novamente." -ForegroundColor Red
    if($HostProcess -and -not $HostProcess.HasExited){Stop-Process -Id $HostProcess.Id -Force}
    exit 1
  }
}

Write-Host "Worker ONLINE. Pressione Ctrl+C para parar." -ForegroundColor Green
Write-Host ""

function Run-Step([string]$Path,[string]$Label){
  try {
    $result = Invoke-RestMethod -Uri ($BaseUrl + $Path) -Method Get -TimeoutSec 1800
    $count = if ($null -ne $result.processed) { [int]$result.processed } else { 0 }
    if ($count -gt 0) {
      Write-Host ("[{0}] {1}: {2} item(ns)" -f (Get-Date -Format "HH:mm:ss"),$Label,$count) -ForegroundColor Green
    }
    return $count
  } catch {
    Write-Host ("[{0}] {1}: {2}" -f (Get-Date -Format "HH:mm:ss"),$Label,$_.Exception.Message) -ForegroundColor Yellow
    return 0
  }
}

try {
  while ($true) {
    $didWork = 0
    $didWork += Run-Step "/api/cron/book-analysis?limit=1" "Leitura central"
    $didWork += Run-Step "/api/cron/book-reading?limit=1" "Leitura legada"
    $didWork += Run-Step "/api/cron/book-field-review?limit=6" "Aplicacao das 6 revisoes"

    if ($didWork -eq 0) { Start-Sleep -Seconds $Delay }
    else { Start-Sleep -Milliseconds 750 }
  }
} finally {
  if($HostProcess -and -not $HostProcess.HasExited){
    Stop-Process -Id $HostProcess.Id -Force
  }
}
