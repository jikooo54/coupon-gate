$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "validate_contract.ps1")
& (Join-Path $PSScriptRoot "build_frontend.ps1")
