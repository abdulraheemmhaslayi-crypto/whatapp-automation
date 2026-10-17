$targetDirs = @("templates", "apps", "config", "flow-templates")
$extensions = @("*.html", "*.txt", "*.py", "*.json", "*.md")

$count = 0
foreach ($dir in $targetDirs) {
    if (Test-Path $dir) {
        $files = Get-ChildItem -Path $dir -Recurse -File | Where-Object {
            $ext = $_.Extension.ToLower()
            $ext -in @(".html", ".txt", ".py", ".json", ".md")
        }
        foreach ($file in $files) {
            $path = $file.FullName
            $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
            $new = $raw
            
            # Brand replacements
            $new = $new.Replace("BrightBean Chat", "Quikro")
            $new = $new.Replace("brightbean-chat", "quikro")
            
            # Replace in title/display if appropriate
            if ($path -like "*templates*") {
                $new = $new.Replace("BrightBean", "Quikro")
            }

            if ($raw -cne $new) {
                [System.IO.File]::WriteAllText($path, $new, [System.Text.Encoding]::UTF8)
                $count++
            }
        }
    }
}

# Also update README.md if present
if (Test-Path "README.md") {
    $raw = [System.IO.File]::ReadAllText("README.md", [System.Text.Encoding]::UTF8)
    $new = $raw.Replace("BrightBean Chat", "Quikro").Replace("brightbean-chat", "quikro")
    if ($raw -cne $new) {
        [System.IO.File]::WriteAllText("README.md", $new, [System.Text.Encoding]::UTF8)
        $count++
    }
}

Write-Host "Successfully updated $count files with Quikro branding."
