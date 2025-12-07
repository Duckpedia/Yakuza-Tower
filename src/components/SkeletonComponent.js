import * as glm from 'glm';
import { Transform } from '../../engine/core/Transform.js';

export class SkeletonComponent {
    constructor({jointIndices = [], joints = [], inverseBindMatrices = [], name = "", animations = []} = {}) {
        this.jointIndices = jointIndices;
        this.inverseBindMatrices = inverseBindMatrices;
        this.name = name;
        this.animations = animations;
        this.joints = joints;
        this.currentAnimation = null;
        this.time = 0.0;
    }

    clone()
    {
        return new SkeletonComponent(this);
    }
    
    playAnimationByIndex(index, loop = true) {
        if (!this.animations || index >= this.animations.length) 
            return false;
        this.currentAnimation = this.animations[index];
        this.time = 0.0;
        this.loop = loop;
        return true;
    }

    playAnimation(name, loop = true) {
        return this.playAnimationByIndex(this.animations.findIndex(anim => anim.name === name));
    }
    
    update(t, dt) {
        const anim = this.currentAnimation;
        if (!anim)
            return;

        this.time += dt;
        if (this.time > anim.duration)
        {
            if (!this.loop){
                this.currentAnimation = null;
                return;
            }
            this.time = this.time % anim.duration;
        }

        for (const channel of this.currentAnimation.channels)
        {
            const times = channel.times;
            const values = channel.values;
            if (!times || times.length === 0) continue;

            let i = 0;
            for (i; i + 1 < times.length; i++)
                if (this.time < times[i + 1])
                    break

            let value;
            if (i === times.length - 1 || channel.interpolation === 'STEP') {
                value = values[i];
            } else {
                const t = (this.time - times[i]) / (times[i + 1] - times[i]);
                const v0 = values[i];
                const v1 = values[i + 1];
                if (channel.targetPath == 'rotation') {
                    value = glm.quat.slerp(new glm.quat(), v0, v1, t);
                }
                else {
                    value = glm.vec4.lerp(new glm.vec4(), v0, v1, t);
                }
            }

            if (!value) continue;

            const jointEntity = this.joints[channel.targetNodeIndex];
            if (!jointEntity) continue;

            const transform = jointEntity.getComponentOfType(Transform);
            if (!transform) continue;

            switch (channel.targetPath) {
                case "translation":
                    transform.translation = value;
                    break;
                case "scale":
                    transform.scale = value;
                    break;
                case "rotation":
                    transform.rotation = value;
                    break;
            }
        }
    }
}