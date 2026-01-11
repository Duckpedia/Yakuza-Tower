import { World } from '../World.js';
import { quat, vec3, vec4 } from '../../lib/glm.js';

// goated video, sam mu nism cis slediu ksm mau retarded
// https://www.youtube.com/watch?v=Jkv0pbp0ckQ
export class SkeletonComponent 
{
    constructor({ jointIndices = [], inverseBindMatrices = [], name = "", animations = [] } = {}) 
    {
        this.jointIndices = jointIndices;
        this.inverseBindMatrices = inverseBindMatrices;
        this.name = name;
        this.animations = animations;
        this.layers = {};
        this.active = false; // HAX !!!!
    }
    
    setJoints(joints)
    {
        this.joints = joints;
        this.restPose = new Pose(this.joints.map(t => ({
            translation: vec3.clone(t._transform.translation),
            rotation: quat.clone(t._transform.rotation),
            scale: vec3.clone(t._transform.scale),
        })));
        this.basePose = Pose.fromOther(this.restPose);
        this.upperPose = Pose.fromOther(this.restPose);
        this.addPose = Pose.fromOther(this.restPose);
        this.intermediatePose = Pose.fromOther(this.restPose);
    }

    // TODO: just make animations into a map
    getAnimationIndex(name)
    {
        return this.animations.findIndex(anim => anim.name.toLowerCase() === name.toLowerCase());
    }

    playAnimation(name, layer = "base", transitionTime = 0.3, options = ({ loop: true, weight: 1.0, fadeinTime: 0.1 }))
    {
        const index = typeof name === 'number' ? name : this.getAnimationIndex(name);
        if (index < 0 || index >= this.animations.length) 
            return;
        this.active = true;
        this.layers[layer] ??= {};
        const l = this.layers[layer];
        if (l.active?.index === index) return;
        if (transitionTime >= 0.0 && l.active)
            this.stopAnimation(layer, transitionTime);

        const anim = this.animations[index];
        if (!anim.referencePose)
        {
            anim.referencePose = Pose.fromOther(this.restPose);
            this.calculatePose(anim.referencePose, { startTime: 0.0, anim, fadeoutTime: 0.0 }, 0.0);
        }

        l.active = {
            index, 
            anim, 
            startTime: World.getTime(),
            fadeoutTime: 0.0,
            ...options 
        };
    }

    stopAnimation(layer, fadeoutTime = 0.0)
    {
        const l = this.layers[layer];
        l.stopping = l.active;
        l.stopping.stopTime = World.getTime();
        l.stopping.fadeoutTime = fadeoutTime;
    }

    update()
    {
        if (!this.active) return;

        const time = World.getTime();
        
        this.basePose.copyFrom(this.restPose);
        this.upperPose.copyFrom(this.restPose);
        this.addPose.copyFrom(this.restPose);

        if (!this.calculatePoseForLayer(this.basePose, "base", time))
            return;

        if (this.layers.base?.active?.index !== this.layers.upper?.active?.index && 
            this.calculatePoseForLayer(this.upperPose, "upper", time))
            {
                this.poseBlend(this.basePose, this.upperPose, 1, "up_");
            }

        if (this.calculatePoseForLayer(this.addPose, "add", time, true))
            this.poseAdd(this.basePose, this.addPose);

        for (let i = 0; i < this.basePose.transforms.length; i++)
        {
            const transform = this.basePose.transforms[i];
            const joint = this.joints[i];
            vec3.copy(joint._transform.translation, transform.translation);
            quat.copy(joint._transform.rotation, transform.rotation);
            vec3.copy(joint._transform.scale, transform.scale);
        }
    }

    poseBlend(a, b, t, filter = null)
    {
        for (var i = 0; i < a.transforms.length; i++)
        {
            if (filter && !this.joints[i].name.includes(filter)) continue;
            const ta = a.transforms[i];
            const tb = b.transforms[i];
            vec3.lerp(ta.translation, ta.translation, tb.translation, t);
            quat.slerp(ta.rotation, ta.rotation, tb.rotation, t);
            vec3.lerp(ta.scale, ta.scale, tb.scale, t);
        }
    }

