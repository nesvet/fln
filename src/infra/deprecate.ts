export function warnDeprecated(oldName: string, newName: string, context?: string): void {
	const message = context ?
		`fln: "${oldName}" is deprecated, use "${newName}" instead (${context})` :
		`fln: "${oldName}" is deprecated, use "${newName}" instead`;
	console.warn(message);
}

export function resolveOption<T, O extends Record<string, unknown> = Record<string, unknown>>(
	options: O,
	newKey: keyof O,
	deprecatedKey: keyof O,
	context: string,
	parse?: (value: unknown) => T | undefined
): T | undefined {
	const newVal = options[newKey];
	const deprecatedVal = options[deprecatedKey];
	if (deprecatedVal !== undefined && newVal === undefined)
		warnDeprecated(String(deprecatedKey), String(newKey), context);
	const raw = newVal ?? deprecatedVal;
	
	return raw === undefined ? undefined : (parse ? parse(raw) : raw as T);
}
