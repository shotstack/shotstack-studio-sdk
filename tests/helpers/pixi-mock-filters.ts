/** pixi.js filter/shader stubs so the player's filters (some extend pixi.Filter at module load) survive a mocked pixi. */
/* eslint-disable max-classes-per-file, class-methods-use-this, import/prefer-default-export -- minimal pixi API stubs for jest mocks */

export const pixiFilterStubs = {
	Filter: class {
		resources: Record<string, unknown>;

		glProgram: unknown;

		constructor(options: { resources?: Record<string, unknown>; glProgram?: unknown } = {}) {
			this.resources = options.resources ?? {};
			this.glProgram = options.glProgram;
		}

		destroy(): void {}
	},
	BlurFilter: class {
		strength = 0;

		strengthX = 0;

		strengthY = 0;

		repeatEdgePixels = false;

		destroy(): void {}
	},
	// A program is the options it was asked for, so a test can read the sources a filter would compile.
	GlProgram: { from: (options: Record<string, unknown> = {}): Record<string, unknown> => options },
	GpuProgram: { from: (): Record<string, unknown> => ({}) },
	UniformGroup: class {
		uniforms: Record<string, unknown>;

		// pixi keeps each `{ value, type }` structure as its bare value.
		constructor(structures: Record<string, { value: unknown }> = {}) {
			this.uniforms = Object.fromEntries(Object.entries(structures).map(([name, { value }]) => [name, value]));
		}
	},
	defaultFilterVert: ""
};
