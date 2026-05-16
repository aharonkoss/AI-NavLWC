# merge-txt-files.ps1
# Place this ps1 in the SAME folder as all your .txt files and run it

$sourceDir  = "."
$outputFile = ".\lwc-combined.txt"

# Clear/create the output file
New-Item -Path $outputFile -ItemType File -Force | Out-Null

# Loop through every .txt file in the folder (excluding the output file itself)
Get-ChildItem -Path $sourceDir -Filter "*.txt" | 
    Where-Object { $_.Name -ne "combined.txt" } |
    Sort-Object Name | ForEach-Object {

    $fileName = $_.Name

    Add-Content -Path $outputFile -Value ""
    Add-Content -Path $outputFile -Value "================================================================"
    Add-Content -Path $outputFile -Value "{ $fileName } :"
    Add-Content -Path $outputFile -Value "================================================================"

    $content = Get-Content $_.FullName -Raw
    Add-Content -Path $outputFile -Value $content

    Write-Host "Merged: $fileName"
}

Write-Host "`nDone! Combined file saved to: combined.txt"