struct Fog {
    scatter: vec3f,
    transmit: f32
}

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

@group(3) @binding(0) var<storage, read> lights: array<Light>;

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

// https://learnopengl.com/PBR/Theory
fn distributionGGX(normal: vec3f, half: vec3f, roughness: f32) -> f32
{
    let a = roughness * roughness * roughness * roughness;
    let d = positiveDot(normal, half);
    var denom = d * d * (a - 1.0f) + 1.0f;
    return a / (3.14159265359f * denom * denom);
}

fn geometrySchlickGGX(normalDotView: f32 , roughness: f32) -> f32
{
    let r = roughness + 1.0f;
    let k = (r * r) / 8.0f;
    return normalDotView / (normalDotView * (1.0f - k) + k);
}

fn geometrySmith(normal: vec3f, view: vec3f, light: vec3f, roughness: f32) -> f32
{
    let normalDotView = positiveDot(normal, view);
    let normalDotLight = positiveDot(normal, light);
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
    let tex_d = 1.0f / vec2f(resolution);
    for (var i = -1; i <= 1; i++) {
        for (var j = -1; j <= 1; j++) {
            let diff = vec2f(f32(i), f32(j)) * tex_d * 2.0f;
            avg_sampled_depth += textureSampleCompare(
                lightsDepthMaps,
                lightsDepthMapsSampler, 
                uv + diff,
                shadowIndex,
                ndc.z - 0.00001f
            );
        }
    }
    var sampled_depth = avg_sampled_depth / 9.0f;

    if (any(ndc.xy < vec2(-1.0)) || any(ndc.xy > vec2(1.0)))
    {
        sampled_depth = 1.0f;
    }

    return sampled_depth;
}

// learnopengl je awesome
fn calculateAO(world: vec3f, normal: vec3f, viewz: f32, uv: vec2f) -> f32
{
    let kernelSize = 64;
    let radius = settings.ssaoRadius;
    let bias = settings.ssaoBias;
    let maxDelta = settings.ssaoMaxDelta;

    let randomVec = normalize(vec3(hash22(uv), 0.0));

    let worldView = (camera.viewMatrix * vec4(world, 1.0)).xyz;
    let normalView = normalize((camera.viewMatrix * vec4(normal, 0.0)).xyz);

    let tangent = normalize(randomVec - normalView * dot(randomVec, normalView));
    let bitangent = cross(normalView, tangent);
    let TBN = mat3x3(tangent, bitangent, normalView);

    var occlusion = 0.0;
    for(var i = 0; i < kernelSize; i += 1)
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

    return 1.0 - (occlusion / f32(kernelSize));
}

fn PBR(albedo: vec3f, world: vec3f, normal: vec3f, metallic: f32, roughness: f32, viewz: f32, uv : vec2f) -> vec3f
{
    let view = normalize(camera.position.xyz - world.xyz);
    let f0 = mix(vec3(0.04), albedo, metallic);
    var l0 = vec3(0.0);
    let reflected = reflect(-view, normal);

    let normalDotView = positiveDot(normal, view);

    let nLights = arrayLength(&lights);
    for (var i = 0u; i < nLights; i++) {
        let lightt = lights[i];
        let lightPosition = lightt.position.xyz;
        let lightColor = lightt.color;
        let lightIntensity = lightt.intensity;
        let toLight = lightPosition - world.xyz;
        let light = normalize(toLight);

        var attenuation = 1.0f;
        if (lightt.falloff > 0)
        {
            attenuation = 1.0f / length2(toLight);
        }
        let shadow = calculateShadow(lightt, world);
        
        // do calculation only if inside spotlight
        var d = clamp(dot(lightt.direction, light), -1.0, 1.0);
        if (d > lightt.outerAngle)
        {
            let normalDotLight = positiveDot(normal, light);
            let half = normalize(view + light);

            let ndf = distributionGGX(normal, half, roughness);
            let g = geometrySmith(normal, view, light, roughness);
            let f = fresnelSchlick(positiveDot(half, view), f0);

            let numerator = ndf * g * f;
            let denominator = 4.0f * normalDotView * normalDotLight + 0.0001f;
            let specular = numerator / denominator;

            let ks = f;
            let kd = (vec3(1.0f) - ks) * (1.0f - metallic);

            let radiance = lightColor * lightIntensity * attenuation;
            
            d = clamp((d - lightt.outerAngle) / (lightt.innerAngle - lightt.outerAngle), 0.0, 1.0);
            l0 += (kd * albedo / PI + specular) * radiance * normalDotLight * shadow * d;
        }
    }

    let ao = select(calculateAO(world, normal, viewz, uv), 1.0, settings.ssao == 0);

    let f = fresnelSchlickRoughness(normalDotView, f0, roughness); 
    let prefiltered = textureSampleLevel(prefilteredMap, linearSampler, reflected, roughness * 8).rgb; 
    let brdf = textureSample(brdfConvolution, linearSampler, vec2(normalDotView, roughness)).rg;
    let specular = prefiltered * (f * brdf.x + brdf.y);
    let irradiance = textureSample(irradianceMap, linearSampler, normal).rgb;
    let ks = f;
    let kd = 1.0 - ks;
    let diffuse = irradiance * albedo;
    let ambient = (kd * diffuse + specular) * ao; 

    var color = ambient + l0;

    return color;
}

