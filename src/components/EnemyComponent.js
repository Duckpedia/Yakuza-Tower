import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';

export class EnemyComponent {

    constructor(entity) {
        this.entity = entity;
        this.transform = this.entity.getComponentOfType(Transform);
    }

    update(t, dt) {
        glm.quat.rotateY(this.transform.rotation, this.transform.rotation, dt * t * t * 0.1);
    }
}
