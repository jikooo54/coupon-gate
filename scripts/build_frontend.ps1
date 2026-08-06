$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location (Join-Path $RepoRoot "frontend")

if (Test-Path "package-lock.json") { npm ci } else { npm install }
npm run build