fn calculateFog(world: vec3f) -> Fog {
    var fog: Fog;
    fog.scatter = vec3f(0.0);
    fog.transmit = 1.0;
    return fog;

    let toSurface = world - camera.position.xyz;
    let distance = length(toSurface);
    // if (distance <= 1e-4) {
    //     return fog;
    // }

    let rayDir = toSurface / distance;

    let steps = 40;
    let dt = distance / f32(steps);

    // You’ll want jitter (blue noise) + temporal accumulation later; keep deterministic for now.
    var t = 0.0;

    let phase = 0.07957747154594767;
    let irradiance = textureSample(irradianceMap, linearSampler, rayDir).rgb;

    for (var s = 0; s < steps; s++) {
        // Midpoint sampling
        let tMid = t + 0.5 * dt;
        let p = camera.position.xyz + rayDir * tMid;

        let rho = 0.0;
        let sigmaT = rho;
        let sigmaS = rho * 0.85;

        // transmit over this segment
        let segmentTr = exp(-sigmaT * dt);

        // Incoming light at p (expensive: loops lights + shadows)
        var Li = vec3(0.0);//sampleLightingForFog(p);
        let nLights = arrayLength(&lights);
        for (var i = 0u; i < nLights; i++) {
            let lightt = lights[i];
            let lightPosition = lightt.position.xyz;
            let lightColor = lightt.color;
            let lightIntensity = lightt.intensity;
            let toLight = lightPosition - p.xyz;
            let light = normalize(toLight);

            var attenuation = 1.0f;
            if (lightt.falloff > 0)
            {
                attenuation = 1.0f / length2(toLight);
            }
            // let shadow = calculateShadow(lightt, p);
            
            // do calculation only if inside spotlight
            var d = clamp(dot(lightt.direction, light), -1.0, 1.0);
            if (d > lightt.outerAngle)
            {
                Li += lightColor * lightIntensity * 1000 * attenuation;
            }
        }

        // In-scattering contribution over the segment:
        // dL ≈ Tr(current) * sigmaS * Li * phase * dt
        fog.scatter += fog.transmit * (sigmaS * dt) * ((Li * phase) + irradiance);

        // Update transmit
        fog.transmit *= segmentTr;

        // if (fog.transmit < 1e-3) {
        //     fog.transmit = 0.0;
        //     break;
        // }

        t += dt;
    }

    return fog;
}

@fragment
fn fragment(input: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let loc = vec2i(input.uv * vec2f(textureDimensions(albedoAndMetallicTexture)));
    let albedoAndMetallic = textureLoad(albedoAndMetallicTexture, loc, 0);
    let worldAndRoughness = textureLoad(worldAndRoughnessTexture, loc, 0);
    let normalAndviewz       = textureLoad(normalAndviewzTexture, loc, 0);
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

    // let fog = calculateFog(world);
    let material = 
    select(
        albedo,
        PBR(albedo, world, normal, metallic, roughness, viewz, input.uv),
        length2(normalAndviewz.xyz) > 0.0
    );
    
    // let color = fog.scatter + material * fog.transmit;
    let color = material;
    return vec4(color, 1.0);
}