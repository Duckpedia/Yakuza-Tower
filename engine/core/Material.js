export class Material {

    constructor({
        albedoTexture,
        // emissionTexture,
        // normalTexture,
        // occlusionTexture,
        // roughnessTexture,
        // metalnessTexture,

        albedoFactor = [1, 1, 1, 1],
        // emissionFactor = [0, 0, 0],
        // normalFactor = 1,
        aoFactor = 1,
        roughnessFactor = 1,
        metalnessFactor = 1,
    } = {}) {
        this.albedoTexture = albedoTexture;
        // this.emissionTexture = emissionTexture;
        // this.normalTexture = normalTexture;
        // this.occlusionTexture = occlusionTexture;
        // this.roughnessTexture = roughnessTexture;
        // this.metalnessTexture = metalnessTexture;

        this.albedoFactor = albedoFactor;
        // this.emissionFactor = emissionFactor;
        // this.normalFactor = normalFactor;
        this.aoFactor = aoFactor;
        this.roughnessFactor = roughnessFactor;
        this.metalnessFactor = metalnessFactor;
    }

}
