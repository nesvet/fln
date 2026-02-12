$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repository = "nesvet/fln"
$version = $env:FLN_VERSION
if (-not $version) {
	$version = "latest"
}

$installDirectory = $env:INSTALL_DIR
if (-not $installDirectory) {
	$installDirectory = Join-Path $env:LOCALAPPDATA "fln\bin"
}

$maxAssetSizeBytes = 100MB
$maxChecksumSizeBytes = 8KB

$ansiReset = [char]27 + "[0m"
$ansiGreen = [char]27 + "[32m"
$ansiGreenBold = [char]27 + "[1;32m"
$ansiBold = [char]27 + "[1m"

function Write-FlnMessage {
	param(
		[string]$Prefix,
		[string]$Message,
		[string]$Color = "White"
	)

	if ($env:FLN_SILENT -eq "1") {
		Write-Output $Message
		return
	}

	if ($Prefix) {
		Write-Host $Prefix -ForegroundColor $Color -NoNewline
		Write-Host " $Message"
	} else {
		Write-Host $Message -ForegroundColor $Color
	}
}

function Write-FlnInfo {
	param([string]$Message)
	Write-FlnMessage "ℹ" $Message "Cyan"
}

function Write-FlnSuccess {
	param([string]$Message)
	Write-FlnMessage "✓" $Message "Green"
}

function Write-FlnWarning {
	param([string]$Message)
	Write-FlnMessage "⚠" $Message "Yellow"
}

function Write-FlnError {
	param([string]$Message)
	Write-FlnMessage "✗" $Message "Red"
}

function Stop-FlnInstall {
	param([string]$Message)
	Write-FlnError $Message
	exit 1
}

function Test-FlnVersion {
	param([string]$Value)
	return $Value -match "^(latest|[A-Za-z0-9._-]+)$"
}

function Resolve-FlnInstallDirectory {
	param([string]$Directory)

	if ($Directory -match '[`";|&<>\r\n]') {
		Stop-FlnInstall "Invalid INSTALL_DIR value: contains unsafe characters."
	}

	try {
		$resolved = [System.IO.Path]::GetFullPath($Directory)
		New-Item -ItemType Directory -Path $resolved -Force | Out-Null
		return $resolved
	} catch {
		Stop-FlnInstall "Unable to prepare install directory: $Directory"
	}
}

function Get-FlnLatestVersion {
	param([string]$Repository)
	
	try {
		$response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers @{ "User-Agent" = "fln-installer" } -ErrorAction Stop
		$tagName = "$($response.tag_name)" -replace "^v", ""
		if ([string]::IsNullOrWhiteSpace($tagName)) {
			return "latest"
		}
		if ($tagName -notmatch "^[A-Za-z0-9._-]+$") {
			return "latest"
		}
		return $tagName
	} catch {
		return "latest"
	}
}

function Get-FlnDisplayVersion {
	param(
		[string]$Repository,
		[string]$Version
	)
	
	if ($Version -eq "latest") {
		$actualVersion = Get-FlnLatestVersion -Repository $Repository
		if ($actualVersion -eq "latest") {
			if ($env:FLN_SILENT -ne "1") {
				Write-FlnWarning "Unable to resolve latest version from GitHub API. Continuing with latest channel."
			}
			return "(latest)"
		}
		return $actualVersion
	}

	return $Version
}

function Normalize-FlnPath {
	param([string]$Value)
	return $Value.Trim().TrimEnd("\").ToLowerInvariant()
}

function Test-FlnPathContains {
	param([string]$Directory)

	$normalizedDirectory = Normalize-FlnPath -Value $Directory
	$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
	$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
	$combinedPath = ($userPath, $machinePath) -join ";"

	$pathItems = $combinedPath.Split(";") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
	foreach ($pathItem in $pathItems) {
		if ((Normalize-FlnPath -Value $pathItem) -eq $normalizedDirectory) {
			return $true
		}
	}
	return $false
}

function Show-FlnPathInstructions {
	param([string]$Directory)

	Write-FlnInfo "fln is not in your PATH."
	Write-FlnInfo "Add the install directory to your PATH environment variable."
	Write-Host ""
	Write-Host "To add fln to your user PATH, run in PowerShell:" -ForegroundColor Cyan
	Write-Host ""
	Write-Host "  [Environment]::SetEnvironmentVariable(" -ForegroundColor White
	Write-Host "    ""Path""," -ForegroundColor White
	Write-Host "    [Environment]::GetEnvironmentVariable(""Path"", ""User"") + "";$Directory""," -ForegroundColor White
	Write-Host "    ""User""" -ForegroundColor White
	Write-Host "  )" -ForegroundColor White
	Write-Host ""
	Write-Host "Then restart your terminal." -ForegroundColor Cyan
	Write-Host ""
}

function Test-FlnFileSizeLimit {
	param(
		[string]$Path,
		[long]$MaxBytes,
		[string]$Label = $null
	)

	if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
		$displayLabel = if ($Label) { $Label } else { "Downloaded file" }
		Stop-FlnInstall "$displayLabel is missing after download."
	}

	$fileSize = (Get-Item -LiteralPath $Path).Length
	if ($fileSize -gt $MaxBytes) {
		$displayLabel = if ($Label) { $Label } else { "Downloaded file" }
		Stop-FlnInstall "$displayLabel is too large ($fileSize bytes)."
	}
}

