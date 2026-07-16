param(
  [Parameter(Mandatory = $true)]
  [string]$TextPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [string]$Voice = "Microsoft Hazel Desktop"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$text = [System.IO.File]::ReadAllText($TextPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($OutputPath)
if ($outputDirectory) {
  [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}

$synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $availableVoices = $synthesizer.GetInstalledVoices() | ForEach-Object {
    $_.VoiceInfo.Name
  }

  if ($availableVoices -contains $Voice) {
    $synthesizer.SelectVoice($Voice)
  } elseif ($availableVoices -contains "Microsoft Zira Desktop") {
    $synthesizer.SelectVoice("Microsoft Zira Desktop")
  }

  $synthesizer.Rate = 0
  $synthesizer.Volume = 92
  $synthesizer.SetOutputToWaveFile($OutputPath)
  $synthesizer.Speak($text)
} finally {
  $synthesizer.Dispose()
}
