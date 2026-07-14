import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	buildCliParseOptions,
	CLI_FLAG_SPECS,
	CLI_SUBCOMMANDS,
	flagLongOption,
	flagShortOption,
} from "../src/cli/flagsManifest.js";

const projectRoot = join(import.meta.dir, "..");
const completionsDir = join(projectRoot, "completions");

function readCompletion(name: string): string {
	return readFileSync(join(completionsDir, name), "utf8");
}

describe("flags manifest", () => {
	it("matches parseArgs option keys", () => {
		const parseKeys = new Set(Object.keys(buildCliParseOptions()));
		const manifestKeys = new Set(CLI_FLAG_SPECS.map((spec) => spec.name));
		expect(parseKeys).toEqual(manifestKeys);
	});
});

describe("completion files", () => {
	const bash = readCompletion("fln.bash");
	const zsh = readCompletion("_fln");
	const fish = readCompletion("fln.fish");
	const powershell = readCompletion("fln.ps1");

	for (const subcommand of CLI_SUBCOMMANDS) {
		it(`includes subcommand ${subcommand} in bash`, () => {
			expect(bash).toContain(subcommand);
		});
		it(`includes subcommand ${subcommand} in zsh`, () => {
			expect(zsh).toContain(subcommand);
		});
		it(`includes subcommand ${subcommand} in fish`, () => {
			expect(fish).toContain(subcommand);
		});
		it(`includes subcommand ${subcommand} in PowerShell`, () => {
			expect(powershell).toContain(subcommand);
		});
	}

	for (const spec of CLI_FLAG_SPECS) {
		const long = flagLongOption(spec);
		const short = flagShortOption(spec);

		it(`includes ${long} in bash`, () => {
			expect(bash).toContain(long);
		});
		it(`includes ${long} in zsh`, () => {
			expect(zsh).toContain(long);
		});
		it(`includes ${long} in fish`, () => {
			expect(fish).toContain(`-l ${spec.name}`);
		});

		if (short) {
			it(`includes ${short} in bash`, () => {
				expect(bash).toContain(short);
			});
			it(`includes ${short} in zsh`, () => {
				expect(zsh).toContain(short);
			});
			it(`includes short -s ${spec.short} in fish`, () => {
				expect(fish).toContain(`-s ${spec.short}`);
			});
		}
	}
});
