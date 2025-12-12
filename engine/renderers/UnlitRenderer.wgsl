struct VertexInput {
    @location(0) position : vec3f,
    @location(1) normal : vec3f,
    @location(2) texcoords : vec2f,
    @location(3) joints : vec4u,
    @location(4) weights : vec4f,
}

struct InstanceInput {
    @location(5) row0: vec4f,
    @location(6) row1: vec4f,
    @location(7) row2: vec4f,
    @location(8) row3: vec4f,

    @location(9)  inv_row0: vec4f,
    @location(10) inv_row1: vec4f,
    @location(11) inv_row2: vec4f,
    @location(12) inv_row3: vec4f,

    @location(13) jointI: i32,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) worldPosition: vec4f,
    @location(1) texcoords: vec2f,
    @location(2) normal: vec3f,
}

struct CameraUniforms {
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

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var<storage, read> joints: array<Joint>;

@group(2) @binding(0) var albedoTexture: texture_2d<f32>;
@group(2) @binding(1) var albedoTextureSampler: sampler;
@group(2) @binding(2) var<uniform> material: Material;

@group(3) @binding(0) var envTexture: texture_cube<f32>;
@group(3) @binding(1) var envSampler: sampler;

@vertex
fn vertex(model: VertexInput, instance: InstanceInput) -> VertexOutput {
    let model_matrix = mat4x4<f32>( 
        instance.row0,
        instance.row1,
        instance.row2,
        instance.row3 
    );

    let inv_model_matrix = mat4x4<f32>( 
        instance.inv_row0,
        instance.inv_row1,
        instance.inv_row2,
        instance.inv_row3 
    );

    var position = vec4f(0.0, 0.0, 0.0, 1.0f);
    var normal = vec4f(0.0, 0.0, 0.0, 0.0);
    if (instance.jointI >= 0)
    {
        for (var i = 0u; i < 4u; i += 1u){
            let joint = joints[u32(instance.jointI) + model.joints[i]];
            let weight = model.weights[i];
            position += weight * (joint.m * vec4<f32>(model.position, 1.0f));
            normal += weight * (joint.m * vec4<f32>(model.normal, 0.0f));
        }
    }
    else {
        position = model_matrix * vec4(model.position, 1.0);
        normal = vec4f(model.normal, 0.0);
    }
    let worldNormal = normalize(normal.xyz);

    var output: VertexOutput;
    output.worldPosition = vec4(position.xyz, 1);
    output.position = camera.projectionMatrix * camera.viewMatrix * output.worldPosition;
    output.normal = (inv_model_matrix * vec4(worldNormal, 0.0)).xyz;
    output.texcoords = model.texcoords;
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
    let r = (roughness + 1.0);
    let k = (r * r) / 8.0;
    return normalDotView / ((normalDotView * (1.0) - k) + k);
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

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let world = input.worldPosition;
    var albedo = textureSample(albedoTexture, albedoTextureSampler, input.texcoords).rgb * material.albedo;
    let metallic = material.metallic;
    let roughness = material.roughness;
    let ao = material.ao;

    let view = normalize(camera.position.xyz - world.xyz);
    let normal = normalize(input.normal);

    let f0 = mix(vec3(0.04), albedo, metallic);

    var l0 = vec3(0.0);

    // for each light
    let lightPos = vec3(10.0, 10.0, 10.0);
    let lightColor = vec3(200.0);
    let toLight = lightPos - world.xyz;
    let light = normalize(toLight);
    let half = normalize(view + light);
    let distance = length(toLight);
    let attenuation = 1.0 / (distance * distance);
    let radiance = lightColor * attenuation;

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
    // end for each

    let ambient = vec3(0.03) * albedo * ao;
    var color = ambient + l0;
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0/2.2));

    let neki = vec4f(textureSample(envTexture, envSampler, world.xyz).rgb, 1.0);
    return vec4(color, 1.0);
}
