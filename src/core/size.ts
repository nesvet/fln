const kibibyte = 1024;
const mebibyte = kibibyte * 1024;
const gibibyte = mebibyte * 1024;

export function parseByteSize(input: string): number {
	const normalizedInput = input.trim().toLowerCase();
	const match = normalizedInput.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
	
	if (!match)
		throw new Error(`Invalid size: "${input}"`);
	
	const value = Number(match[1]);
	const unit = match[2] ?? "b";
	const multiplier =
		unit === "kb" ? kibibyte :
		unit === "mb" ? mebibyte :
		unit === "gb" ? gibibyte :
		1;
	
	return Math.floor(value * multiplier);
}

export function formatByteSize(sizeBytes: number): string {
	if (sizeBytes >= gibibyte)
		return `${(sizeBytes / gibibyte).toFixed(2)} GB`;
	if (sizeBytes >= mebibyte)
		return `${(sizeBytes / mebibyte).toFixed(2)} MB`;
	if (sizeBytes >= kibibyte)
		return `${(sizeBytes / kibibyte).toFixed(2)} KB`;
	
	return `${sizeBytes} B`;
}

export function formatTokenCount(count: number): string {
	if (count >= 1_000_000)
		return `≈ ${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1000)
		return `≈ ${(count / 1000).toFixed(1)}K`;
	
	return `≈ ${count}`;
}
