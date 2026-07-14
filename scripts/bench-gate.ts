export const BENCH_REGRESSION_TOLERANCE = 1.1;

export function exceedsBaseline(
	ms: number,
	baseline: number,
	tolerance = BENCH_REGRESSION_TOLERANCE,
): boolean {
	return ms > baseline * tolerance;
}

export function regressionLimitMs(
	baseline: number,
	tolerance = BENCH_REGRESSION_TOLERANCE,
): number {
	return Math.round(baseline * tolerance);
}
