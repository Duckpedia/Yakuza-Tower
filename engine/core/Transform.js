import { mat4, vec3, quat } from '../../lib/glm.js';

export class Transform {
    constructor({
        rotation = quat.create(),
        translation = new vec3(),
        scale = new vec3(1, 1, 1),
        matrix,
    } = {}) {
        this._rotation = quat.create();
        this._translation = new vec3(0, 0, 0);
        this._scale = new vec3(1, 1, 1);

        this.rotation = rotation;
        this.translation = translation;
        this.scale = scale;

        this.final = new mat4();
        this.inv_final = new mat4();

        if (matrix) {
            this.matrix = matrix;
        }
    }

    // zacele so se tezave k dostkrat assignas neki.translation = [1, 2, 3]
    // tkoda to to resi !!
    get translation() {
        return this._translation;
    }
    set translation(v) {
        if (v.length < 3) throw new Error("fuck you");
        vec3.set(this._translation, v[0], v[1], v[2]);
    }

    get rotation() {
        return this._rotation;
    }
    set rotation(v) {
        if (v.length < 4) throw new Error("fuck you");
        quat.set(this._rotation, v[0], v[1], v[2], v[3]);
    }

    get scale() {
        return this._scale;
    }
    set scale(v) {
        if (v.length < 3) throw new Error("fuck you");
        vec3.set(this._scale, v[0], v[1], v[2]);
    }

    get final_position() {
        return this.final ? new vec3(this.final[12], this.final[13], this.final[14]) : new vec3(0.0);
    }

    get final_direction() {
        return this.final ? new vec3(
            this.final[8],
            this.final[9],
            this.final[10]
        ).normalize() : new vec3(0.0);
    }

    get final_rotation() {
        const rot = new quat();
        mat4.getRotation(rot, this.final);
        return rot;
    }

    get matrix() {
        return mat4.fromRotationTranslationScale(mat4.create(),
            this.rotation, this.translation, this.scale);
    }

    set matrix(matrix) {
        mat4.getRotation(this.rotation, matrix);
        mat4.getTranslation(this.translation, matrix);
        mat4.getScaling(this.scale, matrix);
    }

    onAttach(entity)
    {
        entity._transform = this;
    }

    onDetach(entity)
    {
        entity._transform = undefined;
    }
}
