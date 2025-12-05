import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';

export class EnemyComponent {

    constructor(entity) {
        this.entity = entity;
        this.transform = this.entity.getComponentOfType(Transform);
        this.transform.scale = new glm.vec3(2);
        this.transform.translation[2] = -3.0;
    }

    update(t, dt) {
        this.transform.translation[1] = Math.sin(t) * 0.3 + Math.log(t) * 0.3;
        glm.quat.rotateY(this.transform.rotation, this.transform.rotation, dt * t * t * 0.1);
    }
}
