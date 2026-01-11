import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';
import { BulletComponent } from './BulletComponent.js';
import { BulletPool } from './BulletPool.js';
import { World } from '../World.js';
import { Layers } from '../Physics.js';
import { PlayerComponent } from './PlayerComponent.js';
import { DeferredRenderer } from '../renderer/DeferredRenderer.js';
import { KatanaComponent } from './KatanaComponent.js';

export class EnemyComponent {
    constructor(entity, player, weapon = null, bulletPool = null, type = 'Melee') {
        this.entity = entity;
        this.transform = entity.getComponentOfType(Transform);
        this.player = player;
        const playerComp = this.player.getComponentOfType(PlayerComponent);

        this.speed = 3;
        this.attackRange = 1.2;
        this.rangedAttackRange = 5;

        this.attackDuration = 2.0;
        this.attackTimer = 0;

        this.turnSpeed = 5.0;

        this.state = 'idle';

        this.runAnim = 2;  //animacija 2 je running with sword in veli bolj smooth, kot 6. Animacija 6 je sam running.
        this.outwardAttackAnim = 5;
        this.inwardAttackAnim = 4;

        this.gunShootingAnim = 0;

        this.enemyType = type;

        this.shootTime = 0.2;
        this.shootTimer = 0;
        this.hasFired = false;

        this.bulletPool = bulletPool;

        //line of sight dodajanje
        this.viewRadius = 10.0;
        this.fovCos = Math.cos(Math.PI * 0.6); //priblizno en cone
        this.awareness = 'idle';
        this.aimDir = null;

        this.lastSeenPos = null;
        this.searchRadius = 0.4;

        this.weapon = weapon;

        this.lostTimer = 0;
        this.lostDelay = 1.2;
        this.idleAnimation = "idle";

        this.searchTimer = 0;
        this.searchDelay = 0.6;


        entity.skeleton?.playAnimation(this.idleAnimation);
    }

    update(){
        this.updateAwareness();

        let dt = World.getDt();

        if(this.state === 'lost'){
            this.lostTimer -= dt;

            if(this.awareness === 'seen'){
                this.state = 'chase';
                this.entity.skeleton?.playAnimation(this.runAnim);
                return;
            }

            if(this.lostTimer <= 0){
                this.state = 'search_idle';
                this.searchTimer = this.searchDelay;
                this.entity.skeleton?.playAnimation(this.idleAnimation);
            }

            return;
        }

        if(this.state === 'search_idle'){
            this.searchTimer -= dt;

            if(this.awareness === 'seen'){
                this.state = 'chase';
                this.entity.skeleton?.playAnimation(this.runAnim);
                return;
            }

            if(this.searchTimer <= 0){
                this.state = 'search_move';
                this.entity.skeleton?.playAnimation(this.runAnim);
            }

            return;
        }


        switch(this.enemyType){
            case 'Melee':
                this.MeleeEnemyBehaviour(dt);
                break;
            case 'Ranged':
                this.RangedEnemyBehaviour(dt);
                break;
        }
    }


