export class LightComponent {
    constructor({color = [1, 1, 1], intensity = 0.0, type = 'point', shadows = false }) {
        this.color = color;
        this.type = type;
        this.shadows = shadows;
        this.intensity = intensity  * 0.0003; // this factor is here cause blender doesnt export light intensity correctly, and so you can use the same values in code and in blender
    }
    
    onAttach(entity)
    {
        entity._light = this;
        entity._calculateInverse = true;
    }

    onDetach(entity)
    {
        entity._light = undefined;
    }
}