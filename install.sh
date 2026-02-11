#!/usr/bin/env sh
set -eu

repository="nesvet/fln"
version="${FLN_VERSION:-latest}"
installDirectory="${INSTALL_DIR:-$HOME/.local/bin}"
maxAssetSizeBytes="104857600"
maxChecksumSizeBytes="8192"
latestReleaseApiUrl="https://api.github.com/repos/${repository}/releases/latest"

umask 077

disableColors() {
	colorSuccess=""
	colorWarning=""
	colorError=""
	colorInfo=""
	colorBold=""
	colorReset=""
}

if [ -t 1 ] && [ "${FLN_SILENT:-0}" != "1" ]; then
	if command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
		colorSuccess="$(tput setaf 2)"
		colorWarning="$(tput setaf 3)"
		colorError="$(tput setaf 1)"
		colorInfo="$(tput setaf 6)"
		colorBold="$(tput bold)"
		colorReset="$(tput sgr0)"
	else
		disableColors
	fi
else
	disableColors
fi

printInfo() {
	message="$1"
	printf "%sℹ%s %s\n" "$colorInfo" "$colorReset" "$message"
}

printSuccess() {
	message="$1"
	printf "%s✓%s %s\n" "$colorSuccess" "$colorReset" "$message"
}

printWarning() {
	message="$1"
	printf "%s⚠%s %s\n" "$colorWarning" "$colorReset" "$message"
}

printError() {
	message="$1"
	printf "%s✗%s %s\n" "$colorError" "$colorReset" "$message"
}

fail() {
	message="$1"
	printError "$message"
	exit 1
}

validateVersion() {
	case "$version" in
		latest)
			return
			;;
		*[!A-Za-z0-9._-]*|"")
			fail "Invalid FLN_VERSION value: ${version}"
			;;
	esac
}

validateInstallDirectory() {
	sanitizedDirectory="$(printf "%s" "$installDirectory" | tr -d '`"$;&|<>()')"
	if [ "$sanitizedDirectory" != "$installDirectory" ]; then
		fail "Invalid INSTALL_DIR value: contains unsafe characters."
	fi
}

resolveInstallDirectory() {
	targetDirectory="$1"
	mkdir -p "$targetDirectory" >/dev/null 2>&1 || fail "Unable to create install directory: ${targetDirectory}"
	resolvedPath="$(cd "$targetDirectory" 2>/dev/null && pwd -P)" || fail "Unable to resolve install directory: ${targetDirectory}"
	printf "%s\n" "$resolvedPath"
}

selectDownloader() {
	if command -v curl >/dev/null 2>&1; then
		printf "curl\n"
		return
	fi
	if command -v wget >/dev/null 2>&1; then
		printf "wget\n"
		return
	fi
	fail "Missing downloader: curl or wget is required."
}

fetchTextFromUrl() {
	url="$1"

	case "$downloader" in
		curl)
			curl -fsSL --proto "=https" --tlsv1.2 "$url" 2>/dev/null || return 1
			;;
		wget)
			wget -qO- "$url" 2>/dev/null || return 1
			;;
	esac
}

parseLatestVersionTag() {
	jsonPayload="$1"

	if command -v jq >/dev/null 2>&1; then
		tagName="$(printf "%s" "$jsonPayload" | jq -r ".tag_name // empty" 2>/dev/null || echo "")"
	else
		tagName="$(printf "%s" "$jsonPayload" | tr -d "\r\n" | sed -n -E "s/.*\"tag_name\"[[:space:]]*:[[:space:]]*\"([^\"]+)\".*/\1/p")"
	fi

	if [ -z "$tagName" ]; then
		printf "latest\n"
		return
	fi

	case "$tagName" in
		v*)
			printf "%s\n" "${tagName#v}"
			;;
		*)
			printf "%s\n" "$tagName"
			;;
	esac
}

fetchLatestVersion() {
	apiResponse="$(fetchTextFromUrl "$latestReleaseApiUrl" || echo "")"
	if [ -z "$apiResponse" ]; then
		printf "latest\n"
		return
	fi
	parseLatestVersionTag "$apiResponse"
}

enforceFileSizeLimit() {
	path="$1"
	maxBytes="$2"
	label="${3:-Downloaded file}"
	downloadedBytes="$(wc -c < "$path" | tr -d " ")"
	if [ "$downloadedBytes" -gt "$maxBytes" ]; then
		fail "${label} is too large (${downloadedBytes} bytes)."
	fi
}

operatingSystem="$(uname -s)"
architecture="$(uname -m)"
validateVersion
validateInstallDirectory
installDirectory="$(resolveInstallDirectory "$installDirectory")"
downloader="$(selectDownloader)"

case "$operatingSystem" in
	Darwin)
		platform="macos"
		;;
	Linux)
		platform="linux"
		;;
	*)
		fail "Unsupported OS: $operatingSystem"
		;;
esac

case "$architecture" in
	x86_64|amd64)
		architecture="x64"
		;;
	arm64|aarch64)
		architecture="arm64"
		;;
	*)
		printError "Unsupported architecture: $architecture"
		printWarning "Only x64 and arm64 builds are available."
		exit 1
		;;
esac

asset="fln-${platform}-${architecture}.tar.gz"

if [ "$version" = "latest" ]; then
	baseUrl="https://github.com/${repository}/releases/latest/download"
	actualVersion="$(fetchLatestVersion)"
	if [ "$actualVersion" = "latest" ]; then
		displayVersion="(latest)"
		printWarning "Unable to resolve latest version from GitHub API. Continuing with latest channel."
	else
		displayVersion="${actualVersion}"
	fi
