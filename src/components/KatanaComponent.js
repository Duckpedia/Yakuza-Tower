import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';
import { World } from '../World.js';


export class KatanaComponent {

    constructor(entity) {
        this.entity = entity;
    }

    update() {
        let dt = World.getDt();
    }
}
