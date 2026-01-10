import { Layers } from "../Physics.js";

function parseMask(string)
{
    return string.split("|").map(s => s.trim()).filter(s => s.length > 0).reduce((mask, key) => mask | Layers[key], 0);
}

export class PhysicsComponent{
    constructor({
        type = "aabb",
        localMin = [-0.5, -0.5, -0.5],
        localMax = [ 0.5,  0.5,  0.5],
        isDynamic = false,
        layer = 1 << 0,
        mask = ~0,
        trigger = null,
        triggerAction = null,
    } = {}) {
        this.parentEntity = null;
        this.type = type;
        this.localMin = localMin;
        this.localMax = localMax;
        this.isDynamic = isDynamic;
        this.layer = typeof layer === 'number' ? layer : Layers[layer.toUpperCase()];
        this.mask = typeof mask === 'number' ? mask : parseMask(mask);
        this.trigger = trigger;
        this.triggerAction = triggerAction;
    }
    
    onAttach(entity)
    {
        entity._bounds = this;
        this.parentEntity = entity;
    }

    onDetach(entity)
    {
        entity._bounds = undefined;
        this.parentEntity = null;
    }
}