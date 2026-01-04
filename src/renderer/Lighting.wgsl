@group(0) @binding(0) var<uniform> camera: Camera;

@group(1) @binding(0) var<uniform>                settings: Settings;
@group(1) @binding(1) var lightsDepthMaps:        texture_depth_2d_array;
@group(1) @binding(2) var lightsDepthMapsSampler: sampler_comparison;
@group(1) @binding(3) var irradianceMap:          texture_cube<f32>;
@group(1) @binding(4) var prefilteredMap:         texture_cube<f32>;
@group(1) @binding(5) var brdfConvolution:        texture_2d<f32>;
@group(1) @binding(6) var linearSampler:          sampler;

@group(2) @binding(0) var baseAndMetallicWetnessTexture:  texture_2d<f32>;
@group(2) @binding(1) var normalEmissionRoughnessTexture: texture_2d<f32>;
// @group(2) @binding(2) var subsurfaceSpecularSpecularTintClearcoatTexture: texture_2d<f32>;
@group(2) @binding(2) var fogTexture:                     texture_2d<f32>;
@group(2) @binding(3) var depthTexture:                   texture_depth_2d;

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
            let diff = vec2f(f32(i), f32(j)) * tex_d * 1.0f;
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
fn calculateAO(view: vec3f, normal: vec3f, ndc: vec3f) -> f32
{
    let normalView = normalize((camera.viewMatrix * vec4(normal, 0.0)).xyz);

    let radius = settings.ssaoRadius;
    let bias = settings.ssaoBias;
    let maxDelta = settings.ssaoMaxDelta;

    let randomVec = normalize(vec3(hash22(ndc.xy * 0.5 + 0.5), 0.0));
    let depthTextureDimensions = vec2f(textureDimensions(depthTexture));

    let tangent = normalize(randomVec - normalView * dot(randomVec, normalView));
    let bitangent = cross(normalView, tangent);
    let TBN = mat3x3(tangent, bitangent, normalView);

    var occlusion = 0.0;
    for (var i = 0; i < 64; i += 1)
    {
        let samplePos = view + (TBN * SSAO_KERNEL[i]) * radius; 
        
        var offset = camera.projectionMatrix * vec4(samplePos, 1.0);
        offset = offset / offset.w;
        offset.y = -offset.y;

        let depthLoc = vec2i((offset.xy * 0.5 + 0.5) * depthTextureDimensions); 
        let sampleDepth = textureLoad(depthTexture, depthLoc, 0);
        let sampleDelta = max(sampleDepth - samplePos.z, 0.0); 
        let depthDelta = abs(view.z - sampleDepth); 
        if (sampleDelta >= bias && depthDelta < maxDelta)
        {
            occlusion += smoothstep(0.0, 1.0, radius / depthDelta);
        }
    }

    return 1.0 - (occlusion / 64.0);
}

// learnopengl
fn PBR(world: vec3f, viewPos: vec3f, normal: vec3f, material: Material, ndc: vec3f, uv : vec2f) -> vec3f
{
    let base = material.base;
    let metallic = material.metallic;
    let roughness = material.roughness;
    let coatRoughness = clamp(mix(material.roughness, 0.04, material.wetness), 0.02, 1.0);
    let coatF0 = vec3(0.04);
    // let subsurface = material.subsurface;
    // let specular = material.specular;
    // let specularTint = material.specularTint;
    // let clearcoat = material.clearcoat;

    let view = normalize(camera.position.xyz - world.xyz);
    let normalDotView = positiveDot(normal, view);
    let f0 = mix(vec3(0.04), base, metallic);
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
            let halfDotView = positiveDot(half, view);

            let baseNdf = distributionGGX(normalDotHalf, roughness);
            let baseG = geometrySmith(normalDotView, normalDotLight, roughness);
            let baseF = fresnelSchlick(halfDotView, f0);
            let baseSpec = (baseNdf * baseG * baseF) / (4.0f * normalDotView * normalDotLight + 0.0001f);
            let baseDiffuse = (vec3(1.0f) - baseF) * (1.0f - metallic);

            let coatNdf = distributionGGX(normalDotHalf, coatRoughness);
            let coatG = geometrySmith(normalDotView, normalDotLight, coatRoughness);
            let coatF = fresnelSchlick(halfDotView, coatF0);
            let coatSpec = (coatNdf * coatG * coatF) / (4.0f * normalDotView * normalDotLight + 0.0001f);

            let direct = baseDiffuse * base / PI + baseSpec + material.wetness * coatSpec;

            var attenuation = select(1.0f, 1.0f / length2(toLight), light.falloff > 0);
            let radiance = light.color * light.intensity * attenuation;
            
            d = clamp((d - light.outerAngle) / (light.innerAngle - light.outerAngle), 0.0, 1.0);
            l0 += direct * radiance * normalDotLight * shadow * d;
        }
    }

    let ao = select(calculateAO(viewPos, normal, ndc), 1.0, settings.ssao == 0);

    let reflected = reflect(-view, normal);

    // base ibl   
    let baseF = fresnelSchlickRoughness(normalDotView, f0, roughness); 
    let basePrefilter = textureSampleLevel(prefilteredMap, linearSampler, reflected, roughness * 6).rgb; 
    let baseBrdf = textureSample(brdfConvolution, linearSampler, vec2(normalDotView, roughness)).rg;
    let baseSpec = basePrefilter * (baseF * baseBrdf.x + baseBrdf.y);
    let irradiance = textureSample(irradianceMap, linearSampler, normal).rgb;
    let kd = 1.0 - baseF;
    let diffuse = irradiance * base;

    // // coat ibl
    // let coatF = fresnelSchlickRoughness(normalDotView, f0, coatRoughness); 
    // let coatPrefilter = textureSampleLevel(prefilteredMap, linearSampler, reflected, coatRoughness * 8).rgb; 
    // let coatBrdf = textureSample(brdfConvolution, linearSampler, vec2(normalDotView, coatRoughness)).rg;
    // let coatSpec = coatPrefilter * (coatF * coatBrdf.x + coatBrdf.y);
    
    let ambient = 
    (
        select(vec3(0.0), kd * diffuse + baseSpec, settings.environment > 0.0) + 
        0.0// material.wetness * coatSpec
    ) * ao; 

    return ambient + l0 + material.base * material.emission;
}

