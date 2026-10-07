# Packs a folder of example pictures into one script file, examples/<name>.js, so the page can use them
# even when it is opened straight from a folder (browsers won't let a page read other files then,
# but they do load scripts). The examples ask for a picture by its path (like "examples/flags/gb.svg")
# and find it in window.TM_IMAGES.
#
# Run from the site's folder:   .\tools\make-example-images.ps1 flags
param([Parameter(Mandatory = $true)][string]$Name)
$site = Split-Path -Parent $PSScriptRoot
$folder = Join-Path $site "examples\$Name"
$types = @{ '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp' }
$lines = @(('// Made by tools/make-example-images.ps1: the pictures in examples/' + $Name + '/, as data addresses'), 'window.TM_IMAGES = window.TM_IMAGES || {};')
foreach ($file in Get-ChildItem $folder -File | Sort-Object Name) {
  $type = $types[$file.Extension.ToLower()]
  if (-not $type) { continue }
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
  $lines += "window.TM_IMAGES['examples/$Name/$($file.Name)'] = 'data:$type;base64,$b64';"
}
$out = Join-Path $site "examples\$Name.js"
[IO.File]::WriteAllText($out, ($lines -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
"{0}: {1} pictures, {2:N0} bytes" -f $out, ($lines.Count - 2), (Get-Item $out).Length
