import {
	type GenerationModelCatalogueResponse,
	type GenerationOptionDefinition,
	isGenerationOptionValueValid,
	missingGenerationOptions,
	readGenerationModels,
	reconcileGenerationOptions
} from "@core/generation/model-catalogue";

const modelWithOptions = (
	properties: Record<string, unknown>,
	required: string[] = [],
	model = "custom",
	type: "image" | "video" | "audio" = "image"
) => ({
	model,
	type,
	options: { type: "object", properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false }
});

const catalogue: GenerationModelCatalogueResponse = {
	models: [
		modelWithOptions({}, [], "flux-schnell"),
		modelWithOptions(
			{
				resolution: {
					type: "string",
					title: "Resolution",
					enum: ["1K", "2K"],
					default: "1K"
				}
			},
			[],
			"nano-banana-2"
		),
		modelWithOptions(
			{ inputSrc: { type: "string", format: "uri", title: "Start image" } },
			["inputSrc"],
			"needs-image",
			"video"
		),
		modelWithOptions(
			{
				inputSrc: { type: "string", format: "uri", title: "Start image" },
				generateAudio: { type: "boolean", title: "Generate audio" }
			},
			[],
			"seedance-2.0",
			"video"
		),
		{ model: "unexpanded", type: "audio" }
	]
};

describe("generation model catalogue", () => {
	it("keeps expanded models and excludes required input media", () => {
		const models = readGenerationModels(catalogue);

		expect(models.map(({ model }) => model)).toEqual(["flux-schnell", "nano-banana-2", "seedance-2.0"]);
	});

	it("preserves raw merge fields when their resolved value is valid", () => {
		const model = readGenerationModels(catalogue).find(entry => entry.model === "nano-banana-2");

		expect(reconcileGenerationOptions(model!, { resolution: "{{ SIZE }}", old: true }, { resolution: "2K", old: true })).toEqual({
			resolution: "{{ SIZE }}",
			old: undefined
		});
	});

	it("uses a destination default when the shared value is invalid", () => {
		const model = readGenerationModels(catalogue).find(entry => entry.model === "nano-banana-2");

		expect(reconcileGenerationOptions(model!, { resolution: "4K" }, { resolution: "4K" })).toEqual({ resolution: "1K" });
	});

	it("records an unrenderable property with its published title", () => {
		const [entry] = readGenerationModels({
			models: [
				modelWithOptions({
					forceInstrumental: { type: "boolean", title: "Instrumental only" },
					compositionPlan: { type: "object", title: "Composition plan", properties: {}, additionalProperties: false }
				})
			]
		});
		expect(entry?.options.map(o => o.name)).toEqual(["forceInstrumental"]);
		expect(entry?.unsupported).toEqual([{ name: "compositionPlan", title: "Composition plan" }]);
		expect(entry?.optionNames).toEqual(["forceInstrumental", "compositionPlan"]);
	});

	it("keeps optional unsupported properties but rejects unsupported required ones", () => {
		const optional = modelWithOptions({ seed: { type: "number" } });
		const required = modelWithOptions({ seed: { type: "number" } }, ["seed"]);

		expect(readGenerationModels({ models: [optional] })).toHaveLength(1);
		expect(readGenerationModels({ models: [required] })).toHaveLength(0);
	});

	it.each([
		[{ type: "boolean", name: "enabled", title: "Enabled", required: true, hasDefault: false }, false, true],
		[{ type: "integer", name: "length", title: "Length", required: true, minimum: 1, hasDefault: false }, 0, false],
		[{ type: "string", format: "uri", name: "source", title: "Source", required: true, hasDefault: false }, "not a URL", false],
		[{ type: "string", name: "voice", title: "Voice", required: true, hasDefault: false }, "", false]
	])("validates an option against its published constraints", (option, value, expected) => {
		expect(isGenerationOptionValueValid(option as GenerationOptionDefinition, value)).toBe(expected);
	});

	it("reports an empty required field by title", () => {
		const [model] = readGenerationModels({
			models: [modelWithOptions({ voice: { type: "string", title: "Voice" } }, ["voice"], "speech", "audio")]
		});

		expect(missingGenerationOptions(model!, { voice: "" })).toEqual(["Voice"]);
	});
});
