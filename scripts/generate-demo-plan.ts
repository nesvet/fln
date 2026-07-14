import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fln, formatPlanText } from "../src/api/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixedDate = "2026-01-01 00:00";

const planResult = await fln.plan({
	input: repoRoot,
	relevant: ["src/cli/index.ts"],
	budget: 200_000,
	logLevel: "silent",
});

await writeFile(
	join(repoRoot, "assets", "demo-plan.md"),
	`${formatPlanText({ ...planResult, generated: fixedDate })}\n`,
	"utf8",
);