    MeleeEnemyBehaviour(dt){
        if (this.state === 'search_move'){
            this.moveToLastSeen(dt);
            return;
        }

        //dobro jutro
        if (this.awareness !== 'idle' && this.state === 'idle') {
            this.state = 'chase';
            this.entity.skeleton?.playAnimation(this.runAnim);
        }

        if (this.state === 'idle') return;

        if (!this.player) return;

        const playerTransform = this.player.getComponentOfType(Transform);
        if (!playerTransform) return;

        if (this.awareness !== 'seen'){
            this.state = 'search_move';
            return;
        }

        const targetPos = playerTransform.translation;

        if (!targetPos) return;

        const dir = glm.vec3.sub(
            glm.vec3.create(),
            targetPos,
            this.transform.translation
        );

        dir[1] = 0;

        const distance = glm.vec3.length(dir);

        if (distance > 0.0001) {
            glm.vec3.scale(dir, dir, 1 / distance);
        }

        //chase
        if (this.state === 'chase') {
            // move
            glm.vec3.scaleAndAdd(
                this.transform.translation,
                this.transform.translation,
                dir,
                this.speed * dt
            );

            if (this.awareness === 'seen') {
                this.faceDirection(dir, dt);
            }

        if(this.state === 'chase' && this.awareness === 'seen' && distance <= this.attackRange){
                this.state = 'attack';
                this.attackTimer = this.attackDuration;


                let attackAnim = Math.floor(Math.random() * 2 + 4);
                this.entity.skeleton?.playAnimation(attackAnim);
            }
        }

        //attack
        else if (this.state === 'attack') {
            this.attackTimer -= dt;
            this.weapon.getComponentOfType(KatanaComponent).startAttack();


            // rotate only
            if (this.awareness === 'seen') {
                this.faceDirection(dir, dt);
            }

            if (this.attackTimer <= 0) {
                this.state = 'chase';
                this.entity.skeleton?.playAnimation(this.runAnim);
            }
        }
    }

    RangedEnemyBehaviour(dt){
        if (this.state === 'search_move'){
            this.moveToLastSeen(dt);
            return;
        }

        //dobro jutro
        if (this.awareness !== 'idle' && this.state === 'idle') {
            this.state = 'chase';
            this.entity.skeleton?.playAnimation(this.runAnim);
        }

        if (this.state === 'idle') return;

        //Tle je behaviour za enemije s pistolo, za določanje lah uporabljaš this.enemyType
        if (!this.player) return;

        const playerTransform = this.player.getComponentOfType(Transform);
        if (!playerTransform) return;

        if (this.awareness !== 'seen'){
            this.state = 'search_move';
            return;
        }

        const targetPos = playerTransform.translation;

        if (!targetPos) return;

        const dir = glm.vec3.sub(
            glm.vec3.create(),
            targetPos,
            this.transform.translation
        );

        dir[1] = 0;

        const distance = glm.vec3.length(dir);

        if (distance > 0.0001) {
            glm.vec3.scale(dir, dir, 1 / distance);
        }

        //chase
        if (this.state === 'chase'){

            if (this.awareness === 'seen'){
                //ce je pre dalec bo prsu blizji
                if (distance > this.rangedAttackRange * 0.9) {
                    glm.vec3.scaleAndAdd(
                        this.transform.translation,
                        this.transform.translation,
                        dir,
                        this.speed * dt
                    );
                }

                //ce je in range attacka
                else{
                    this.state = 'attack';
                    this.attackTimer = this.attackDuration;
                    this.shootTimer = 0;
                    this.hasFired = false;

                    this.aimDir = glm.vec3.clone(dir);

                    this.entity.skeleton?.playAnimation(this.gunShootingAnim);
                }
            }

            if (this.awareness === 'seen') {
                this.faceDirection(dir, dt);
            }

        }

        //attack
        else if (this.state === 'attack') {
            this.attackTimer -= dt;
            this.shootTimer += dt;

            if (!this.hasFired && this.shootTimer >= this.shootTime) {
                this.spawnBullet();
                this.hasFired = true;
            }

            if (this.awareness !== 'seen'){
                this.state = 'search_move';
                this.aimDir = null;
                return;
            }

            const liveDir = glm.vec3.sub(
                glm.vec3.create(),
                playerTransform.translation,
                this.transform.translation
            );
            liveDir[1] = 0;

            if (glm.vec3.length(liveDir) > 0.001){
                glm.vec3.normalize(liveDir, liveDir);
                this.faceDirection(liveDir, dt);
                this.aimDir = liveDir;
            }

            if (this.attackTimer <= 0) {
                this.state = 'chase';
                this.hasFired = false;
                this.shootTimer = 0;
                this.aimDir = null;
                this.entity.skeleton?.playAnimation(this.runAnim);
            }
        }
    }

