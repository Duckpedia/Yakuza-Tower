export class Model {
    static i = 0;

    constructor({
        primitives = [],
        primitivesByMaterial = [],
    } = {}) {
        this.primitives = primitives;
        this.primitivesByMaterial = primitivesByMaterial;
        this.i = Model.i++;
    }

    onAttach(entity)
    {
        entity._model = this;
    }

    onDetach(entity)
    {
        entity._model = undefined;
    }
}
