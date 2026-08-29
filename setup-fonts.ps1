# setup-fonts.ps1
# Auto-heberge Barlow, Montserrat et VT323 dans public/assets/fonts/.
# Poppins est volontairement absente : elle n'est utilisee nulle part.
# A lancer depuis la racine du projet pixonaute.

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$out = Join-Path $root 'pixovery-app\public\assets\fonts'

if (-not (Test-Path (Join-Path $root 'pixovery-app'))) {
  throw "Lance ce script depuis la racine du projet (le dossier qui contient pixovery-app)."
}
New-Item -ItemType Directory -Force -Path $out | Out-Null

# User-agent Chrome obligatoire : sans lui, Google renvoie du TTF au lieu du WOFF2.
$ua  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
$url = 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Montserrat:wght@800;900&family=VT323&display=swap'

Write-Host "Recuperation de la feuille de style Google..." -ForegroundColor Cyan
$css = (Invoke-WebRequest -Uri $url -UserAgent $ua -UseBasicParsing).Content

# On ne garde que latin et latin-ext. Les autres jeux (cyrillique, vietnamien,
# grec) ne servent a rien ici. latin-ext ne se telecharge chez le visiteur que
# si un caractere de cette plage apparait : il ne coute rien au chargement.
$keep = @('latin', 'latin-ext')

$blocks = [regex]::Matches($css, '/\*\s*([a-z0-9\-]+)\s*\*/\s*@font-face\s*\{(.*?)\}', 'Singleline')
if ($blocks.Count -eq 0) { throw "Aucun @font-face trouve. Google a peut-etre change son format." }

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("/* Polices auto-hebergees. Genere par setup-fonts.ps1. */")
[void]$sb.AppendLine("/* Ne pas editer a la main : relancer le script. */")
[void]$sb.AppendLine("")

$n = 0
foreach ($b in $blocks) {
  $subset = $b.Groups[1].Value
  if ($keep -notcontains $subset) { continue }

  $body   = $b.Groups[2].Value
  $family = ([regex]::Match($body, "font-family:\s*'([^']+)'")).Groups[1].Value
  $weight = ([regex]::Match($body, 'font-weight:\s*(\d+)')).Groups[1].Value
  $src    = ([regex]::Match($body, 'url\((https://[^)]+\.woff2)\)')).Groups[1].Value
  if (-not $src) { continue }
  if (-not $weight) { $weight = '400' }

  $slug = ($family.ToLower() -replace '[^a-z0-9]', '')
  $name = if ($subset -eq 'latin-ext') { "$slug-$weight-ext.woff2" } else { "$slug-$weight.woff2" }

  Invoke-WebRequest -Uri $src -OutFile (Join-Path $out $name) -UseBasicParsing
  $kb = [math]::Round((Get-Item (Join-Path $out $name)).Length / 1KB)
  Write-Host ("  {0,-28} {1,4} Ko" -f $name, $kb) -ForegroundColor Green

  $newBody = $body -replace [regex]::Escape($src), "/assets/fonts/$name"
  [void]$sb.AppendLine("/* $family $weight - $subset */")
  [void]$sb.AppendLine("@font-face {$newBody}")
  $n++
}

$cssPath = Join-Path $out 'google-fonts.css'
[System.IO.File]::WriteAllText($cssPath, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "$n fichiers telecharges dans pixovery-app\public\assets\fonts\" -ForegroundColor Cyan
Write-Host "CSS ecrit : $cssPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "ETAPE SUIVANTE - dans pixovery-app\index.html, remplacer les 3 lignes :" -ForegroundColor Yellow
Write-Host '  <link rel="preconnect" href="https://fonts.googleapis.com">'
Write-Host '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
Write-Host '  <link href="https://fonts.googleapis.com/css2?family=Barlow..." rel="stylesheet">'
Write-Host "par cette seule ligne :" -ForegroundColor Yellow
Write-Host '  <link rel="stylesheet" href="/assets/fonts/google-fonts.css">'