    faceDirection(dir, dt){
        if(glm.vec3.length(dir) < 0.001) return;

        const forward = glm.vec3.fromValues(0, 0, 1);
        const q = glm.quat.create();

        glm.quat.rotationTo(q, forward, dir);
        glm.quat.normalize(q, q);

        const current = this.transform.rotation;
        const t = Math.min(1, this.turnSpeed * dt);

        glm.quat.slerp(current, current, q, t);
        this.transform.rotation = current;
    }


    spawnBullet() {
        if (!this.bulletPool) return;

        const gun = this.entity.findChildByName("Pistol_5") 
            ?? this.entity.findChildByName("mixamorig:RightHand");

        if (!gun) return;

        const dir = glm.vec3.sub(
            glm.vec3.create(),
            this.player.getComponentOfType(Transform).translation,
            gun.getComponentOfType(Transform).translation
        );

        //dodaja gaussovo porazdelitev, da je mal random direction
        let spread = 0.025;

        dir[0]+=this.randomGaussian(0, spread);
        dir[2]+=this.randomGaussian(0, spread);

        const position = gun.getComponentOfType(Transform).translation;
        this.bulletPool.spawnBullet(position, dir);
    }


    randomGaussian(mean = 0, stdDev = 1) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

        canSeePlayer(){
            const playerTransform = this.player?.getComponentOfType(Transform);
            if (!playerTransform) return false;

            const from = glm.vec3.clone(this.transform.translation);
            const to   = glm.vec3.clone(playerTransform.translation);

            from[1] += 0.8;

            const dir = glm.vec3.sub(glm.vec3.create(), to, from);
            const dist = glm.vec3.length(dir);
            if (dist > this.viewRadius) return false;

            glm.vec3.normalize(dir, dir);

            const forward = glm.vec3.transformQuat(
                glm.vec3.create(),
                [0, 0, 1],
                this.transform.rotation
            );

            if (glm.vec3.dot(forward, dir) < this.fovCos) return false;

            const hit = World.physics.raycast(
                from,
                to,
                World.scene,
                Layers.WORLD | Layers.PLAYER
            );

            if (!hit) return true;
            return hit.entity._bounds.parentEntity === this.player;
        }


    updateAwareness(){ //to pa dejansko posodobi tisto awareness variable na zacetku
        const playerComp = this.player?.getComponentOfType(PlayerComponent);
        if (!playerComp) return;

        //Blind david
        if (playerComp.isSlowTime){
            if (this.awareness === 'seen'){
                this.awareness = 'idle';
                this.state = 'search_move';
            }
            return;
        }

        if(this.canSeePlayer()){
            const playerTransform = this.player.getComponentOfType(Transform);
            if(!playerTransform) return;

            this.awareness = 'seen';
            this.lastSeenPos = playerTransform.translation.slice();

            return;
        }

        // lost sight
        if(this.awareness === 'seen'){
            this.awareness = 'idle';

            if(this.state !== 'lost'){
                this.state = 'lost';
                this.lostTimer = this.lostDelay;
                this.entity.skeleton?.playAnimation(this.idleAnimation);
            }
        }
    }

    moveToLastSeen(dt){
        if(this.state !== 'search_move') return;

        if(!this.lastSeenPos){
            this.state = 'idle';
            this.entity.skeleton?.playAnimation(this.idleAnimation);
            return;
        }

        const dir = glm.vec3.sub(
            glm.vec3.create(),
            this.lastSeenPos,
            this.transform.translation
        );

        dir[1] = 0;
        const dist = glm.vec3.length(dir);

        if(dist <= this.searchRadius){
            this.lastSeenPos = null;
            this.state = 'idle';
            this.entity.skeleton?.playAnimation(this.idleAnimation);
            return;
        }

        glm.vec3.scale(dir, dir, 1 / dist);

        glm.vec3.scaleAndAdd(
            this.transform.translation,
            this.transform.translation,
            dir,
            this.speed * dt
        );
    }


}
