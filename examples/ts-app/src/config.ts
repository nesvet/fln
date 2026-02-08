export type AppConfig = {
	projectName: string;
	inputPath: string;
	minLineLength: number;
};

export const loadConfig = (): AppConfig => ({
	projectName: "ts-app",
	inputPath: "sample.txt",
	minLineLength: 3
});
