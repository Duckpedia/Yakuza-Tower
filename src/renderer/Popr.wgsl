struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

@group(0) @binding(0) var tex: texture_2d<f32>;

@group(1) @binding(0) var tex_sampler: sampler;
@group(1) @binding(1) var<uniform> settings: Settings;
@group(1) @binding(2) var dirt_tex: texture_2d<f32>;

@group(2) @binding(0) var bloom_tex: texture_2d<f32>;

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
    var bloom = textureSample(bloom_tex, tex_sampler, uv).rgb;
    let dirt = textureSample(dirt_tex, tex_sampler, uv).rgb;
    bloom += bloom * dirt * settings.bloomDirtStrength;
    let color = hdr + bloom * settings.bloomStrength; 

    var tonemapped = color;
    if (settings.tonemapperIndex >= 2.0)
    {
        tonemapped = agx(tonemapped);
        tonemapped = agxLook(tonemapped);
        tonemapped = agxEotf(tonemapped);
    }
    else if (settings.tonemapperIndex > 1.0)
    {
        tonemapped = reinhard(tonemapped);
    }

    return vec4(tonemapped, 1.0);
}

@fragment
fn popr(input: VertexOutput) -> @location(0) vec4<f32> {
    let resolution = vec2f(textureDimensions(tex).xy);
    let aspect = resolution.x / resolution.y;
    var uv = input.uv;

    let ndc = uv * 2.0 - 1.0;
    let uvDist = length(ndc);
    var color = vec3(0.0);

    { // chromatic abberation
        let diff = settings.chromaticAbberation / resolution * uvDist;
        color = vec3(
            textureSample(tex, tex_sampler, uv + diff).r,
            textureSample(tex, tex_sampler, uv).g,
            textureSample(tex, tex_sampler, uv - diff).b
        );
    }
    
    { // vignette
        let v = smoothstep(settings.vignetteRadius, settings.vignetteRadius - settings.vignetteSoftness, uvDist);
        color *= mix(1.0, v, saturate(settings.vignette));
    }

    { // scanlines
        let t = (uv.y * PI * resolution.y) * settings.scanlinesDensity * 0.5;
        let s = sin(t + settings.time * settings.scanlinesSpeed * resolution.y * settings.scanlinesDensity);
        color *= mix(1.0, s, saturate(settings.scanlines));
    }

    { // black and white
        let luma = dot(color, vec3f(0.2126, 0.7152, 0.0722));
        color = mix(color, vec3f(luma), settings.blackAndWhite);
    }

    var gammaCorrected = pow(color, vec3(1.0/2.2));
    return vec4(gammaCorrected, 1.0f);
}