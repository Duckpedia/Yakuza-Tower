struct Camera {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    position: vec4f,
}

struct Joint {
    m: mat4x4<f32>,
}

struct Material {
    albedo: vec3f,
    metallic: f32,
    roughness: f32,
    ao: f32,
}

struct Settings {
    passIndex: f32,
    bloomStrength: f32,
    bloomDirtStrength: f32,
    tonemapperIndex: f32,
    agxSlope: vec4f,
    agxPower: vec4f,
    agxSat: f32,
    blackAndWhite: u32,
    test: f32,
    ssao: u32,
    ssaoRadius: f32,
    ssaoBias: f32,
    ssaoMaxDelta: f32,
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

struct BloomParams {
    srcResolution: vec2f,
    filterRadius: f32,
    threshold: f32,
    bloomStrength: f32,
}

struct FullscreenVertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

struct DeferredOutput {
    @location(0) albedoAndMetallic : vec4f,
    @location(1) worldAndRoughness : vec4f,
    @location(2) normalAndDepth : vec4f,
}

const PI = 3.14159265359;

const FULLSCREEN_QUAD_POSITIONS : array<vec2f, 6> = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),

    vec2f(-1.0, -1.0),
    vec2f( 1.0,  1.0),
    vec2f(-1.0,  1.0),
);

const CUBE_POSITIONS : array<vec3f, 36> = array<vec3f, 36>(
    // +X face
    vec3f( 1.0, -1.0, -1.0),
    vec3f( 1.0,  1.0, -1.0),
    vec3f( 1.0,  1.0,  1.0),

    vec3f( 1.0, -1.0, -1.0),
    vec3f( 1.0,  1.0,  1.0),
    vec3f( 1.0, -1.0,  1.0),

    // -X face
    vec3f(-1.0, -1.0,  1.0),
    vec3f(-1.0,  1.0,  1.0),
    vec3f(-1.0,  1.0, -1.0),

    vec3f(-1.0, -1.0,  1.0),
    vec3f(-1.0,  1.0, -1.0),
    vec3f(-1.0, -1.0, -1.0),

    // +Y face
    vec3f(-1.0,  1.0, -1.0),
    vec3f(-1.0,  1.0,  1.0),
    vec3f( 1.0,  1.0,  1.0),

    vec3f(-1.0,  1.0, -1.0),
    vec3f( 1.0,  1.0,  1.0),
    vec3f( 1.0,  1.0, -1.0),

    // -Y face
    vec3f(-1.0, -1.0,  1.0),
    vec3f(-1.0, -1.0, -1.0),
    vec3f( 1.0, -1.0, -1.0),

    vec3f(-1.0, -1.0,  1.0),
    vec3f( 1.0, -1.0, -1.0),
    vec3f( 1.0, -1.0,  1.0),

    // +Z face
    vec3f(-1.0, -1.0,  1.0),
    vec3f( 1.0, -1.0,  1.0),
    vec3f( 1.0,  1.0,  1.0),

    vec3f(-1.0, -1.0,  1.0),
    vec3f( 1.0,  1.0,  1.0),
    vec3f(-1.0,  1.0,  1.0),

    // -Z face
    vec3f( 1.0, -1.0, -1.0),
    vec3f(-1.0, -1.0, -1.0),
    vec3f(-1.0,  1.0, -1.0),

    vec3f( 1.0, -1.0, -1.0),
    vec3f(-1.0,  1.0, -1.0),
    vec3f( 1.0,  1.0, -1.0),
);

fn positiveDot(a: vec3f, b: vec3f) -> f32
{
    return max(dot(a, b), 0.0f);
}

fn isnan(x: f32) -> bool {
  let highVal = 1000000.0f;
  let x2 = min(x, highVal);
  return x2 == highVal;
}

fn length2(v: vec3f) -> f32 {
    return v.x * v.x + v.y * v.y + v.z * v.z;
}

fn makeBasis(normal: vec3f) -> mat3x3<f32> {
  let a = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(normal.y) > 0.999);
  let right = normalize(cross(a, normal));
  let up = cross(normal, right);
  return mat3x3<f32>(right, up, normal);
}

// chatgpt idk
fn hash22(p: vec2f) -> vec2f {
    let p3 = fract(vec3f(p.xyx) * vec3f(0.1031, 0.1030, 0.0973));
    let d = dot(p3, p3.yzx + 33.33);
    return fract(vec2f(p3.x + p3.y, p3.y + p3.z) * (p3.z + d));
}

fn projectionToUV(projection: mat4x4f, view: mat4x4f, world: vec4f) -> vec4f
{
    let clip = projection * view * world;
    let ndc = clip.xyz / clip.w;
    return vec4(vec2(ndc.x, -ndc.y) * 0.5 + 0.5, ndc.z, 1.0);
}