else
	releaseTag="$version"
	baseUrl="https://github.com/${repository}/releases/download/${releaseTag}"
	displayVersion="${version}"
fi

temporaryDirectory="$(mktemp -d)"
cleanup() {
	rm -rf "$temporaryDirectory"
}
trap cleanup EXIT

download() {
	url="$1"
	destinationPath="$2"
	maxBytes="$3"

	case "$downloader" in
		curl)
			if [ "${FLN_SILENT:-0}" = "1" ] || [ ! -t 1 ]; then
				curl -fsSL --proto "=https" --tlsv1.2 "$url" -o "$destinationPath" || fail "Download failed via curl."
			else
				curl -fL --progress-bar --proto "=https" --tlsv1.2 "$url" -o "$destinationPath" || {
					printf "\n"
					fail "Download failed via curl."
				}
			fi
			;;
		wget)
			if [ "${FLN_SILENT:-0}" = "1" ] || [ ! -t 1 ]; then
				wget -qO "$destinationPath" "$url" || fail "Download failed via wget."
			else
				wget --progress=bar:force:noscroll -O "$destinationPath" "$url" 2>&1 || fail "Download failed via wget."
			fi
			;;
	esac

	[ -f "$destinationPath" ] || fail "Downloaded file is missing: ${destinationPath}"
	[ ! -L "$destinationPath" ] || fail "Refusing symlink file: ${destinationPath}"
	enforceFileSizeLimit "$destinationPath" "$maxBytes"
}

isInPath() {
	directory="$1"
	oldIFS=$IFS
	IFS=":"
	set -- $PATH
	IFS=$oldIFS

	for pathEntry; do
		if [ "$pathEntry" = "$directory" ]; then
			return 0
		fi
	done

	return 1
}

detectShellConfig() {
	shellName="${SHELL##*/}"
	
	case "$shellName" in
		zsh)
			if [ -f "$HOME/.zshrc" ]; then
				echo "$HOME/.zshrc"
			elif [ -f "$HOME/.zprofile" ]; then
				echo "$HOME/.zprofile"
			else
				echo "$HOME/.zshrc"
			fi
			;;
		bash)
			if [ -f "$HOME/.bashrc" ]; then
				echo "$HOME/.bashrc"
			elif [ -f "$HOME/.bash_profile" ]; then
				echo "$HOME/.bash_profile"
			elif [ -f "$HOME/.profile" ]; then
				echo "$HOME/.profile"
			else
				echo "$HOME/.bashrc"
			fi
			;;
		fish)
			echo "$HOME/.config/fish/config.fish"
			;;
		*)
			echo "$HOME/.profile"
			;;
	esac
}

printPathInstructions() {
	targetDirectory="$1"
	configFile="$(detectShellConfig)"
	shellName="${SHELL##*/}"

	printInfo "fln is not in your PATH."
	printf "\n"

	if [ -f "$configFile" ]; then
		printf "Add this line to %s:\n" "$configFile"
	else
		printf "Create %s and add this line:\n" "$configFile"
	fi

	if [ "$shellName" = "fish" ]; then
		printf "  set -gx PATH %s \$PATH\n" "$targetDirectory"
	else
		printf "  export PATH=\"%s:\$PATH\"\n" "$targetDirectory"
	fi

	printf "\n"
	printf "Then reload your shell:\n  source %s\n" "$configFile"
	printf "\n"
}

download "${baseUrl}/${asset}" "${temporaryDirectory}/${asset}" "$maxAssetSizeBytes"
download "${baseUrl}/${asset}.sha256" "${temporaryDirectory}/${asset}.sha256" "$maxChecksumSizeBytes"

if command -v sha256sum >/dev/null 2>&1; then
	actualHash="$(sha256sum "${temporaryDirectory}/${asset}" | awk "NR==1 {print \$1}")"
else
	actualHash="$(shasum -a 256 "${temporaryDirectory}/${asset}" | awk "NR==1 {print \$1}")"
fi
expectedHash="$(awk "NR==1 {print \$1}" "${temporaryDirectory}/${asset}.sha256")"

if [ "$actualHash" != "$expectedHash" ]; then
	fail "Checksum mismatch. Expected: ${expectedHash}, got: ${actualHash}"
fi

tar -xzf "${temporaryDirectory}/${asset}" -C "$temporaryDirectory" || fail "Failed to extract archive."

if [ ! -f "${temporaryDirectory}/fln" ]; then
	fail "Binary not found in archive."
fi

mkdir -p "$installDirectory" || fail "Failed to ensure install directory exists."
mv "${temporaryDirectory}/fln" "${installDirectory}/fln" || fail "Failed to move binary to install directory."
chmod +x "${installDirectory}/fln" || fail "Failed to make binary executable."

case "$installDirectory" in "$HOME"*) shortPath="~${installDirectory#$HOME}/fln";; *) shortPath="${installDirectory}/fln";; esac

if [ "${FLN_SILENT:-0}" = "1" ]; then
	printf "🥞 fln %s was installed successfully to %s\n" "$displayVersion" "$shortPath"
else
	printf "%s🥞 %sfln%s%s %s was installed successfully to %s%s%s\n" "$colorSuccess" "$colorBold" "$colorReset" "$colorSuccess" "$displayVersion" "$colorBold" "$shortPath" "$colorReset"
fi
printf "Run 'fln --help' to get started\n"

if command -v fln >/dev/null 2>&1; then
	:
else
	if isInPath "$installDirectory"; then
		printInfo "fln installed, but current shell does not see it yet."
		printInfo "Restart your terminal session or re-source your shell configuration file."
		printf "\n"
	else
		printPathInstructions "$installDirectory"
	fi
fi
