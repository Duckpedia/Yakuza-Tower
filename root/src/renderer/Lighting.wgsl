struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(1) uv: vec2f,
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    position: vec4f,
}

 // wasteful but meh
struct Light {
    viewProjMatrix: mat4x4f,
    color: vec3f,
    intensity: f32,
    position: vec3f,
    shadowIndex: f32,
    direction: vec3f,
    falloff: u32,
    innerAngle: f32,
    outerAngle: f32
}

struct Settings {
    passIndex: f32,
    bloomStrength: f32,
    bloomDirtStrength: f32,
    blackAndWhite: u32
}

@group(0) @binding(0) var<uniform>         camera: CameraUniforms;

@group(1) @binding(0) var<uniform>         settings: Settings;
@group(1) @binding(1) var lightsDepthMaps: texture_depth_2d_array;
@group(1) @binding(2) var lightsDepthMapsSampler: sampler_comparison;

@group(2) @binding(0) var gBufferAlbedo:   texture_2d<f32>;
@group(2) @binding(1) var gBufferPosWorld: texture_2d<f32>;
@group(2) @binding(2) var gBufferNormal:   texture_2d<f32>;

@group(3) @binding(0) var<storage, read>   lights: array<Light>;

const FULLSCREEN_QUAD_POSITIONS : array<vec2f, 6> = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),

    vec2f(-1.0, -1.0),
    vec2f( 1.0,  1.0),
    vec2f(-1.0,  1.0),
);

@vertex
fn vertex(@builtin(vertex_index) v_index : u32) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4(FULLSCREEN_QUAD_POSITIONS[v_index], 0.0, 1.0);
    output.uv = output.position.xy * 0.5 + 0.5;
    output.uv.y = 1.0f - output.uv.y;
    return output;
}

fn positiveDot(a: vec3f, b: vec3f) -> f32
{
    return max(dot(a, b), 0.0f);
}

fn distributionGGX(normal: vec3f, half: vec3f, roughness: f32) -> f32
{
    let a = roughness * roughness * roughness * roughness;
    let d = positiveDot(normal, half);
    var denom = d * d * (a - 1.0f) + 1.0f;
    return a / (3.14159265359f * denom * denom);
}

fn geometrySchlickGGX(normalDotView: f32 , roughness: f32) -> f32
{
    let r = roughness + 1.0f;
    let k = (r * r) / 8.0f;
    return normalDotView / (normalDotView * (1.0f - k) + k);
}

fn geometrySmith(normal: vec3f, view: vec3f, light: vec3f, roughness: f32) -> f32
{
    let normalDotView = positiveDot(normal, view);
    let normalDotLight = positiveDot(normal, light);
    return geometrySchlickGGX(normalDotView, roughness) * geometrySchlickGGX(normalDotLight, roughness);
}

fn fresnelSchlick(halfDotView: f32, f0: vec3f) -> vec3f
{
    return f0 + (1.0f - f0) * pow(clamp(1.0f - halfDotView, 0.0f, 1.0f), 5.0f);
}

fn isnan(x: f32) -> bool {
  let highVal = 1000000.0f;
  let x2 = min(x, highVal);
  return x2 == highVal;
}

fn calculateShadow(light: Light, world: vec3f) -> f32
{
    let shadowIndex = i32(light.shadowIndex);
    if (shadowIndex < 0)
    {
        return 1.0f;
    }

    var shadow = 1.0;
    let clip = light.viewProjMatrix * vec4(world, 1.0f);
    var ndc = clip.xyz / clip.w;
    var uv = vec2(ndc.x, -ndc.y) * 0.5f + 0.5f;

    var avg_sampled_depth = 0.0;
    var resolution = textureDimensions(lightsDepthMaps);
    let tex_d = 1.0f / vec2f(resolution);
    for (var i = -1; i <= 1; i++) {
        for (var j = -1; j <= 1; j++) {
            let diff = vec2f(f32(i), f32(j)) * tex_d * 2.0f;
            avg_sampled_depth += textureSampleCompare(
                lightsDepthMaps,
                lightsDepthMapsSampler, 
                uv + diff,
                shadowIndex,
                ndc.z - 0.00001f
            );
        }
    }
    var sampled_depth = avg_sampled_depth / 9.0f;

    if (any(ndc.xy < vec2(-1.0)) || any(ndc.xy > vec2(1.0)))
    {
        sampled_depth = 1.0f;
    }

    return sampled_depth;
}

fn length2(v: vec3f) -> f32 {
    return v.x * v.x + v.y * v.y + v.z * v.z;
}

fn PBR(albedo: vec3f, world: vec3f, normal: vec3f, metallic: f32, roughness: f32, ao: f32, uv : vec2f) -> vec3f
{
    // PBR based on LearnOpenGl
    let view = normalize(camera.position.xyz - world.xyz);
    let f0 = mix(vec3(0.04), albedo, metallic);
    var l0 = vec3(0.0);
    let nLights = arrayLength(&lights);
    for (var i = 0u; i < nLights; i++) {
        let lightt = lights[i];
        let lightPosition = lightt.position.xyz;
        let lightColor = lightt.color;
        let lightIntensity = lightt.intensity;
        let toLight = lightPosition - world.xyz;
        let light = normalize(toLight);

        var attenuation = 1.0f;
        if (lightt.falloff > 0)
        {
            attenuation = 1.0f / length2(toLight);
        }
        let shadow = calculateShadow(lightt, world);
        
        // do calculation only if inside spotlight
        var d = clamp(dot(lightt.direction, light), -1.0, 1.0);
        if (d > lightt.outerAngle)
        {
            let half = normalize(view + light);

            let ndf = distributionGGX(normal, half, roughness);
            let g = geometrySmith(normal, view, light, roughness);
            let f = fresnelSchlick(positiveDot(half, view), f0);

            let numerator = ndf * g * f;
            let denominator = 4.0f * positiveDot(normal, view) * positiveDot(normal, light) + 0.0001f;
            let specular = numerator / denominator;

            let ks = f;
            let kd = (vec3(1.0f) - ks) * (1.0f - metallic);

            let radiance = lightColor * lightIntensity * attenuation;
            let normalDotLight = positiveDot(normal, light);
            
            d = clamp((d - lightt.outerAngle) / (lightt.innerAngle - lightt.outerAngle), 0.0, 1.0);
            d = d * d * d;
            l0 += (kd * albedo / 3.14159265359 + specular) * radiance * normalDotLight * shadow * d;
        }
    }

    let ambient = vec3(0.01) * albedo * ao;
    var color = ambient + l0;

    return color;
}

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let loc = vec2i(input.uv * vec2f(textureDimensions(gBufferAlbedo)));
    let albedoAndMetallic = textureLoad(gBufferAlbedo, loc, 0);
    let worldAndRoughness = textureLoad(gBufferPosWorld, loc, 0);
    let normal = normalize(textureLoad(gBufferNormal, loc, 0).rgb);
    let albedo = albedoAndMetallic.xyz;
    let world = worldAndRoughness.xyz;
    let metallic = albedoAndMetallic.w;
    let roughness = worldAndRoughness.w;
    let ao = 1.0;//material.ao;

    var color = PBR(albedo, world, normal, metallic, roughness, ao, input.uv);
    if (settings.passIndex == 1) {
        color = albedo;
    }
    else if (settings.passIndex == 2) {
        color = vec3(metallic);
    }
    else if (settings.passIndex == 3) {
        color = normal;
    }
    else if (settings.passIndex == 4) {
        color = world;
    }
    return vec4(color, 1.0);
}