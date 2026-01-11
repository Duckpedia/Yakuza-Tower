import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';
import { World } from '../World.js';
import { Layers } from '../Physics.js';


export class BulletComponent {
    constructor(entity, direction, pool, speed = 4, lifetime = 2.0) {
        this.direction = glm.vec3.normalize(glm.vec3.create(), direction);
        this.speed = speed;
        this.lifetime = lifetime;
        this.entity = entity;
        this.transform = this.entity.getComponentOfType(Transform);
        this.pool = pool;

        const forward = glm.vec3.fromValues(0, 1, 0);
        const q = glm.quat.create();

        glm.quat.rotationTo(q, forward, this.direction);
        glm.quat.normalize(q, q);

        this.transform.rotation = q;

    }

    update() {
        let dt = World.getDt();

        const newPos = glm.vec3.create();
        glm.vec3.scaleAndAdd(newPos, this.transform.translation, this.direction, this.speed * dt);

        const hitEnemy = World.physics.raycast(this.transform.translation, newPos, World.scene, Layers.ENEMY);
        const hit = World.physics.raycast(this.transform.translation, newPos, World.scene, Layers.WORLD | Layers.PLAYER | Layers.ENEMY);
        const hitPlayer = World.physics.raycast(this.transform.translation, newPos, World.scene, Layers.PLAYER);
        if (hitPlayer && !hitPlayer.entity.invulnerable) {
            hitPlayer.entity.onCollision?.(this.entity);
            console.log("Bullet hit player");
            this.pool.returnBullet(this.entity);
            World.loadStage = "tutorial";
            return;
        }
        if (hitEnemy) {
            hitEnemy.entity.onCollision?.(this.entity);
            console.log("Bullet hit enemy");
            hitEnemy.entity._parent.hidden = true;
            console.log(hitEnemy.entity);
            this.pool.returnBullet(this.entity);
            return;
        }

        glm.vec3.copy(this.transform.translation, newPos);

        this.lifetime -= dt;
        if (this.lifetime <= 0) {
            this.pool.returnBullet(this.entity);
        }
    }


  

}