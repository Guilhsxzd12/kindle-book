$ErrorActionPreference = "Continue"
$BaseUrl = if ($env:LEITURAVERSO_WORKER_URL) { $env:LEITURAVERSO_WORKER_URL.TrimEnd("/") } else { "http://127.0.0.1:3030" }
$Delay = if ($env:LEITURAVERSO_WORKER_DELAY_SECONDS) { [Math]::Max(2,[int]$env:LEITURAVERSO_WORKER_DELAY_SECONDS) } else { 5 }

Write-Host ""
Write-Host "LeituraVerso Worker" -ForegroundColor Magenta
Write-Host "Processamento local: $BaseUrl" -ForegroundColor Cyan
Write-Host "O servidor deve estar preso a 127.0.0.1; nenhuma porta precisa ser aberta no roteador." -ForegroundColor DarkGray
Write-Host "Pressione Ctrl+C para parar." -ForegroundColor DarkGray
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

while ($true) {
  $didWork = 0
  $didWork += Run-Step "/api/cron/book-analysis?limit=1" "Leitura central"
  $didWork += Run-Step "/api/cron/book-reading?limit=1" "Leitura legada"
  $didWork += Run-Step "/api/cron/book-field-review?limit=6" "Aplicacao das 6 revisoes"

  if ($didWork -eq 0) {
    Start-Sleep -Seconds $Delay
  } else {
    Start-Sleep -Milliseconds 750
  }
}
