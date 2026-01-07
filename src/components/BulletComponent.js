import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';
import { World } from '../World.js';


export class BulletComponent {
    constructor(entity, direction, speed = 4, lifetime = 2.0) {
        this.direction = glm.vec3.normalize(glm.vec3.create(), direction);
        this.speed = speed;
        this.lifetime = lifetime;
        this.entity = entity;
        this.transform = this.entity.getComponentOfType(Transform);

        const forward = glm.vec3.fromValues(0, 1, 0);
        const q = glm.quat.create();

        glm.quat.rotationTo(q, forward, this.direction);
        glm.quat.normalize(q, q);

        this.transform.rotation = q;

    }

    update() {
        let dt = World.getDt();

        glm.vec3.scaleAndAdd(
            this.transform.translation,
            this.transform.translation,
            this.direction,
            this.speed * dt
        );

        this.lifetime -= dt;
        if (this.lifetime <= 0) {
            this.entity.destroy?.();
        }
    }


  

}