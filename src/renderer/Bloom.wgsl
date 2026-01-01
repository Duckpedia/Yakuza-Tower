struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

@group(0) @binding(0) var tex: texture_2d<f32>;

@group(1) @binding(0) var tex_sampler: sampler;

@group(2) @binding(0) var<uniform> bloomParams: BloomParams;

@vertex
fn vertex(@builtin(vertex_index) v_index : u32) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4(FULLSCREEN_QUAD_POSITIONS[v_index], 0.0, 1.0);
    output.uv = output.position.xy * 0.5 + 0.5;
    output.uv.y = 1.0 - output.uv.y;
    return output;
}

@fragment
fn downsample(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;

    let srcTexelSize = 1.0 / bloomParams.srcResolution;
    let x = srcTexelSize.x;
    let y = srcTexelSize.y;

    let a = textureSampleLevel(tex, tex_sampler, vec2f(uv.x - 2.0*x, uv.y + 2.0*y), 0.0).rgb;
    let b = textureSampleLevel(tex, tex_sampler, vec2f(uv.x,         uv.y + 2.0*y), 0.0).rgb;
    let c = textureSampleLevel(tex, tex_sampler, vec2f(uv.x + 2.0*x, uv.y + 2.0*y), 0.0).rgb;

    let d = textureSampleLevel(tex, tex_sampler, vec2f(uv.x - 2.0*x, uv.y), 0.0).rgb;
    let e = textureSampleLevel(tex, tex_sampler, vec2f(uv.x,         uv.y), 0.0).rgb;
    let f = textureSampleLevel(tex, tex_sampler, vec2f(uv.x + 2.0*x, uv.y), 0.0).rgb;

    let g = textureSampleLevel(tex, tex_sampler, vec2f(uv.x - 2.0*x, uv.y - 2.0*y), 0.0).rgb;
    let h = textureSampleLevel(tex, tex_sampler, vec2f(uv.x,         uv.y - 2.0*y), 0.0).rgb;
    let i = textureSampleLevel(tex, tex_sampler, vec2f(uv.x + 2.0*x, uv.y - 2.0*y), 0.0).rgb;

    let j = textureSampleLevel(tex, tex_sampler, vec2f(uv.x - x, uv.y + y), 0.0).rgb;
    let k = textureSampleLevel(tex, tex_sampler, vec2f(uv.x + x, uv.y + y), 0.0).rgb;
    let l = textureSampleLevel(tex, tex_sampler, vec2f(uv.x - x, uv.y - y), 0.0).rgb;
    let m = textureSampleLevel(tex, tex_sampler, vec2f(uv.x + x, uv.y - y), 0.0).rgb;

    var outc = e * 0.125;
    outc += (a + c + g + i) * 0.03125;
    outc += (b + d + f + h) * 0.0625;
    outc += (j + k + l + m) * 0.125;

    // TODO: the is nans are a bandage, ideally we wouldnt need them
    if (length(outc) < bloomParams.threshold || isnan(outc.r) || isnan(outc.g) || isnan(outc.b))
    {
        outc = vec3f(0.0f);
    }

    return vec4f(outc, 1.0);
}
@fragment
fn upsample(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;

    let x = bloomParams.filterRadius;
    let y = bloomParams.filterRadius;

    let a = textureSampleLevel(tex, tex_sampler, vec2f(uv.x - x, uv.y + y), 0.0).rgb;
    let b = textureSampleLevel(tex, tex_sampler, vec2f(uv.x,     uv.y + y), 0.0).rgb;
    let c = textureSampleLevel(tex, tex_sampler, vec2f(uv.x + x, uv.y + y), 0.0).rgb;

    let d = textureSampleLevel(tex, tex_sampler, vec2f(uv.x - x, uv.y), 0.0).rgb;
    let e = textureSampleLevel(tex, tex_sampler, vec2f(uv.x,     uv.y), 0.0).rgb;
    let f = textureSampleLevel(tex, tex_sampler, vec2f(uv.x + x, uv.y), 0.0).rgb;

    let g = textureSampleLevel(tex, tex_sampler, vec2f(uv.x - x, uv.y - y), 0.0).rgb;
    let h = textureSampleLevel(tex, tex_sampler, vec2f(uv.x,     uv.y - y), 0.0).rgb;
    let i = textureSampleLevel(tex, tex_sampler, vec2f(uv.x + x, uv.y - y), 0.0).rgb;

    var outc = e * 4.0;
    outc += (b + d + f + h) * 2.0;
    outc += (a + c + g + i);
    outc *= 1.0 / 16.0;

    return vec4f(outc, 1.0);
}