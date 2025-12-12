export class Model {
    static i = 0;

    constructor({
        primitives = [],
    } = {}) {
        this.primitives = primitives;
        this.i = Model.i++;
    }

}
