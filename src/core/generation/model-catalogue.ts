import type { operations } from "@shotstack/schemas";

export type GenerationModelCatalogueResponse = operations["getModels"]["responses"][200]["content"]["application/json"];
export type GenerationAssetType = "image" | "video" | "audio";

export type GenerationOptionDefinition = {
	name: string;
	title: string;
	type: "string" | "boolean" | "integer";
	required: boolean;
	values?: readonly string[];
	format?: "uri";
	minimum?: number;
	maximum?: number;
	hasDefault: boolean;
	defaultValue?: unknown;
};

/** A published option the editor has no control for; shown read-only so its value is never a surprise. */
export type GenerationUnsupportedOption = {
	name: string;
	title: string;
};

export type GenerationModelDefinition = {
	model: string;
	type: GenerationAssetType;
	optionNames: readonly string[];
	options: readonly GenerationOptionDefinition[];
	unsupported: readonly GenerationUnsupportedOption[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

export const isGenerationOptionValueValid = (option: GenerationOptionDefinition, value: unknown): boolean => {
	if (option.type === "string") {
		if (typeof value !== "string" || value.length === 0) return false;
		if (option.values && !option.values.includes(value)) return false;
		if (option.format !== "uri") return true;
		try {
			return Boolean(new URL(value));
		} catch {
			return false;
		}
	}
	if (option.type === "boolean") return typeof value === "boolean";
	if (!Number.isInteger(value)) return false;
	if (option.minimum !== undefined && (value as number) < option.minimum) return false;
	if (option.maximum !== undefined && (value as number) > option.maximum) return false;
	return true;
};

const readOption = (name: string, value: unknown, required: boolean): GenerationOptionDefinition | undefined => {
	if (!isRecord(value) || !["string", "boolean", "integer"].includes(String(value["type"]))) return undefined;
	if (value["enum"] !== undefined && (!Array.isArray(value["enum"]) || !value["enum"].every(item => typeof item === "string"))) {
		return undefined;
	}
	if (value["format"] !== undefined && value["format"] !== "uri") return undefined;

	const option: GenerationOptionDefinition = {
		name,
		title: typeof value["title"] === "string" ? value["title"] : name,
		type: value["type"] as GenerationOptionDefinition["type"],
		required,
		...(Array.isArray(value["enum"]) ? { values: value["enum"] as string[] } : {}),
		...(value["format"] === "uri" ? { format: "uri" as const } : {}),
		...(typeof value["minimum"] === "number" ? { minimum: value["minimum"] } : {}),
		...(typeof value["maximum"] === "number" ? { maximum: value["maximum"] } : {}),
		hasDefault: hasOwn(value, "default"),
		...(hasOwn(value, "default") ? { defaultValue: value["default"] } : {})
	};

	if (option.hasDefault && !isGenerationOptionValueValid(option, option.defaultValue)) {
		return { ...option, hasDefault: false, defaultValue: undefined };
	}
	return option;
};

export const readGenerationModels = (catalogue: unknown): readonly GenerationModelDefinition[] => {
	if (!isRecord(catalogue) || !Array.isArray(catalogue["models"])) return [];

	return catalogue["models"].flatMap(entry => {
		if (!isRecord(entry) || typeof entry["model"] !== "string") return [];
		if (!(["image", "video", "audio"] as const).includes(entry["type"] as GenerationAssetType)) return [];

		const { options: schema } = entry;
		if (!isRecord(schema) || schema["type"] !== "object" || schema["additionalProperties"] !== false) return [];
		const { properties } = schema;
		if (!isRecord(properties)) return [];
		const required = schema["required"] === undefined ? [] : schema["required"];
		if (!Array.isArray(required) || !required.every(name => typeof name === "string")) return [];
		if (required.includes("inputSrc")) return [];

		const options: GenerationOptionDefinition[] = [];
		const unsupported: GenerationUnsupportedOption[] = [];
		for (const [name, value] of Object.entries(properties)) {
			const option = readOption(name, value, required.includes(name));
			if (option) options.push(option);
			else unsupported.push({ name, title: isRecord(value) && typeof value["title"] === "string" ? value["title"] : name });
		}
		if (required.some(name => !options.some(option => option.name === name))) return [];

		return [
			{
				model: entry["model"],
				type: entry["type"] as GenerationAssetType,
				optionNames: Object.keys(properties),
				options,
				unsupported
			}
		];
	});
};

export const reconcileGenerationOptions = (
	model: GenerationModelDefinition,
	raw: Record<string, unknown>,
	resolved: Record<string, unknown>
): Record<string, unknown> => {
	const next: Record<string, unknown> = Object.fromEntries(
		Object.keys(raw)
			.filter(name => !model.optionNames.includes(name))
			.map(name => [name, undefined])
	);

	for (const name of model.optionNames) {
		const option = model.options.find(candidate => candidate.name === name);
		const value = hasOwn(resolved, name) ? resolved[name] : raw[name];

		if (!option) {
			if (hasOwn(raw, name)) next[name] = raw[name];
		} else if (hasOwn(raw, name) && isGenerationOptionValueValid(option, value)) {
			next[name] = raw[name];
		} else if (option.hasDefault) {
			next[name] = option.defaultValue;
		} else if (hasOwn(raw, name)) {
			next[name] = undefined;
		}
	}

	return next;
};

export const missingGenerationOptions = (
	model: GenerationModelDefinition,
	values: Record<string, unknown>
): readonly string[] =>
	model.options.filter(option => option.required && !isGenerationOptionValueValid(option, values[option.name])).map(option => option.title);
