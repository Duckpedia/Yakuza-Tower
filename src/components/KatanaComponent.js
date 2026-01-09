import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';
import { World } from '../World.js';
import { Layers } from '../Physics.js';

export class KatanaComponent {
    constructor(entity) {
        this.entity = entity;
        this.transform = this.entity.getComponentOfType(Transform);
        this.isAttacking = false;
        this.attackRange = 2.0; // Range of the katana swing
        this.tipOffset = glm.vec3.fromValues(0, 0, 1.5); // Local offset to the blade tip from the handle
    }

    startAttack() {
        this.isAttacking = true;
        setTimeout(() => {
            this.isAttacking = false;
        }, 500); // Attack lasts 0.5 seconds
    }

    update() {
        if (!this.isAttacking) return;

        // Calculate the world position of the blade tip
        const tipLocal = glm.vec3.create();
        glm.vec3.transformQuat(tipLocal, this.tipOffset, this.transform.rotation);
        glm.vec3.add(tipLocal, tipLocal, this.transform.translation);

        // Get the direction from handle to tip
        const direction = glm.vec3.create();
        glm.vec3.subtract(direction, tipLocal, this.transform.translation);
        glm.vec3.normalize(direction, direction);

        // Calculate end position for raycast (extend beyond tip for better detection)
        const endPos = glm.vec3.create();
        glm.vec3.scaleAndAdd(endPos, this.transform.translation, direction, this.attackRange);

        // Check for enemy collision along the blade
        const hitEnemy = World.physics.raycast(this.transform.translation, endPos, World.scene, Layers.ENEMY);
        if (hitEnemy) {
            console.log("Katana hit enemy!");
            hitEnemy.entity._parent.hidden = true; // Simple way to "destroy" enemy
            this.isAttacking = false;
            return;
        }

        const hitPlayer = World.physics.raycast(this.transform.translation, endPos, World.scene, Layers.PLAYER);
        if (hitPlayer) {
            hitPlayer.entity.onCollision?.(this.entity);
            console.log("Katana hit player");
            this.isAttacking = false;
            return;
        }
    }
}
