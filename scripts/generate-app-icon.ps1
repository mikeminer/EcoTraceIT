$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$size = 1200
$outputDirectory = Join-Path $PSScriptRoot "..\public\app-store"
$outputPath = Join-Path $outputDirectory "ecotraceit-app-icon.png"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#123D32"))

$cream = [System.Drawing.ColorTranslator]::FromHtml("#F6F0DF")
$sage = [System.Drawing.ColorTranslator]::FromHtml("#9FC7A4")
$earth = [System.Drawing.ColorTranslator]::FromHtml("#D29A66")
$deepGreen = [System.Drawing.ColorTranslator]::FromHtml("#123D32")

$packagePen = [System.Drawing.Pen]::new($cream, 58)
$packagePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$packagePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$packagePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

# Open parcel outline: the top-right opening becomes the beginning of the leaf loop.
$graphics.DrawLine($packagePen, 300, 440, 600, 275)
$graphics.DrawLine($packagePen, 600, 275, 900, 440)
$graphics.DrawLine($packagePen, 900, 440, 900, 770)
$graphics.DrawLine($packagePen, 900, 770, 600, 935)
$graphics.DrawLine($packagePen, 600, 935, 300, 770)
$graphics.DrawLine($packagePen, 300, 770, 300, 440)
$graphics.DrawLine($packagePen, 300, 440, 600, 610)
$graphics.DrawLine($packagePen, 600, 610, 835, 475)
$graphics.DrawLine($packagePen, 600, 610, 600, 850)

$leafPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
$leafPath.StartFigure()
$leafPath.AddBezier(612, 360, 705, 175, 925, 175, 980, 225)
$leafPath.AddBezier(980, 225, 955, 435, 810, 525, 650, 515)
$leafPath.AddBezier(650, 515, 615, 455, 602, 405, 612, 360)
$leafPath.CloseFigure()
$leafBrush = [System.Drawing.SolidBrush]::new($sage)
$graphics.FillPath($leafBrush, $leafPath)

$leafVeinPen = [System.Drawing.Pen]::new($deepGreen, 34)
$leafVeinPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$leafVeinPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawBezier($leafVeinPen, 645, 470, 745, 365, 845, 300, 935, 245)

$nodeBrush = [System.Drawing.SolidBrush]::new($earth)
$nodeOutline = [System.Drawing.Pen]::new($cream, 18)
foreach ($point in @(@(300, 440), @(600, 610), @(900, 770))) {
  $x = $point[0] - 34
  $y = $point[1] - 34
  $graphics.FillEllipse($nodeBrush, $x, $y, 68, 68)
  $graphics.DrawEllipse($nodeOutline, $x, $y, 68, 68)
}

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$nodeOutline.Dispose()
$nodeBrush.Dispose()
$leafVeinPen.Dispose()
$leafBrush.Dispose()
$leafPath.Dispose()
$packagePen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $outputPath
