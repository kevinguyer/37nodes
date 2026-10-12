$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Read-Utf8($path) { [System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false)) }
function Write-Utf8($path, $text) { [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false)) }

# build number: a counter bumped on every build, shown in the app's menu
$buildFile = "$root\build-number.txt"
$build = 0
if (Test-Path $buildFile) { [void][int]::TryParse((Read-Utf8 $buildFile).Trim(), [ref]$build) }
$build++
Write-Utf8 $buildFile "$build"
$built = (Get-Date).ToString('yyyy-MM-dd')

$shell = Read-Utf8 "$root\src\shell.html"
$css   = Read-Utf8 "$root\src\app.css"
$js    = (Get-ChildItem "$root\src\js\*.js" | Sort-Object Name | ForEach-Object { Read-Utf8 $_.FullName }) -join "`n"

# Help Center content: src/help/NN-slug.md are the topic pages (filename order is
# nav order; the slug after the number is the topic id), whatsnew.md is the
# release list. Bundled as one JS object literal at /*__HELP__*/ in 18-help.js.
function Js-Str($t) {
  '"' + $t.Replace('\', '\').Replace('"', '\"').Replace("`r", '').Replace("`n", '\n').Replace('<', '\x3c') + '"'
}
$topics = Get-ChildItem "$root\src\help\[0-9]*.md" | Sort-Object Name | ForEach-Object {
  $id = ($_.BaseName -replace '^\d+-', '')
  '{id:' + (Js-Str $id) + ',md:' + (Js-Str (Read-Utf8 $_.FullName)) + '}'
}
$newsFile = "$root\src\help\whatsnew.md"
$news = if (Test-Path $newsFile) { Read-Utf8 $newsFile } else { '' }
$helpData = '{topics:[' + ($topics -join ',') + '],news:' + (Js-Str $news) + '}'
$js = $js.Replace('/*__HELP__*/', $helpData + ',')

$out = $shell.Replace('/*__CSS__*/', $css).Replace('/*__JS__*/', $js).
  Replace('__BUILD__', "$build").Replace('__BUILT__', $built)

# 37nodes.html is the shippable file; index.html is the same build under the
# name a web host serves by default
foreach ($name in '37nodes.html', 'index.html') { Write-Utf8 "$root\$name" $out }
Write-Host ("build {0} ({1}) - 37nodes.html + index.html written: {2:N0} bytes" -f `
  $build, $built, (Get-Item "$root\37nodes.html").Length)
