export class Material {

    constructor({
        baseTexture,
        base = [1, 1, 1],
        metallic = 1.0,
        roughness = 1.0,
        emission = 0.0,
        // subsurface = 0.0,
        // specular = 0.5,
        // specularTint = 0.0,
        // clearcoat = 0.0,
    } = {}) {
        this.baseTexture = baseTexture;
        this.base = base;
        this.metallic = metallic;
        this.roughness = roughness;
        this.emission = emission;
        // this.subsurface = subsurface;
        // this.specular = specular;
        // this.specularTint = specularTint;
        // this.clearcoat = clearcoat;
    }

}
