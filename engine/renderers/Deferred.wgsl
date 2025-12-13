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

struct Output {
    @location(0) colorAndMetallic : vec4f,
    @location(1) positionAndRoughness : vec4f,
    @location(2) normal : vec4f,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var<storage, read> joints: array<Joint>;

@group(2) @binding(0) var albedoTexture: texture_2d<f32>;
@group(2) @binding(1) var albedoTextureSampler: sampler;
@group(2) @binding(2) var<uniform> material: Material;

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

@fragment
fn fragment(input: VertexOutput) -> Output {
    let world = input.worldPosition;
    var albedo = textureSample(albedoTexture, albedoTextureSampler, input.texcoords).rgb * material.albedo;
    let normal = normalize(input.normal);
    var output: Output;
    output.colorAndMetallic = vec4f(albedo, material.metallic);
    output.positionAndRoughness = vec4f(world.xyz, material.roughness);
    output.normal = vec4f(normal, 0.0);
    return output;
}