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
    @location(1) texcoords: vec2f,
    @location(2) normal: vec3f,
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
}

struct Joint {
    m: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var<storage, read> joints: array<Joint>;

@group(2) @binding(0) var baseTexture: texture_2d<f32>;
@group(2) @binding(1) var baseSampler: sampler;

@vertex
fn vertex(model: VertexInput, instance: InstanceInput) -> VertexOutput {
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
        normal = vec4f(model.normal, 0.0);
    }
    normal = normalize(normal);

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

    var output: VertexOutput;
    output.position = camera.projectionMatrix * camera.viewMatrix * model_matrix * vec4(position.xyz, 1);
    output.normal = normalize(inv_model_matrix * normal).xyz;
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
