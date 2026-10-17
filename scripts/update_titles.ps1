$dot = [char]0x00B7
$target = "$dot Quikro{% endblock %}"
$replacement = "$dot Quikro Automation{% endblock %}"

$count = 0
Get-ChildItem -Path "templates" -Recurse -File | Where-Object { $_.Extension.ToLower() -in @(".html", ".txt") } | ForEach-Object {
    $c = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    if ($c.Contains($target)) {
        $c = $c.Replace($target, $replacement)
        [System.IO.File]::WriteAllText($_.FullName, $c, [System.Text.Encoding]::UTF8)
        $count++
    }
}

Write-Host "Successfully updated $count files with 'Quikro Automation'."
