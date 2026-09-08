$ErrorActionPreference = "Stop"
$Version = "4.10.38"
$Base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/$Version"
$Dest = Join-Path $PSScriptRoot "vendor/pdfjs"

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Invoke-WebRequest "$Base/pdf.min.mjs" -OutFile (Join-Path $Dest "pdf.min.mjs")
Invoke-WebRequest "$Base/pdf.worker.min.mjs" -OutFile (Join-Path $Dest "pdf.worker.min.mjs")

Write-Host "PDF.js $Version a fost salvat local în vendor/pdfjs." -ForegroundColor Green
