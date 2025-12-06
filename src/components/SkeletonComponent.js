export class SkeletonComponent {
    constructor({joints = [], skeletonRoot = null, inverseBindMatrices = [], name = ""} = {}) {
        this.joints = joints;
        this.skeletonRoot = skeletonRoot;
        this.inverseBindMatrices = inverseBindMatrices;
        this.name = name;
    }
}
