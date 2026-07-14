import { encode as encodeCl100k } from "gpt-tokenizer/encoding/cl100k_base";
import { encode as encodeO200k } from "gpt-tokenizer/encoding/o200k_base";
import { countTokens } from "./countTokens.js";

export type TokenModel =
	| "claude"
	| "estimate"
	| "gemini"
	| "gpt-4"
	| "gpt-4o"
	| "gpt-5";

type TokenEncoder = {
	encode: (text: string) => number[];
};

const cl100kEncoder: TokenEncoder = {
	encode: (text: string) => encodeCl100k(text),
};

const o200kEncoder: TokenEncoder = {
	encode: (text: string) => encodeO200k(text),
};

function isHeuristicModel(model: TokenModel): boolean {
	return model === "estimate" || model === "claude" || model === "gemini";
}

function getEncoderForModel(model: TokenModel): TokenEncoder {
	if (model === "gpt-4o" || model === "gpt-5") return o200kEncoder;

	return cl100kEncoder;
}

export async function countTextTokensAsync(
	text: string,
	model: TokenModel,
): Promise<number> {
	if (!text) return 0;

	if (isHeuristicModel(model)) return countTokens(text);

	return getEncoderForModel(model).encode(text).length;
}

export async function createTokenCounter(
	model: TokenModel,
): Promise<(text: string) => number> {
	if (isHeuristicModel(model)) return (text: string) => countTokens(text);

	const encoder = getEncoderForModel(model);

	return (text: string) => encoder.encode(text).length;
}
