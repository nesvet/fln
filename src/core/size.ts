import bytes from "bytes";


export function parseByteSize(input: string): number {
	const result = bytes.parse(input.trim());
	
	if (result === null || result < 0)
		throw new Error(`Invalid size: "${input}"`);
	
	return Math.floor(result);
}

export function formatByteSize(sizeBytes: number): string {
	const result = bytes(sizeBytes, { unitSeparator: " " });
	
	return result ?? `${sizeBytes} B`;
}

export function formatTokenCount(count: number): string {
	if (count >= 1_000_000)
		return `≈ ${(count / 1_000_000).toFixed(1)}M`;
	
	if (count >= 1000)
		return `≈ ${(count / 1000).toFixed(1)}K`;
	
	return `≈ ${count}`;
}