@fragment
fn fragment(input: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let loc = vec2i(input.uv * vec2f(textureDimensions(baseAndMetallicWetnessTexture)));
    let baseAndMetallicWetness  = textureLoad(baseAndMetallicWetnessTexture, loc, 0);
    let normalEmissionRoughness = textureLoad(normalEmissionRoughnessTexture, loc, 0);
    // let subsurfaceSpecularSpecularTintClearcoat = textureLoad(subsurfaceSpecularSpecularTintClearcoatTexture, loc, 0);
    let fogScatterAndTransmit = textureSample(fogTexture, linearSampler, input.uv);
    let depth                 = textureLoad(depthTexture, loc, 0);
    let normal                = normalize(oct_decode(normalEmissionRoughness.xy));

    var ndc = vec3(input.uv.xy * 2.0 - 1.0, depth);
    ndc.y = -ndc.y;
    let view = recreateView(ndc, camera.inverseProjectionMatrix);
    let world = (camera.inverseViewMatrix * vec4(view, 1.0)).xyz;

    let packedMetallicWetness = u32(baseAndMetallicWetness.w * 255.0 + 0.5);

    var material: Material;
    material.base         = baseAndMetallicWetness.xyz;
    material.metallic     = f32(packedMetallicWetness >> 4u) / 15.0;
    material.wetness      = f32(packedMetallicWetness & 0xf) / 15.0;
    material.emission     = normalEmissionRoughness.z;
    material.roughness    = normalEmissionRoughness.w;
    // material.subsurface   = subsurfaceSpecularSpecularTintClearcoat.r;
    // material.specular     = subsurfaceSpecularSpecularTintClearcoat.g;
    // material.specularTint = subsurfaceSpecularSpecularTintClearcoat.b;
    // material.clearcoat    = subsurfaceSpecularSpecularTintClearcoat.a;

    if (settings.passIndex >= 7.0) {
        return vec4(vec3(material.wetness), 1.0);
    }
    else if (settings.passIndex >= 6.0) {
        return vec4(vec3((depth - 0.99) * 50.0), 1.0);
    }
    else if (settings.passIndex >= 5.0) {
        return vec4(vec3(material.roughness), 1.0);
    }
    else if (settings.passIndex >= 4.0) {
        return vec4(world, 1.0);
    }
    else if (settings.passIndex >= 3.0) {
        return vec4(normal, 1.0);
    }
    else if (settings.passIndex >= 2.0) {
        return vec4(vec3(material.metallic), 1.0);
    }
    else if (settings.passIndex >= 1.0) {
        return vec4(material.base, 1.0);
    }

    let is_skybox = material.roughness < 0.0;
    let surface = select(
        PBR(world, view, normal, material, ndc, input.uv),
        material.base,
        is_skybox
    );
    
    let color = fogScatterAndTransmit.rgb + surface * fogScatterAndTransmit.w;
    return vec4(color, 1.0);
}