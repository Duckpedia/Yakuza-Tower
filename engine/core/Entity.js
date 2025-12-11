export class Entity {

    constructor(components = []) {
        this.components = components;
        this.children = [];
        this._parent = null;
    }

    addComponent(component) {
        this.components.push(component);
    }

    removeComponent(component) {
        this.components = this.components.filter(c => c !== component);
    }

    removeComponentsOfType(type) {
        this.components = this.components.filter(component => !(component instanceof type));
    }

    getComponentOfType(type) {
        return this.components.find(component => component instanceof type);
    }

    getComponentsOfType(type) {
        return this.components.filter(component => component instanceof type);
    }
    
    findChildByName(name) {
        return this.children.find(c => c.name === name) ??
            this.children.map(c => c.findChildByName(name)).find(x => x);
    }

    get parent() {
       return this._parent; 
    }

    set parent(parent) {
        if (this._parent)
            this._parent.children.remove(this);
        this._parent = parent;
        parent?.children.push(this);
    }
}
