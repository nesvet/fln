import { applyColor, colors } from "./output/index.js";

export function formatHelpMessage(ansi: boolean): string {
	const bold = (text: string) => applyColor(text, colors.bold, ansi);
	const dim = (text: string) => applyColor(text, colors.dim, ansi);
	const cyan = (text: string) => applyColor(text, colors.info, ansi);
	const green = (text: string) => applyColor(text, colors.success, ansi);

	return `🥞 ${bold("fln")} ${dim("—")} Flatten your codebase into a single file for LLMs.

${bold("Usage:")} fln ${cyan("[directory]")} ${dim("[...flags]")}
  fln ${cyan("init")} ${dim("[--overwrite]")}
  fln ${cyan("why")} ${dim("<path>")} ${cyan("[directory]")} ${dim("[--format text|json]")} ${dim("[...flags]")}
  fln ${cyan("doctor")} ${dim("[directory]")} ${dim("[--format text|json]")} ${dim("[...filter flags]")}
  fln ${cyan("mcp")} ${dim("[directory]")}           Start MCP server (stdio or --http)
  fln ${cyan("plan")} ${dim("[directory]")} ${dim("[--budget <n>]")} ${dim("[--relevant <seed>]")} ${dim("[-o plan.json]")}
  fln ${cyan("diff")} ${dim("<before> <after>")}       Diff two snapshot files (md or json)
  fln ${cyan("upgrade")}                              Self-update installed binary from GitHub Releases

${bold("Doctor:")} ${dim("Preflight scan without writing output (same filters as fln). Token estimate ±20% vs flatten.")}
  ${dim("Exit 0 ok, 1 config error, 2 no files included.")}

${bold("Filtering:")}
  ${dim("-i force-includes matching paths (additive; bypasses ignore and hidden)")}
  ${dim("--only whitelist: only matching files (repeatable)")}
  ${dim("--relevant <seed> include only files transitively imported by seed (repeatable)")}
  ${dim("--stdin read file paths from stdin (force-include + prune to set; bypasses gitignore)")}
  ${dim("-e exclude; !pattern un-ignores after .gitignore (e.g. -e '*.log' -e '!keep.log')")}

${bold("Options:")}
  ${cyan("-o, --output")} ${dim("<path>")}       Output file or directory path ${dim("(default: <name>-<version>.<ext>; adds .md/.json if no extension)")}
  ${cyan("-w, --overwrite")}           Overwrite output file instead of adding numeric suffix
  ${cyan("-e, --exclude")} ${dim("<glob>")}      Exclude patterns ${dim("(repeatable)")}
  ${cyan("-i, --include")} ${dim("<glob>")}      Force-include paths ${dim("(repeatable; additive)")}
  ${cyan("    --only")} ${dim("<glob>")}          Only these paths ${dim("(repeatable; whitelist)")}
  ${cyan("    --relevant")} ${dim("<path>")}     Only files transitively imported by seed ${dim("(repeatable)")}
  ${cyan("    --ext")} ${dim("<ext>")}           Include only these extensions ${dim("(e.g. ts,tsx,js)")}
  ${cyan("    --since")} ${dim("<ref>")}         Include only files changed since git ref ${dim("(e.g. HEAD~1, main)")}
  ${cyan("    --include-hidden")}      Include all hidden files and directories
  ${cyan("    --no-gitignore")}        Ignore .gitignore files
  ${cyan("    --max-file-size")} ${dim("<size>")}     Max file size ${dim("(e.g. 10mb, 512kb)")}
  ${cyan("    --max-total-size")} ${dim("<size>")} Max output size ${dim("(graceful omit; use --strict-limits to throw)")}
  ${cyan("    --max-tokens")} ${dim("<n>")}       Token budget for output ${dim("(priority: README before tests)")}
  ${cyan("    --max-content-tokens")} ${dim("<n>")} Token budget for source files only
  ${cyan("    --token-model")} ${dim("<model>")}  Token counter: estimate, gpt-4, gpt-4o, gpt-5, claude, gemini
  ${cyan("    --strict-limits")}       Throw when byte/token limits exceeded
  ${cyan("    --strict-toctou")}       Throw when a file changed between scan and render (else warn)
  ${cyan("    --annotate-tree")} ${dim("<tokens|lines|size>")} Annotate tree with token/line/size counts ${dim("(tokens/lines: tree at end)")}
  ${cyan("    --collect-todo")}        Collect TODO/FIXME markers into a separate section
  ${cyan("    --compress")}            Signature extraction — imports, types, function signatures (bodies omitted; full content where no extractor)
  ${cyan("    --outline")}             Outline mode — signatures only, no implementations (implies contents)
  ${cyan("    --diff-hunks")}          With --since: embed unified diff instead of full files
  ${cyan("    --encoding")} ${dim("<auto|utf8|latin1>")} Text file encoding
  ${cyan("    --output-split")} ${dim("<n>")}   Max output parts when split by limits
  ${cyan("    --no-contents")}         Exclude file contents
  ${cyan("    --no-tree")}             Exclude directory tree
  ${cyan("    --format")} ${dim("<md|json>")}    Output format ${dim("(default: md)")}
  ${cyan("    --dry-run")}             Scan and report without writing output
  ${cyan("    --stdout")}              Write output to stdout instead of file ${dim("(implies --quiet)")}
  ${cyan("    --copy")}                Copy output to the system clipboard ${dim("(implies --quiet; not with -o, --stdout, --dry-run, --output-split > 1)")}
  ${cyan("    --follow-symlinks")}     Follow symlinks while scanning
  ${cyan("    --no-ansi")}             Disable ANSI colors
  ${cyan("    --no-sponsor-message")}  Hide support message ${dim("(also: FLN_NO_SPONSOR=1)")}
  ${cyan("    --no-local-state")}      Do not write ~/.config/fln/usage.json this run
  ${cyan("    --ignore-config")}       Skip fln.json; use defaults and CLI flags only
  ${cyan("    --date")} ${dim("<date>")}       Use this date in the "Generated" header ${dim("(YYYY-MM-DD HH:mm)")}
  ${cyan("    --banner")} ${dim("<text>")}       Add text at the beginning of the output
  ${cyan("    --banner-file")} ${dim("<path>")} Prepend file contents at the beginning ${dim("(relative to input)")}
  ${cyan("    --footer")} ${dim("<text>")}       Add text at the end of the output
  ${cyan("    --footer-file")} ${dim("<path>")} Append file contents at the end ${dim("(relative to input)")}
  ${green("-q, --quiet")}              Suppress all output except errors
  ${green("-V, --verbose")}            Verbose output ${dim("(includes extension breakdown)")}
  ${green("    --debug")}              Debug output ${dim("(includes all processed files)")}
  ${green("-v, --version")}            Show version
  ${green("-h, --help")}               Show this help

${bold("Examples:")}
  ${dim("$")} fln
  ${dim("$")} fln -i "src/generated/schema.ts"
  ${dim("$")} fln --only "**/*.ts"
  ${dim("$")} fln -e "*.md" -e '!README.md'
  ${dim("$")} fln why .env --include-hidden
  ${dim("$")} fln why .env --format json
  ${dim("$")} fln doctor .
  ${dim("$")} fln doctor --format json --max-tokens 500000
  ${dim("$")} fln mcp          # start MCP server for AI agent integration
  ${dim("$")} fln plan --budget 200000 --relevant src/index.ts -o plan.json
  ${dim("$")} fln diff snapshot-v1.md snapshot-v2.md
  ${dim("$")} fln diff old.json new.json --format json
  ${dim("$")} git ls-files | fln --stdin -o snapshot.md
  ${dim("$")} rg -l TODO | fln --stdin --stdout
`;
}
