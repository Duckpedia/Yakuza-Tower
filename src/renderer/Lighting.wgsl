@group(0) @binding(0) var<uniform> camera: Camera;

@group(1) @binding(0) var<uniform>                settings: Settings;
@group(1) @binding(1) var lightsDepthMaps:        texture_depth_2d_array;
@group(1) @binding(2) var lightsDepthMapsSampler: sampler_comparison;
@group(1) @binding(3) var irradianceMap:          texture_cube<f32>;
@group(1) @binding(4) var prefilteredMap:         texture_cube<f32>;
@group(1) @binding(5) var brdfConvolution:        texture_2d<f32>;
@group(1) @binding(6) var linearSampler:          sampler;

@group(2) @binding(0) var albedoAndMetallicTexture: texture_2d<f32>;
@group(2) @binding(1) var worldAndRoughnessTexture: texture_2d<f32>;
@group(2) @binding(2) var normalAndviewzTexture:    texture_2d<f32>;
@group(2) @binding(3) var fogTexture:               texture_2d<f32>;

@group(3) @binding(0) var<storage, read> lights: array<Light>;

// https://learnopengl.com/PBR/Theory
fn distributionGGX(normalDotHalf: f32, roughness: f32) -> f32
{
    let a2 = roughness * roughness * roughness * roughness;
    var denom = normalDotHalf * normalDotHalf * (a2 - 1.0f) + 1.0f;
    return a2 / (PI * denom * denom);
}

fn geometrySchlickGGX(normalDotView: f32 , roughness: f32) -> f32
{
    let r = roughness + 1.0f;
    let k = (r * r) / 8.0f;
    return normalDotView / (normalDotView * (1.0f - k) + k);
}

fn geometrySmith(normalDotView: f32, normalDotLight: f32, roughness: f32) -> f32
{
    return geometrySchlickGGX(normalDotView, roughness) * geometrySchlickGGX(normalDotLight, roughness);
}

fn fresnelSchlick(halfDotView: f32, f0: vec3f) -> vec3f
{
    return f0 + (1.0f - f0) * pow(clamp(1.0f - halfDotView, 0.0f, 1.0f), 5.0f);
}

fn fresnelSchlickRoughness(halfDotView: f32, f0: vec3f, roughness: f32) -> vec3f
{
    return f0 + (max(vec3(1.0f - roughness), f0) - f0) * pow(clamp(1.0f - halfDotView, 0.0f, 1.0f), 5.0f);
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
    // TODO: bolsi pcf
    let tex_d = 1.0f / vec2f(resolution);
    for (var i = -1; i <= 1; i++) {
        for (var j = -1; j <= 1; j++) {
            let diff = vec2f(f32(i), f32(j)) * tex_d * 2.0f;
            avg_sampled_depth += textureSampleCompare(
                lightsDepthMaps,
                lightsDepthMapsSampler, 
                uv + diff,
                shadowIndex,
                ndc.z - 0.0001f
            );
        }
    }
    let sampled_depth = avg_sampled_depth / 9.0f;
    return select(sampled_depth, 1.0, any(ndc.xy < vec2(-1.0)) || any(ndc.xy > vec2(1.0)));
}

// learnopengl
fn calculateAO(world: vec3f, normal: vec3f, viewz: f32, uv: vec2f) -> f32
{
    let worldView = (camera.viewMatrix * vec4(world, 1.0)).xyz;
    let normalView = normalize((camera.viewMatrix * vec4(normal, 0.0)).xyz);

    let radius = settings.ssaoRadius;
    let bias = settings.ssaoBias;
    let maxDelta = settings.ssaoMaxDelta;

    let randomVec = normalize(vec3(hash22(uv), 0.0));

    let tangent = normalize(randomVec - normalView * dot(randomVec, normalView));
    let bitangent = cross(normalView, tangent);
    let TBN = mat3x3(tangent, bitangent, normalView);

    var occlusion = 0.0;
    for (var i = 0; i < 64; i += 1)
    {
        let samplePos = worldView + (TBN * SSAO_KERNEL[i]) * radius; 
        
        var offset = camera.projectionMatrix * vec4(samplePos, 1.0);
        offset = offset / offset.w;
        offset.y = -offset.y;
        
        let sampleDepth = textureSample(normalAndviewzTexture, linearSampler, offset.xy * 0.5 + 0.5).w;
        let sampleDelta = max(sampleDepth - samplePos.z, 0.0); 
        let depthDelta = abs(viewz - sampleDepth); 
        if (sampleDelta >= bias && depthDelta < maxDelta)
        {
            occlusion += smoothstep(0.0, 1.0, radius / depthDelta);
        }
    }

    return 1.0 - (occlusion / 64.0);
}

