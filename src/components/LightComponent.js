export class LightComponent {
    constructor({emission = [10, 10, 10], type = 'point', shadows = false }) {
        this.emission = emission;
        this.type = type;
        this.shadows = shadows
    }
}