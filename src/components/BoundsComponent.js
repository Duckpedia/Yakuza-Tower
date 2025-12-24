export class BoundsComponent {
    constructor({isDynamic = false, layer = "uhmm", parentEntity = null, type = "aabb"} = {}) {
        this.isDynamic = isDynamic;
        this.layer = layer;
        this.type = type;
        this.parentEntity = parentEntity;
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