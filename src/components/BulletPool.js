import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';
import { BulletComponent } from './BulletComponent.js';
import { World } from '../World.js';

export class BulletPool {
    constructor(bulletModel, initialSize = 10) {
        this.bulletModel = bulletModel;
        this.pool = [];
        this.activeBullets = new Set();

        // Pre-populate the pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createBullet());
        }
    }

    createBullet() {
        const bullet = this.bulletModel.build(World.scene);
        bullet.pool = this; // Reference to pool for returning
        bullet.hidden = true; // Start hidden
        return bullet;
    }

    getBullet() {
        let bullet;
        if (this.pool.length > 0) {
            bullet = this.pool.pop();
        } else {
            bullet = this.createBullet();
        }
        bullet.hidden = false;
        this.activeBullets.add(bullet);
        console.log("Activated");
        console.log(bullet);
        console.log(this.activeBullets);
        return bullet;
    }

    returnBullet(bullet) {
        if (this.activeBullets.has(bullet)) {
            this.activeBullets.delete(bullet);

            // Reset bullet state
            const transform = bullet.getComponentOfType(Transform);
            transform.translation = [0, 0, 0];
            transform.rotation = [0, 0, 0, 1];
            transform.scale = [0.0002, 0.0002, 0.0002];
            bullet.hidden = true;

            // Remove BulletComponent if it exists
            const bulletComp = bullet.getComponentOfType(BulletComponent);
            if (bulletComp) {
                bullet.removeComponent(bulletComp);
            }

            this.pool.push(bullet);
        }
    }

    spawnBullet(position, direction, speed = 4, lifetime = 4.0) {
        const bullet = this.getBullet();
        const transform = bullet.getComponentOfType(Transform);
        transform.translation = [...position];
        transform.scale = [0.0002, 0.0002, 0.0002];

        bullet.addComponent(new BulletComponent(bullet, direction, this, speed, lifetime));
        return bullet;
    }
}