// learnopengl
fn PBR(albedo: vec3f, world: vec3f, normal: vec3f, metallic: f32, roughness: f32, viewz: f32, uv : vec2f) -> vec3f
{
    let view = normalize(camera.position.xyz - world.xyz);
    let normalDotView = positiveDot(normal, view);
    let f0 = mix(vec3(0.04), albedo, metallic);
    var l0 = vec3(0.0);

    let nLights = arrayLength(&lights);
    for (var i = 0u; i < nLights; i++) {
        let light = lights[i];
        let toLight = light.position - world.xyz;
        let l = normalize(toLight);
        let shadow = calculateShadow(light, world);
        
        // cone check
        var d = clamp(dot(light.direction, l), -1.0, 1.0);
        if (d > light.outerAngle)
        {
            let half = normalize(view + l);
            let normalDotLight = positiveDot(normal, l);
            let normalDotHalf = positiveDot(normal, half);

            var attenuation = select(1.0f, 1.0f / length2(toLight), light.falloff > 0);

            let ndf = distributionGGX(normalDotHalf, roughness);
            let g = geometrySmith(normalDotView, normalDotLight, roughness);
            let f = fresnelSchlick(positiveDot(half, view), f0);
            let specular = (ndf * g * f) / (4.0f * normalDotView * normalDotLight + 0.0001f);

            let kd = (vec3(1.0f) - f) * (1.0f - metallic);

            let radiance = light.color * light.intensity * attenuation;
            
            d = clamp((d - light.outerAngle) / (light.innerAngle - light.outerAngle), 0.0, 1.0);
            l0 += (kd * albedo / PI + specular) * radiance * normalDotLight * shadow * d;
        }
    }
    
    let ao = select(calculateAO(world, normal, viewz, uv), 1.0, settings.ssao == 0);
    let f = fresnelSchlickRoughness(normalDotView, f0, roughness); 
    let reflected = reflect(-view, normal);
    let prefiltered = textureSampleLevel(prefilteredMap, linearSampler, reflected, roughness * 8).rgb; 
    let brdf = textureSample(brdfConvolution, linearSampler, vec2(normalDotView, roughness)).rg;
    let specular = prefiltered * (f * brdf.x + brdf.y);
    let irradiance = textureSample(irradianceMap, linearSampler, normal).rgb;
    let ks = f;
    let kd = 1.0 - ks;
    let diffuse = irradiance * albedo;
    let ambient = (kd * diffuse + specular) * ao; 

    return ambient + l0;
}

@fragment
fn fragment(input: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let loc = vec2i(input.uv * vec2f(textureDimensions(albedoAndMetallicTexture)));
    let albedoAndMetallic     = textureLoad(albedoAndMetallicTexture, loc, 0);
    let worldAndRoughness     = textureLoad(worldAndRoughnessTexture, loc, 0);
    let normalAndviewz        = textureLoad(normalAndviewzTexture, loc, 0);
    let fogScatterAndTransmit = textureSample(fogTexture, linearSampler, input.uv);
    let albedo    = albedoAndMetallic.xyz;
    let world     = worldAndRoughness.xyz;
    let normal    = normalize(normalAndviewz.xyz);
    let metallic  = albedoAndMetallic.w;
    let roughness = worldAndRoughness.w;
    let viewz     = normalAndviewz.w;

    if (settings.passIndex >= 5.0) {
        return vec4(vec3(roughness), 1.0);
    }
    else if (settings.passIndex >= 4.0) {
        return vec4(world, 1.0);
    }
    else if (settings.passIndex >= 3.0) {
        return vec4(normal, 1.0);
    }
    else if (settings.passIndex >= 2.0) {
        return vec4(vec3(metallic), 1.0);
    }
    else if (settings.passIndex >= 1.0) {
        return vec4(albedo, 1.0);
    }

    let is_skybox = roughness < 0.0;
    let material = select(
        PBR(albedo, world, normal, metallic, roughness, viewz, input.uv),
        albedo,
        is_skybox
    );
    
    let color = fogScatterAndTransmit.rgb + material * fogScatterAndTransmit.w;
    return vec4(color, 1.0);
}