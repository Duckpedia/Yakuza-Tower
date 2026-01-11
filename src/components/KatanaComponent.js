import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';
import { World } from '../World.js';
import { Layers } from '../Physics.js';

export class KatanaComponent {
    constructor(entity, holder, player) {
        this.entity = entity;
        this.transform = this.entity.getComponentOfType(Transform);
        this.isAttacking = false;
        this.attackRange = 2.0; 
        this.tipOffset = glm.vec3.fromValues(0, 0, 1.5); 

        this.holder = holder; // The enemy holding the katana
        this.player = player; // The player entity  
    }

    startAttack() {
        this.player.skeleton.playAnimation("Swing", "base", 0.3, { loop: false });
        this.isAttacking = true;
    }

    update(){
        if(!this.isAttacking) return;

        const worldPos = this.transform.final_position;

        const tipWorld = glm.vec3.create();
        glm.vec3.transformMat4(tipWorld, this.tipOffset, this.transform.final);

        const direction = glm.vec3.create();
        glm.vec3.subtract(direction, tipWorld, worldPos);
        glm.vec3.normalize(direction, direction);

        const endPos = glm.vec3.create();
        glm.vec3.scaleAndAdd(endPos, worldPos, direction, this.attackRange);

        if(this.holder === this.player){
            const hitEnemy = World.physics.raycast(
                worldPos,
                endPos,
                World.scene,
                Layers.ENEMY
            );

            if(hitEnemy){
                hitEnemy.entity._parent.hidden = true;
                this.isAttacking = false;
            }

            return;
        }

        const hitPlayer = World.physics.raycast(
            worldPos,
            endPos,
            World.scene,
            Layers.PLAYER
        );

        if(hitPlayer){
            World.loadStage = "tutorial";
            this.isAttacking = false;
        }
    }

}
