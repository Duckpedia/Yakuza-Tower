export class LightComponent {
    constructor({color = [1, 1, 1], intensity = 0.0, type = 'point', shadows = false, innerAngle = -1.0, outerAngle = -1.0 }) {
        this.color = color;
        this.type = type;
        this.shadows = shadows;
        this.intensity = type === 'directional' ? intensity * 0.01 : intensity * 0.0003; // blender exports values in Watts and idk what that means
        this.innerAngle = innerAngle;
        this.outerAngle = outerAngle;
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