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
    @location(9) jointI: i32,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(1) texcoords: vec2f,
    @location(2) normal: vec3f,
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var<storage, read> joints: array<mat4x4<f32>>;

@group(2) @binding(0) var baseTexture: texture_2d<f32>;
@group(2) @binding(1) var baseSampler: sampler;

@vertex
fn vertex(model: VertexInput, instance: InstanceInput) -> VertexOutput {
    var position = vec4f(model.position, 1.0f);
    var normal = vec4f(model.normal, 1.0f);
    if (instance.jointI >= 0)
    {
        for (var i = 0u; i < 4u; i += 1u){
            let joint = joints[u32(instance.jointI) + model.joints[i]];
            let weight = model.weights[i];
            position += weight * (joint * vec4<f32>(model.position, 1.0f));
            normal += weight * (joint * vec4<f32>(model.normal, 0.0f));
        }
    }

    let model_matrix = mat4x4<f32>( 
        instance.row0,
        instance.row1,
        instance.row2,
        instance.row3 
    );

    var output: VertexOutput;
    output.position = camera.projectionMatrix * camera.viewMatrix * model_matrix * vec4(position.xyz, 1);
    output.normal = normalize(normal).xyz;
    output.texcoords = model.texcoords;
    return output;
}

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let textureColor = textureSample(baseTexture, baseSampler, input.texcoords).rgb;
    let d = max(dot(vec3(1.0, 1.0, 1.0), input.normal), 0.0);
    let ambient = vec3f(23, 26, 31) / 255.0;
    var color = textureColor * d + ambient;
    return vec4f(color, 1.0);
}
