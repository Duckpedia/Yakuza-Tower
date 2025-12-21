import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';


export class BulletComponent {
    constructor(entity, direction, speed = 20, lifetime = 2.0) {
        this.direction = glm.vec3.normalize(glm.vec3.create(), direction);
        this.speed = speed;
        this.lifetime = lifetime;
        this.entity = entity;
    }

    update(t, dt) {
        const transform = this.entity.getComponentOfType(Transform);

        glm.vec3.scaleAndAdd(
            transform.translation,
            transform.translation,
            this.direction,
            this.speed * dt
        );

        this.lifetime -= dt;
        if (this.lifetime <= 0) {
            this.entity.destroy?.();
        }
    }


  

}