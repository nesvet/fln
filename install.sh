#!/usr/bin/env sh
set -eu

repository="nesvet/flatr"
version="${FLATR_VERSION:-latest}"
installDirectory="${INSTALL_DIR:-$HOME/.local/bin}"

operatingSystem="$(uname -s)"
architecture="$(uname -m)"

case "$operatingSystem" in
	Darwin)
		platform="macos"
		;;
	Linux)
		platform="linux"
		;;
	*)
		echo "Unsupported OS: $operatingSystem"
		exit 1
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
		echo "Unsupported architecture: $architecture"
		echo "Only x64 and arm64 builds are available."
		exit 1
		;;
esac

asset="flatr-${platform}-${architecture}.tar.gz"

if [ "$version" = "latest" ]; then
	baseUrl="https://github.com/${repository}/releases/latest/download"
else
	releaseTag="$version"
	baseUrl="https://github.com/${repository}/releases/download/${releaseTag}"
fi

temporaryDirectory="$(mktemp -d)"
cleanup() {
	rm -rf "$temporaryDirectory"
}
trap cleanup EXIT

download() {
	url="$1"
	destinationPath="$2"
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$url" -o "$destinationPath"
		return
	fi
	if command -v wget >/dev/null 2>&1; then
		wget -qO "$destinationPath" "$url"
		return
	fi
	echo "Missing downloader: curl or wget is required."
	exit 1
}

download "${baseUrl}/${asset}" "${temporaryDirectory}/${asset}"
download "${baseUrl}/${asset}.sha256" "${temporaryDirectory}/${asset}.sha256"

if command -v sha256sum >/dev/null 2>&1; then
	set -- $(sha256sum "${temporaryDirectory}/${asset}")
else
	set -- $(shasum -a 256 "${temporaryDirectory}/${asset}")
fi
actualHash="$1"

set -- $(cat "${temporaryDirectory}/${asset}.sha256")
expectedHash="$1"

if [ "$actualHash" != "$expectedHash" ]; then
	echo "Checksum mismatch. Aborting."
	exit 1
fi

tar -xzf "${temporaryDirectory}/${asset}" -C "$temporaryDirectory"

if [ ! -f "${temporaryDirectory}/flatr" ]; then
	echo "Binary not found in archive."
	exit 1
fi

mkdir -p "$installDirectory"
mv "${temporaryDirectory}/flatr" "${installDirectory}/flatr"
chmod +x "${installDirectory}/flatr"

echo "Installed flatr to ${installDirectory}/flatr"

if command -v flatr >/dev/null 2>&1; then
	echo "Run: flatr --help"
else
	echo "Add ${installDirectory} to your PATH to use flatr."
fi
