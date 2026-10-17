# Generates Android launcher icons and splash screens from public/assets/icon-512.png.
# Run on Windows:  powershell -File scripts/android/icons.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$src = Join-Path $root "public/assets/icon-512.png"
$res = Join-Path $root "android/app/src/main/res"

$image = [System.Drawing.Image]::FromFile($src)

function Save-Png($img, $size, $path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $size, $size)
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

# Background color sampled from a corner pixel of the icon.
$bitmap = New-Object System.Drawing.Bitmap($src)
$corner = $bitmap.GetPixel(2, 2)
$hex = "#{0:X2}{1:X2}{2:X2}" -f [int]$corner.R, [int]$corner.G, [int]$corner.B
$bitmap.Dispose()
@"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$hex</color>
</resources>
"@ | Out-File -Encoding ascii (Join-Path $res "values/ic_launcher_background.xml")

# Legacy launcher icons (48dp base) and adaptive foreground (108dp base).
$launcher = @{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
$foreground = @{ mdpi = 108; hdpi = 162; xhdpi = 216; xxhdpi = 324; xxxhdpi = 432 }
foreach ($d in $launcher.Keys) {
    $dir = Join-Path $res "mipmap-$d"
    Save-Png $image $launcher[$d] (Join-Path $dir "ic_launcher.png")
    Save-Png $image $launcher[$d] (Join-Path $dir "ic_launcher_round.png")
}
foreach ($d in $foreground.Keys) {
    $dir = Join-Path $res "mipmap-$d"
    Save-Png $image $foreground[$d] (Join-Path $dir "ic_launcher_foreground.png")
}

# Splash: the icon centered on white, portrait and landscape sizes like the Capacitor defaults.
$port = @{ mdpi = @(480, 800); hdpi = @(800, 1280); xhdpi = @(960, 1600); xxhdpi = @(1440, 2560); xxxhdpi = @(1920, 3200) }
function Save-Splash($w, $h, $path) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $icon = [int]([Math]::Min($w, $h) * 0.28)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($image, [int](($w - $icon) / 2), [int](($h - $icon) / 2), $icon, $icon)
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}
foreach ($d in $port.Keys) {
    $w = $port[$d][0]; $h = $port[$d][1]
    Save-Splash $w $h (Join-Path $res "drawable-port-$d/splash.png")
    Save-Splash $h $w (Join-Path $res "drawable-land-$d/splash.png")
}
Save-Splash 1280 1920 (Join-Path $res "drawable/splash.png")

$image.Dispose()
Write-Output "icons + splash written"
