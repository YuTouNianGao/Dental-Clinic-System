$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $PSScriptRoot 'backup'
$target = Join-Path $backupDir 'dental_clinic_db.sql'
$mysqldump = 'D:\DevTools\MySQL\mysql-8.0.44-winx64\bin\mysqldump.exe'

if (-not (Test-Path -LiteralPath $mysqldump -PathType Leaf)) {
    throw "mysqldump not found: $mysqldump"
}

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

& $mysqldump `
    --login-path=dental_clinic_admin `
    --protocol=tcp `
    --default-character-set=utf8mb4 `
    --single-transaction `
    --routines `
    --events `
    --triggers `
    --hex-blob `
    --set-gtid-purged=OFF `
    --databases dental_clinic_db `
    --result-file=$target

if ($LASTEXITCODE -ne 0) {
    throw "mysqldump failed with exit code $LASTEXITCODE"
}

Write-Output ('BACKUP_CREATED=' + $target)
