export function formatTime(ms: number): string {
	if (ms < 1000)
		return `${ms}ms`;
	
	if (ms < 60_000)
		return `${(ms / 1000).toFixed(1)}s`;
	
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	
	return `${minutes}m ${seconds}s`;
}

export function formatTokenCount(tokens: number): string {
	if (tokens < 1_000)
		return `${tokens}`;
	
	if (tokens < 1_000_000)
		return `~${Math.round(tokens / 1000)}K`;
	
	return `~${(tokens / 1_000_000).toFixed(1)}M`;
}

export function formatFileCount(count: number): string {
	return count === 1 ? "1 file" : `${count} files`;
}

export function formatByteSize(bytes: number): string {
	if (bytes < 1024)
		return `${bytes}B`;
	
	if (bytes < 1024 * 1024)
		return `${(bytes / 1024).toFixed(1)}KB`;
	
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
