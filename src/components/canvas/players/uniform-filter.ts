import { defaultFilterVert, Filter, GlProgram, GpuProgram, UniformGroup } from "pixi.js";

const WGSL_FILTER_HEADER = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>
};

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition : vec2<f32>) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}
`;

/**
 * A filter whose uniforms are all floats, declared from `initial`. The GLSL `main` and WGSL `mainFragment` bodies read
 * them by name (WGSL through `u.`), alongside pixi's `uInputSize` and `uInputClamp`.
 */
export class UniformFilter<U extends string> extends Filter {
	public readonly uniforms: Record<U, number>;

	constructor(name: string, glMain: string, wgslMain: string, initial: Record<U, number>) {
		const names = Object.keys(initial);
		const glFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
${names.map(uniform => `uniform float ${uniform};`).join("\n")}

void main(void)
{${glMain}}
`;
		const gpuSource = `${WGSL_FILTER_HEADER}
struct FilterUniforms {
${names.map(uniform => `  ${uniform}:f32,`).join("\n")}
};
@group(1) @binding(0) var<uniform> filterUniforms : FilterUniforms;

@fragment
fn mainFragment(@location(0) uv: vec2<f32>, @builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let u = filterUniforms;${wgslMain}}
`;
		// pixi's vertex stage declares uInputSize too, at highp, and WebGL links a program only if a uniform has one
		// precision across both stages. highp also keeps single-texel offsets apart on textures wider than 1024 pixels.
		const glProgram = GlProgram.from({ vertex: defaultFilterVert, fragment: glFragment, name, preferredFragmentPrecision: "highp" });
		const gpuProgram = GpuProgram.from({
			vertex: { source: gpuSource, entryPoint: "mainVertex" },
			fragment: { source: gpuSource, entryPoint: "mainFragment" }
		});
		const filterUniforms = new UniformGroup(
			Object.fromEntries(names.map(uniform => [uniform, { value: initial[uniform as U], type: "f32" as const }]))
		);
		super({ glProgram, gpuProgram, resources: { filterUniforms }, padding: 0 });
		this.uniforms = filterUniforms.uniforms as Record<U, number>;
	}
}

export type Rgb = readonly number[];

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
