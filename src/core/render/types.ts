import type { Logger } from "../../infra/index.js";

export type RenderLogger = Pick<Logger, "debug" | "info" | "warn">;
