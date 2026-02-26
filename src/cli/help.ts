import { applyColor, colors } from "./output/index.js";


export function formatHelpMessage(ansi: boolean): string {
	const bold = (text: string) => applyColor(text, colors.bold, ansi);
	const dim = (text: string) => applyColor(text, colors.dim, ansi);
	const cyan = (text: string) => applyColor(text, colors.info, ansi);
	const green = (text: string) => applyColor(text, colors.success, ansi);
	
	return `🥞 ${bold("fln")} ${dim("—")} Flatten your codebase into a single file for LLMs.

${bold("Usage:")} fln ${cyan("[directory]")} ${dim("[...flags]")}
  fln ${cyan("init")} ${dim("[--overwrite]")}

${bold("Options:")}
  ${cyan("-o, --output")} ${dim("<path>")}       Output file or directory path ${dim("(default: <name>-<version>.<ext>; adds .md/.json if no extension)")}
  ${cyan("-w, --overwrite")}           Overwrite output file instead of adding numeric suffix
  ${cyan("-e, --exclude")} ${dim("<glob>")}      Exclude patterns ${dim("(repeatable)")}
  ${cyan("-i, --include")} ${dim("<glob>")}      Force include patterns ${dim("(repeatable)")}
  ${cyan("    --ext")} ${dim("<ext>")}           Include only these extensions ${dim("(e.g. ts,tsx,js)")}
  ${cyan("    --since")} ${dim("<ref>")}         Include only files changed since git ref ${dim("(e.g. HEAD~1, main)")}
  ${cyan("    --include-hidden")}      Include hidden files and directories
  ${cyan("    --no-gitignore")}        Ignore .gitignore files
  ${cyan("    --max-size")} ${dim("<size>")}     Max file size ${dim("(e.g. 10mb, 512kb)")}
  ${cyan("    --max-total-size")} ${dim("<size>")} Max total included size
  ${cyan("    --no-contents")}         Exclude file contents
  ${cyan("    --no-tree")}             Exclude directory tree
  ${cyan("    --format")} ${dim("<md|json>")}    Output format ${dim("(default: md)")}
  ${cyan("    --dry-run")}             Scan and report without writing output
  ${cyan("    --stdout")}              Write output to stdout instead of file ${dim("(implies --quiet)")}
  ${cyan("    --follow-symlinks")}     Follow symlinks while scanning
  ${cyan("    --no-ansi")}             Disable ANSI colors
  ${cyan("    --no-sponsor-message")}  Hide support message ${dim("(also: FLN_NO_SPONSOR=1)")}
  ${cyan("    --date")} ${dim("<date>")}       Use this date in the "Generated" header ${dim("(YYYY-MM-DD HH:mm)")}
  ${cyan("    --banner")} ${dim("<text>")}       Add text at the beginning of the output
  ${cyan("    --banner-file")} ${dim("<path>")} Prepend file contents at the beginning ${dim("(relative to input)")}
  ${cyan("    --footer")} ${dim("<text>")}       Add text at the end of the output
  ${cyan("    --footer-file")} ${dim("<path>")}  Append file contents at the end ${dim("(relative to input)")}
  ${cyan("-q, --quiet")}               Minimal output
  ${cyan("-V, --verbose")}             Verbose output
  ${cyan("    --debug")}               Debug output with file list
  ${cyan("-v, --version")}             Show version
  ${cyan("-h, --help")}                Show this help message

${bold("Examples:")}
  ${dim("$")} fln ${cyan("init")}
  ${dim("$")} fln . ${cyan("-o")} output.md
  ${dim("$")} fln ${cyan("--stdout")} | pbcopy
  ${dim("$")} fln ${cyan("--ext")} ts,tsx,js
  ${dim("$")} fln ${cyan("--since")} HEAD~1
  ${dim("$")} fln src ${cyan("-e")} ${green('"*.test.ts"')} ${cyan("-e")} ${green('"fixtures/"')}
  ${dim("$")} fln . ${cyan("--no-contents --format")} json

${bold("Note:")} Quote glob patterns ${dim('(e.g. "*.md")')} to prevent shell expansion.
`;
}
