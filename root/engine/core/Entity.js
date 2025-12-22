export class Entity {

    constructor(components = []) {
        this.components = components;
        this.children = [];
        this._parent = null;
    }

    addComponent(component) {
        if (component.constructor !== Object && this.hasComponentOfType(component.constructor))
            console.error(new Error("entity " + this.name + " already has component " + component.constructor?.name ?? "Object"));
        this.components.push(component);
        component.onAttach?.(this);
    }

    removeComponent(component) {
        this.components = this.components.filter(c => c !== component);
        component.onDetach?.(this);
    }

    hasComponentOfType(type) {
        return this.components.find(component => component instanceof type) !== undefined;
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

    onCollision(other)
    {
        this.components.forEach(c => c.onCollision?.(this, other));
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
