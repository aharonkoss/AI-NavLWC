$lwcPath  = "force-app/main/default/lwc"
$exportDir = "lwc-export"

# Create output folder if it doesn't exist
New-Item -ItemType Directory -Path $exportDir -Force | Out-Null

# Extensions to capture from each LWC component folder
$targetExtensions = @("*.js", "*.html", "*.css")

Get-ChildItem -Path $lwcPath -Directory | ForEach-Object {
    $componentName = $_.Name
    $componentPath = $_.FullName

    foreach ($ext in $targetExtensions) {
        Get-ChildItem -Path $componentPath -Filter $ext | ForEach-Object {
            # Output filename: componentName__fileName.ext.txt
            # e.g., companyDetail__companyDetail.html.txt
            $destFile = Join-Path $exportDir ($componentName + "__" + $_.Name + ".txt")
            Copy-Item $_.FullName -Destination $destFile
            Write-Host "Exported: $($_.FullName) -> $destFile"
        }
    }
}

Write-Host "`nDone! All LWC files exported to: $exportDir\"