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
    @location(1) viewPosition: vec4f,
    @location(2) texcoords: vec2f,
    @location(3) normal: vec3f,
}

@group(0) @binding(0) var<uniform> camera: Camera;

@group(1) @binding(0) var<storage, read> joints: array<Joint>;

@group(2) @binding(0) var baseTexture: texture_2d<f32>;
@group(2) @binding(1) var baseTextureSampler: sampler;
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
        normal = inv_model_matrix * vec4f(model.normal, 0.0);
    }
    let worldNormal = normalize(normal.xyz);

    var output: VertexOutput;
    output.worldPosition = vec4(position.xyz, 1);
    output.viewPosition = camera.viewMatrix * output.worldPosition;
    output.position = camera.projectionMatrix * output.viewPosition;
    output.normal = worldNormal.xyz;
    output.texcoords = model.texcoords;
    return output;
}

@fragment
fn fragment(input: VertexOutput) -> DeferredOutput {
    let world = input.worldPosition;
    var base = textureSample(baseTexture, baseTextureSampler, input.texcoords).rgb * material.base;
    let normal = oct_encode(normalize(input.normal));
    let metallic = u32(material.metallic * 15.0 + 0.5);
    let wetness = u32(material.wetness * 15.0 + 0.5);
    let metallicWetness = f32((metallic << 4u) | wetness) / 255.0;
    var output: DeferredOutput;
    output.baseAndMetallicWetness = vec4f(base, metallicWetness);
    output.normalEmissionRoughness = vec4f(normal, material.emission, material.roughness);
    // output.subsurfaceSpecularSpecularTintClearcoat = vec4f(0.0);
    return output;
}