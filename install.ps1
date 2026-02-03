$ErrorActionPreference = "Stop"

$repository = "nesvet/flatr"
$version = $env:FLATR_VERSION
if (-not $version) {
	$version = "latest"
}

$installDirectory = $env:INSTALL_DIR
if (-not $installDirectory) {
	$installDirectory = Join-Path $env:LOCALAPPDATA "flatr\\bin"
}

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
switch ($architecture) {
	"x64" { $asset = "flatr-windows-x64.zip" }
	"arm64" { $asset = "flatr-windows-arm64.zip" }
	default {
		Write-Output "Unsupported architecture: $architecture"
		exit 1
	}
}

if ($version -eq "latest") {
	$baseUrl = "https://github.com/$repository/releases/latest/download"
} else {
	$releaseTag = $version
	$baseUrl = "https://github.com/$repository/releases/download/$releaseTag"
}

$temporaryDirectory = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("flatr-" + [Guid]::NewGuid().ToString("n")))
try {
	$archivePath = Join-Path $temporaryDirectory $asset
	$checksumPath = "$archivePath.sha256"

	Invoke-WebRequest -Uri "$baseUrl/$asset" -OutFile $archivePath
	Invoke-WebRequest -Uri "$baseUrl/$asset.sha256" -OutFile $checksumPath

	$expectedHash = (Get-Content $checksumPath).Split(" ")[0].ToLowerInvariant()
	$actualHash = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
	if ($expectedHash -ne $actualHash) {
		Write-Output "Checksum mismatch. Aborting."
		exit 1
	}

	Expand-Archive -Path $archivePath -DestinationPath $temporaryDirectory -Force
	$binaryPath = Join-Path $temporaryDirectory "flatr.exe"
	if (-not (Test-Path $binaryPath)) {
		Write-Output "Binary not found in archive."
		exit 1
	}

	New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
	$destinationPath = Join-Path $installDirectory "flatr.exe"
	Move-Item -Path $binaryPath -Destination $destinationPath -Force

	Write-Output "Installed flatr to $destinationPath"

	if (Get-Command flatr -ErrorAction SilentlyContinue) {
		Write-Output "Run: flatr --help"
	} else {
		Write-Output "Add $installDirectory to your PATH to use flatr."
	}
} finally {
	Remove-Item -Path $temporaryDirectory -Recurse -Force
}
