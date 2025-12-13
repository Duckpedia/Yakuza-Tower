struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(1) uv: vec2f,
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    position: vec4f,
}

struct Light {
    position: vec4f,
    emission: vec3f
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var gBufferAlbedo:   texture_2d<f32>;
@group(1) @binding(1) var gBufferPosWorld: texture_2d<f32>;
@group(1) @binding(2) var gBufferNormal:   texture_2d<f32>;

@group(2) @binding(0) var<storage, read> lights: array<Light>;

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
    output.uv.y = 1.0 - output.uv.y;
    return output;
}

fn positiveDot(a: vec3f, b: vec3f) -> f32
{
    return max(dot(a, b), 0.0);
}

fn distributionGGX(normal: vec3f, half: vec3f, roughness: f32) -> f32
{
    let a = roughness * roughness * roughness * roughness;
    let d = positiveDot(normal, half);
    var denom = d * d * (a - 1.0) + 1.0;
    return a / (3.14159265359 * denom * denom);
}

fn geometrySchlickGGX(normalDotView: f32 , roughness: f32) -> f32
{
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    return normalDotView / (normalDotView * (1.0 - k) + k);
}

fn geometrySmith(normal: vec3f, view: vec3f, light: vec3f, roughness: f32) -> f32
{
    let normalDotView = positiveDot(normal, view);
    let normalDotLight = positiveDot(normal, light);
    return geometrySchlickGGX(normalDotView, roughness) * geometrySchlickGGX(normalDotLight, roughness);
}

fn fresnelSchlick(halfDotView: f32, f0: vec3f) -> vec3f
{
    return f0 + (1.0 - f0) * pow(clamp(1.0 - halfDotView, 0.0, 1.0), 5.0);
}

fn isnan(x: f32) -> bool {
  let highVal = 1000000.0;
  let x2 = min(x, highVal);
  return x2 == highVal;
}

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let loc = vec2i(input.uv * vec2f(textureDimensions(gBufferAlbedo)));
    let albedoAndMetallic = textureLoad(gBufferAlbedo, loc, 0);
    let worldAndRoughness = textureLoad(gBufferPosWorld, loc, 0);
    let albedo = albedoAndMetallic.xyz;
    let world = worldAndRoughness.xyz;
    let normal = normalize(textureLoad(gBufferNormal, loc, 0).rgb);
    let metallic = albedoAndMetallic.w;
    let roughness = worldAndRoughness.w;
    let ao = 1.0;//material.ao;

    let view = normalize(camera.position.xyz - world.xyz);

    let f0 = mix(vec3(0.04), albedo, metallic);

    var l0 = vec3(0.0);

    let nLights = arrayLength(&lights);
    for (var i = 0u; i < nLights; i++) {
        let lightPosition = lights[i].position.xyz;
        let lightEmission = lights[i].emission.rgb;
        let toLight = lightPosition - world.xyz;
        let light = normalize(toLight);
        let half = normalize(view + light);
        let distance = length(toLight);
        let attenuation = 1.0 / (distance * distance);
        let radiance = lightEmission * attenuation;

        let ndf = distributionGGX(normal, half, roughness);
        let g = geometrySmith(normal, view, light, roughness);
        let f = fresnelSchlick(positiveDot(half, view), f0);

        let numerator = ndf * g * f;
        let denominator = 4.0 * positiveDot(normal, view) * positiveDot(normal, light) + 0.0001;
        let specular = numerator / denominator;

        let ks = f;
        let kd = (vec3(1.0) - ks) * (1.0 - metallic);

        let normalDotLight = positiveDot(normal, light);
        l0 += (kd * albedo / 3.14159265359 + specular) * radiance * normalDotLight;
    }

    let ambient = vec3(0.01) * albedo * ao;
    var color = ambient + l0;
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0/2.2));
    return vec4(color, 1.0);
}