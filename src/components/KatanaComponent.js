import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';
import { World } from '../World.js';
import { Layers } from '../Physics.js';

export class KatanaComponent {
    constructor(entity, holder, player) {
        this.entity = entity;
        this.transform = this.entity.getComponentOfType(Transform);
        this.isAttacking = false;
        this.attackRange = 2.0; // Range of the katana swing
        this.tipOffset = glm.vec3.fromValues(0, 0, 1.5); // Local offset to the blade tip from the handle

        this.holder = holder; // The enemy holding the katana
        this.player = player; // The player entity  
    }

    startAttack() {
        this.isAttacking = true;
        setTimeout(() => {
            this.isAttacking = false;
            if(this.holder === this.player){
                this.player.skeleton.playAnimation(0); //Return to idle animation
            }
        }, 500); // Attack lasts 0.5 seconds
    }

    update() {
        if (!this.isAttacking) return;

        // Get world position of the katana handle
        const worldPos = this.transform.final_position;

        // Calculate the world position of the blade tip
        const tipWorld = glm.vec3.create();
        glm.vec3.transformMat4(tipWorld, this.tipOffset, this.transform.final);

        // Get the direction from handle to tip
        const direction = glm.vec3.create();
        glm.vec3.subtract(direction, tipWorld, worldPos);
        glm.vec3.normalize(direction, direction);

        // Calculate end position for raycast (extend beyond tip for better detection)
        const endPos = glm.vec3.create();
        glm.vec3.scaleAndAdd(endPos, worldPos, direction, this.attackRange);

        if(this.holder === this.player){
            console.log("Player katana attack...");
            const hitEnemy = World.physics.raycast(worldPos, endPos, World.scene, Layers.ENEMY);
            if (hitEnemy) {
                hitEnemy.entity._parent.hidden = true;
                console.log("Katana hit enemy");
                return;
            }
        }
        const hitPlayer = World.physics.raycast(worldPos, endPos, World.scene, Layers.PLAYER);
        if (hitPlayer) {
            console.log("Katana hit player");
            location.reload();
            this.isAttacking = false;
            return;
        }
    }
}