function Invoke-FlnDownloadWithProgress {
	param(
		[string]$Uri,
		[string]$DestinationPath,
		[string]$Label = $null,
		[long]$MaxBytes
	)

	if ($Label) {
		Write-FlnInfo $Label
	}

	try {
		$curlExe = Get-Command curl.exe -ErrorAction SilentlyContinue
		if ($curlExe) {
			& $curlExe.Source "-#SfLo" $DestinationPath $Uri
			if ($LASTEXITCODE -ne 0) {
				throw "curl.exe exited with code $LASTEXITCODE"
			}
		} else {
			throw "curl.exe not found"
		}
	} catch {
		try {
			Invoke-RestMethod -Uri $Uri -OutFile $DestinationPath -ErrorAction Stop
		} catch {
			$displayLabel = if ($Label) { $Label } else { "File" }
			Stop-FlnInstall "Download failed for $displayLabel."
		}
	}
	Test-FlnFileSizeLimit -Path $DestinationPath -MaxBytes $MaxBytes -Label $Label
}

if (-not (Test-FlnVersion -Value $version)) {
	Stop-FlnInstall "Invalid FLN_VERSION value: $version"
}

$installDirectory = Resolve-FlnInstallDirectory -Directory $installDirectory
$displayVersion = Get-FlnDisplayVersion -Repository $repository -Version $version

try {
	$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
} catch {
	$proc = $env:PROCESSOR_ARCHITECTURE
	$architecture = switch ($proc) {
		"AMD64" { "x64" }
		"ARM64" { "arm64" }
		"x86" { if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" } }
		default { "x64" }
	}
}

switch ($architecture) {
	"x64" {
		$asset = "fln-windows-x64.zip"
	}
	"arm64" {
		$asset = "fln-windows-arm64.zip"
	}
	default {
		Stop-FlnInstall "Unsupported architecture: $architecture. Only x64 and arm64 builds are available for Windows."
	}
}

if ($version -eq "latest") {
	$baseUrl = "https://github.com/$repository/releases/latest/download"
} else {
	$releaseTag = $version
	$baseUrl = "https://github.com/$repository/releases/download/$releaseTag"
}

$temporaryDirectory = Join-Path $env:TEMP "fln-$([Guid]::NewGuid().ToString('n'))"
New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null

try {
	$archivePath = Join-Path $temporaryDirectory $asset
	$checksumPath = "$archivePath.sha256"

	Invoke-FlnDownloadWithProgress -Uri "$baseUrl/$asset" -DestinationPath $archivePath -MaxBytes $maxAssetSizeBytes
	
	try {
		Invoke-RestMethod -Uri "$baseUrl/$asset.sha256" -OutFile $checksumPath -ErrorAction Stop
	} catch {
		Stop-FlnInstall "Download failed for checksum file."
	}
	
	Test-FlnFileSizeLimit -Path $checksumPath -MaxBytes $maxChecksumSizeBytes -Label "Checksum file"

	$expectedHash = (Get-Content -LiteralPath $checksumPath -TotalCount 1).Split(" ")[0].Trim().ToLowerInvariant()
	$actualHash = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
	if ($expectedHash -ne $actualHash) {
		Stop-FlnInstall "Checksum mismatch. Expected: $expectedHash, got: $actualHash"
	}

	$previousProgressPreference = $global:ProgressPreference
	try {
		$global:ProgressPreference = "SilentlyContinue"
		Expand-Archive -LiteralPath $archivePath -DestinationPath $temporaryDirectory -Force
		$global:ProgressPreference = $previousProgressPreference
	} catch {
		$global:ProgressPreference = $previousProgressPreference
		Add-Type -AssemblyName "System.IO.Compression.FileSystem"
		[System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $temporaryDirectory)
	}
	
	$binaryPath = Join-Path $temporaryDirectory "fln.exe"
	if (-not (Test-Path $binaryPath)) {
		Stop-FlnInstall "Binary not found in archive."
	}

	New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
	$destinationPath = Join-Path $installDirectory "fln.exe"
	Move-Item -LiteralPath $binaryPath -Destination $destinationPath -Force

	if ($env:FLN_SILENT -eq "1") {
		Write-Output "🥞 fln $displayVersion was installed successfully to $destinationPath"
		Write-Output "Run 'fln --help' to get started"
	} else {
		Write-Host "${ansiGreen}🥞 ${ansiGreenBold}fln${ansiReset}${ansiGreen} $displayVersion was installed successfully to ${ansiBold}$destinationPath${ansiReset}"
		Write-Host "Run 'fln --help' to get started"
	}
	
	if (-not (Get-Command fln -ErrorAction SilentlyContinue)) {
		if (Test-FlnPathContains -Directory $installDirectory) {
			Write-FlnInfo "fln is installed, but the current session does not see it yet."
			Write-FlnInfo "Restart your terminal to refresh PATH."
			Write-Host ""
		} else {
			Show-FlnPathInstructions -Directory $installDirectory
		}
	}
} catch {
	Stop-FlnInstall $_.Exception.Message
} finally {
	if ($null -ne $temporaryDirectory -and (Test-Path -LiteralPath $temporaryDirectory)) {
		Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
	}
}
