struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

struct BloomParams {
    srcResolution: vec2f,
    filterRadius: f32,
    threshold: f32,
    bloomStrength: f32,
}

struct Settings {
    passIndex: u32,
    bloomStrength: f32,
    bloomDirtStrength: f32,
    tonemapperIndex: u32,
    agxSlope: vec4f,
    agxPower: vec4f,
    agxSat: f32,
    blackAndWhite: u32,
}

const FULLSCREEN_QUAD_POSITIONS : array<vec2f, 6> = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),

    vec2f(-1.0, -1.0),
    vec2f( 1.0,  1.0),
    vec2f(-1.0,  1.0),
);

@group(0) @binding(0) var tex: texture_2d<f32>;
@group(1) @binding(0) var tex_sampler: sampler;
@group(1) @binding(1) var dirt_tex: texture_2d<f32>;
@group(1) @binding(2) var<uniform> settings: Settings;
@group(2) @binding(0) var bloom_tex: texture_2d<f32>;
@group(3) @binding(0) var<uniform> bloomParams: BloomParams;

@vertex
fn vertex(@builtin(vertex_index) v_index : u32) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4(FULLSCREEN_QUAD_POSITIONS[v_index], 0.0, 1.0);
    output.uv = output.position.xy * 0.5 + 0.5;
    output.uv.y = 1.0 - output.uv.y;
    return output;
}

fn reinhard(color: vec3f) -> vec3f
{
    return color / (color + vec3(1.0));
}

// AGX implementation adapted from https://www.shadertoy.com/view/cd3XWr
// gledu sm ce bi aces pa agx honestly zgleda bols
// myb bi lah khronos pbr 
fn agxDefaultContrastApprox(x: vec3f) -> vec3f {
    let x2 = x * x;
    let x4 = x2 * x2;
    return   15.5     * x4 * x2
            - 40.14    * x4 * x
            + 31.96    * x4
            - 6.868    * x2 * x
            + 0.4298   * x2
            + 0.1191   * x
            - 0.00232;
}

fn agx(input: vec3f) -> vec3f {
    var val = input;
    let agx_mat = mat3x3f(
        0.842479062253094,  0.0423282422610123, 0.0423756549057051,
        0.0784335999999992, 0.878468636469772,  0.0784336,
        0.0792237451477643, 0.0791661274605434, 0.879142973793104
    );

    let min_ev = vec3f(-12.47393f);
    let max_ev = vec3f(4.026069f);

    // Input transform
    val = agx_mat * val;

    // Log2 space encoding
    val = clamp(log2(val), min_ev, max_ev);
    val = (val - min_ev) / (max_ev - min_ev);

    // Apply sigmoid function approximation
    val = agxDefaultContrastApprox(val);

    return val;
}

fn agxEotf(input: vec3f) -> vec3f {
    var val = input;
    let agx_mat_inv = mat3x3f(
        1.19687900512017, -0.0528968517574562, -0.0529716355144438,
        -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
        -0.0990297440797205, -0.0989611768448433, 1.15107367264116
    );

    // Undo input transform
    val = agx_mat_inv * val;

    // sRGB IEC 61966-2-1 2.2 Exponent Reference EOTF Display
    //val = pow(val, vec3(2.2));

    return val;
}

fn agxLook(input: vec3f) -> vec3f {  
    var val = input;
    // Default
    let offset = vec3f(0.0);
    let slope = settings.agxSlope.xyz;
    let power = settings.agxPower.xyz;
    let sat = settings.agxSat;

    //  // Golden
    // // slope = vec3f(1.0, 0.9, 0.5);
    // // power = vec3f(0.8);
    // // sat = 0.8;

    // // Punchy
    // slope = vec3f(1.0);
    // power = vec3f(1.35, 1.35, 1.35);
    // sat = 1.4;

    // ASC CDL
    val = pow(val * slope + offset, power);

    let lw = vec3(0.2126, 0.7152, 0.0722);
    let luma = dot(val, lw);

    return luma + sat * (val - luma);
}

@fragment
fn tonemap(input: VertexOutput) -> @location(0) vec4<f32> {
    var uv = input.uv;
    let hdr = textureSample(tex, tex_sampler, uv).rgb;
    let bloom = textureSample(bloom_tex, tex_sampler, uv).rgb;
    let dirt = textureSample(dirt_tex, tex_sampler, uv).rgb * settings.bloomDirtStrength;
    let color = mix(hdr, bloom + bloom * dirt, settings.bloomStrength); 

    var tonemapped = color;
    if (settings.tonemapperIndex == 0)
    {
        tonemapped = reinhard(tonemapped);
    }
    else 
    {
        tonemapped = agx(tonemapped);
        tonemapped = agxLook(tonemapped);
        tonemapped = agxEotf(tonemapped);
    }

    let gammaCorrected = pow(tonemapped, vec3(1.0/2.2));

    if (settings.blackAndWhite > 0)
    {   
        return vec4(gammaCorrected.bbb, 1.0);
    }

    return vec4(gammaCorrected, 1.0f);
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

    if (length(outc) < bloomParams.threshold)
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