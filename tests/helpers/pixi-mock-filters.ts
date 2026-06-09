/** pixi.js filter/shader stubs so WipeFilter (extends pixi.Filter at module load) survives a mocked pixi. */
/* eslint-disable max-classes-per-file, class-methods-use-this, import/prefer-default-export -- minimal pixi API stubs for jest mocks */

export const pixiFilterStubs = {
	Filter: class {
		destroy(): void {}
	},
	GlProgram: { from: (): Record<string, unknown> => ({}) },
	GpuProgram: { from: (): Record<string, unknown> => ({}) },
	UniformGroup: class {
		uniforms: Record<string, unknown> = {};
	},
	defaultFilterVert: ""
};
