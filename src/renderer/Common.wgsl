struct Camera {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    inverseViewMatrix: mat4x4f,
    inverseProjectionMatrix: mat4x4f,
    position: vec4f,
}

struct Joint {
    m: mat4x4f,
}

struct Material {
    base: vec3f,
    metallic: f32,
    wetness: f32,
    roughness: f32,
    emission: f32,
    // subsurface: f32,
    // specular: f32,
    // specularTint: f32,
    // clearcoat: f32,
}

struct Settings {
    passIndex: f32,
    bloomStrength: f32,
    bloomDirtStrength: f32,
    tonemapperIndex: f32,

    agxSlope: vec4f,

    agxPower: vec4f,

    agxSat: f32,
    blackAndWhite: f32,
    test: f32,
    time: f32,

    ssao: u32,
    ssaoRadius: f32,
    ssaoBias: f32,
    ssaoMaxDelta: f32,

    fogStrength: f32,
    fogLightFactor: f32,
    fogSteps: f32,
    vignette: f32,

    vignetteRadius: f32,
    vignetteSoftness: f32,
    chromaticAbberation: vec2f,

    scanlines: f32,
    scanlinesDensity: f32,
    scanlinesSpeed: f32,
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
    @location(0) baseAndMetallicWetness : vec4f,
    @location(1) normalEmissionRoughness : vec4f,
    // @location(2) subsurfaceSpecularSpecularTintClearcoat : vec4f,
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

// generated 64 samples using:
// vec3(rfloat() * 2.0 - 1.0, rfloat() * 2.0 - 1.0, rfloat())
const SSAO_KERNEL: array<vec3f, 64> = array<vec3f, 64>(
  vec3f(0.018619433, 0.013945006, 0.011368042),
  vec3f(0.000849551, -0.007163221, 0.029529646),
  vec3f(-0.002577659, 0.009183868, 0.050010701),
  vec3f(-0.012201659, 0.014306953, 0.017292476),
  vec3f(0.050903747, 0.059977582, 0.050327602),
  vec3f(-0.025401316, 0.030750351, 0.060130058),
  vec3f(-0.004032910, -0.057806636, 0.031427610),
  vec3f(0.059329722, 0.067028778, 0.034261622),
  vec3f(-0.000807498, 0.001028399, 0.000924968),
  vec3f(0.036167247, -0.016655421, 0.067891979),
  vec3f(-0.022448521, -0.000288995, 0.019521017),
  vec3f(-0.029853403, 0.063272901, 0.016316205),
  vec3f(-0.023024307, 0.041183804, 0.035374479),
  vec3f(-0.102737618, -0.044063823, 0.062190551),
  vec3f(-0.057835975, 0.007584475, 0.052264341),
  vec3f(0.049138717, 0.006294732, 0.075304898),
  vec3f(0.016697240, -0.010483477, 0.056817385),
  vec3f(0.009536883, -0.026431940, 0.011937731),
  vec3f(0.005655198, 0.007855944, 0.011948217),
  vec3f(0.059944374, 0.087674379, 0.107435276),
  vec3f(0.045684791, 0.048542786, 0.031013136),
  vec3f(0.067709120, -0.074003141, 0.133850730),
  vec3f(0.075702630, 0.017208899, 0.091003300),
  vec3f(-0.018649375, 0.060450323, 0.187912153),
  vec3f(0.054308487, -0.077322713, 0.056727715),
  vec3f(0.058185852, 0.154276166, 0.054327790),
  vec3f(-0.051158557, -0.037352093, 0.053086131),
  vec3f(0.111465434, -0.140919945, 0.025820254),
  vec3f(-0.102145741, 0.016591175, 0.102200113),
  vec3f(0.052159475, -0.136703944, 0.091703364),
  vec3f(0.097378075, -0.139478698, 0.237275285),
  vec3f(-0.032485862, -0.033519809, 0.033670614),
  vec3f(-0.184456666, -0.141944710, 0.196358877),
  vec3f(-0.086657059, -0.013506743, 0.009215622),
  vec3f(-0.049386859, 0.025991979, 0.030984478),
  vec3f(0.002862973, -0.362641097, 0.039726984),
  vec3f(-0.196239861, -0.092325370, 0.238768527),
  vec3f(0.257131788, -0.203118484, 0.206648369),
  vec3f(-0.099191102, 0.039546751, 0.094873601),
  vec3f(-0.054531857, 0.021171064, 0.048373407),
  vec3f(-0.021734884, -0.069012316, 0.217969701),
  vec3f(-0.046167777, -0.034976661, 0.102551402),
  vec3f(0.016125749, -0.129740939, 0.098666656),
  vec3f(-0.422818040, -0.203930962, 0.111744095),
  vec3f(-0.233547243, -0.335244233, 0.283846281),
  vec3f(0.070575085, 0.063888942, 0.188806384),
  vec3f(-0.053614335, 0.094491861, 0.000477438),
  vec3f(-0.082719465, -0.130166622, 0.159196486),
  vec3f(0.210866831, 0.038279112, 0.116381352),
  vec3f(0.014951465, -0.006057747, 0.024527615),
  vec3f(-0.072228761, -0.318233081, 0.104208254),
  vec3f(-0.019738832, 0.095180112, 0.585515933),
  vec3f(-0.010149633, -0.352118111, 0.437372773),
  vec3f(0.540791906, 0.450517625, 0.135553534),
  vec3f(0.171220458, -0.535875176, 0.466717661),
  vec3f(-0.062165794, 0.113028802, 0.100095572),
  vec3f(0.132994054, -0.304538115, 0.251740060),
  vec3f(-0.445355283, -0.421970553, 0.359451181),
  vec3f(-0.298010559, 0.648142697, 0.067846731),
  vec3f(-0.089426809, -0.362415856, 0.118905485),
  vec3f(0.288936406, 0.357150868, 0.065933251),
  vec3f(0.079265544, -0.080403009, 0.229165928),
  vec3f(-0.339712949, -0.324126117, 0.240269095),
  vec3f(0.023565590, 0.023140000, 0.024010143)
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

fn makeBasis(normal: vec3f) -> mat3x3f {
  let a = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(normal.y) > 0.999);
  let right = normalize(cross(a, normal));
  let up = cross(normal, right);
  return mat3x3f(right, up, normal);
}

fn pcg_hash_u32(x: u32) -> u32 {
    var state = x * 747796405u + 2891336453u;
    var word  = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn pcg_float(x: f32) -> f32 {
    let h = pcg_hash_u32(u32(x * 16777216.0));
    return f32(h >> 8u) * (1.0 / 16777216.0);
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

// https://knarkowicz.wordpress.com/2014/04/16/octahedron-normal-vector-encoding/
fn oct_wrap(v: vec2f) -> vec2f {
    return (1.0 - abs(v.yx)) * (select(vec2(-1.0), vec2(1.0), v.xy >= vec2(0.0))); 
}

fn oct_encode(n_in: vec3f) -> vec2f {
    var n = n_in;
    n /= abs(n.x) + abs(n.y) + abs(n.z);
    return select(oct_wrap(n.xy), n.xy, n.z >= 0.0) * 0.5 + 0.5;
}

fn oct_decode(f_in: vec2f) -> vec3f {
    var f = f_in * 2.0 - 1.0;

    var n = vec3f(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
    let t = clamp(-n.z, 0.0, 1.0);
 
    let add = select(vec2f( t), vec2f(-t), n.xy >= vec2f(0.0));
    return normalize(vec3f(n.xy + add, n.z));
}

fn recreateView(ndc: vec3f, inverseProjectionMatrix: mat4x4f) -> vec3f {
    let view = inverseProjectionMatrix * vec4(ndc, 1.0);
    return view.xyz / view.w;
}

fn recreateWorld(uv: vec2f, depth: f32, inverseViewProjectionMatrix: mat4x4f) -> vec3f {
    var ndc = vec3(uv.xy * 2.0 - 1.0, depth);
    let v = inverseViewProjectionMatrix * vec4(ndc.x, -ndc.y, ndc.z, 1.0);
    return v.xyz / v.w;
}