const dateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

export function formatDateTime(): string {
	const now = new Date();

	return `${[
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("-")} ${[
		String(now.getHours()).padStart(2, "0"),
		String(now.getMinutes()).padStart(2, "0"),
	].join(":")}`;
}

export function parseDate(value: string): string {
	if (!dateTimeRegex.test(value.trim()))
		throw new Error(
			`Invalid date: "${value}". Expected format: YYYY-MM-DD HH:mm`,
		);

	return value.trim();
}
