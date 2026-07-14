export type AppConfig = {
	projectName: string;
	inputPath: string;
	minLineLength: number;
	apiKey: string | undefined;
};

export const loadConfig = (): AppConfig => ({
	projectName: "ts-app",
	inputPath: "sample.txt",
	minLineLength: 3,
	apiKey: process.env.API_KEY,
});
