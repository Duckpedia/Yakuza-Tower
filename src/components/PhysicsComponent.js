import { Layers } from "../Physics.js";

export class PhysicsComponent{
    constructor({
        type = "aabb",
        localMin = [-0.5, -0.5, -0.5],
        localMax = [ 0.5,  0.5,  0.5],
        isDynamic = false,
        layer = 1 << 0,
        mask = ~0,
    } = {}) {
        this.type = type;
        this.localMin = localMin;
        this.localMax = localMax;
        this.isDynamic = isDynamic;
        this.layer = typeof layer === 'number' ? layer : Layers[layer.toUpperCase()];
        this.mask = mask;
    }
    
    onAttach(entity)
    {
        entity._bounds = this;
    }

    onDetach(entity)
    {
        entity._bounds = undefined;
    }
}