    poseSubtract(a, b, filter = null)
    {
        const invQuat = new quat();
        for (var i = 0; i < b.transforms.length; i++)
        {
            if (filter && !this.joints[i].name.includes(filter)) continue;
            const ta = a.transforms[i];
            const tb = b.transforms[i];
            vec3.sub(ta.translation, ta.translation, tb.translation);
            quat.invert(invQuat, tb.rotation);
            quat.mul(ta.rotation, ta.rotation, invQuat);
            vec3.sub(ta.scale, ta.scale, tb.scale);
        }
    }

    poseAdd(a, b, filter = null)
    {
        for (var i = 0; i < b.transforms.length; i++)
        {
            if (filter && !this.joints[i].name.includes(filter)) continue;
            const ta = a.transforms[i];
            const tb = b.transforms[i];
            vec3.add(ta.translation, ta.translation, tb.translation);
            quat.mul(ta.rotation, ta.rotation, tb.rotation);
            vec3.add(ta.scale, ta.scale, tb.scale);
        }
    }
    
    calculatePose(pose, options, time)
    {
        pose.copyFrom(this.restPose);
        const anim = options.anim;
        time -= options.startTime;
        
        if (options.loop) 
        {
            time %= anim.duration;
        }
        else 
        {
            if (time > anim.duration)
                return;
        }

        for (const channel of anim.channels)
        {
            const times = channel.times;
            const values = channel.values;
            if (!times || times.length === 0) continue;

            let i = 0;
            for (i; i + 1 < times.length; i++)
                if (time < times[i + 1])
                    break

            let value;
            if (i === times.length - 1 || channel.interpolation === 'STEP') 
            {
                value = values[i];
            }
            else 
            {
                const t = (time - times[i]) / (times[i + 1] - times[i]);
                const v0 = values[i];
                const v1 = values[i + 1];
                if (channel.targetPath == 'rotation') {
                    value = quat.slerp(new quat(), v0, v1, t);
                }
                else {
                    value = vec3.lerp(new vec3(), v0, v1, t);
                }
            }

            if (!value) continue;

            const transform = pose.transforms[channel.targetNodeIndex];
            if (!transform) continue;

            switch (channel.targetPath) {
                case "translation":
                    vec3.copy(transform.translation, value);
                    break;
                case "rotation":
                    quat.copy(transform.rotation, value);
                    break;
                case "scale":
                    vec3.copy(transform.scale, value);
                    break;
            }
        }
    }

    calculateWeight(anim, time)
    {
        let weight = anim.weight;
        if (anim.fadeinTime > 0.0) weight *= Math.min((time - anim.startTime) / anim.fadeinTime, 1.0);
        if (anim.stopTime)
            weight *= 1.0 - (anim.fadeoutTime > 0.0 ? Math.min((time - anim.stopTime) / anim.fadeoutTime, 1.0) : 0.0);
        return weight;
    }

    calculatePoseForLayer(pose, layer, time, subtract = false)
    {
        const l = this.layers[layer];
        if (!l) return false;
        this.calculatePose(pose, l.active, time);
        if (l.stopping)
        {
            const weight = this.calculateWeight(l.stopping, time);
            this.calculatePose(this.intermediatePose, l.stopping, time);
            this.poseBlend(pose, this.intermediatePose, weight);
        }
        if (subtract) this.poseSubtract(pose, l.active.anim.referencePose);
        return true;
    }
    
    onAttach(entity)
    {
        entity._skeleton = this;
    }

    onDetach(entity)
    {
        entity._skeleton = undefined;
    }

    clone()
    {
        return new SkeletonComponent(this);
    }
}

class Pose {
    transforms = []
    constructor(transforms)
    {
        this.transforms = transforms;
    }

    static fromOther(other)
    {
        return new Pose(other.transforms.map(t => ({
            translation: vec3.clone(t.translation),
            rotation: quat.clone(t.rotation),
            scale: vec3.clone(t.scale),
        })));
    }

    copyFrom(other)
    {
        for (var i = 0; i < other.transforms.length; i++)
        {
            const transform = this.transforms[i];
            const transform2 = other.transforms[i];
            vec3.copy(transform.translation, transform2.translation);
            quat.copy(transform.rotation, transform2.rotation);
            vec3.copy(transform.scale, transform2.scale);
        }
    }
}
