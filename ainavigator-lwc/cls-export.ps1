$clsPath = "force-app/main/default/classes"
$exportDir = "cls-export"

# Create output folder if it doesn't exist
New-Item -ItemType Directory -Path $exportDir -Force | Out-Null

Get-ChildItem -Path $clsPath -Filter "*.cls" | ForEach-Object {
    $destFile = Join-Path $exportDir ($_.BaseName + ".txt")
    Copy-Item $_.FullName -Destination $destFile
    Write-Host "Exported: $($_.Name) -> $destFile"
}

Write-Host "`nDone! All .cls files exported to: $exportDir\"