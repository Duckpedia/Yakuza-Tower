export class Vertex {

    constructor({
        position = [0, 0, 0],
        texcoords = [0, 0],
        normal = [0, 0, 0],
        tangent = [0, 0, 0],
        joints = [0, 0, 0, 0],
        weights = [0, 0, 0, 0],
    } = {}) {
        this.position = position;
        this.texcoords = texcoords;
        this.normal = normal;
        this.tangent = tangent;
        this.joints = joints;
        this.weights = weights;
    }

}
