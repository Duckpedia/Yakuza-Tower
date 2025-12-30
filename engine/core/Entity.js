export class Entity {
    components = [];
    children = [];
    _parent = null;
    hidden = false;

    constructor(scene, parent = null) {
        if (!scene)
            console.error(new Error("created entity without scene"));
        this.scene = scene;
        this.parent = parent;
    }

    addComponent(component) {
        this.scene._addComponent(this, component)
        this.components.push(component);
        component.onAttach?.(this);
    }

    removeComponent(component) {
        const removed = this.scene._removeComponent(this, component)
        const i = this.components.indexOf(removed);
        if (i !== -1) this.components.splice(i, 1);
        removed.onDetach?.(this);
    }

    getComponentOfType(type) {
        return this.scene._getComponentOfType(this, type);
    }

    hasComponentOfType(type) {
        return this.getComponentOfType(type) !== null;
    }
    
    findChildByName(name) {
        return this.children.find(c => c.name === name) ??
            this.children.map(c => c.findChildByName(name)).find(x => x);
    }

    onCollision(other)
    {
        this.components.forEach(c => c.onCollision?.(this, other));
    }

    isVisible() {
        let e = this;
        while (e) {
            if (e.hidden) return false;
            e = e.parent;
        }
        return true;
    }

    get parent() {
       return this._parent; 
    }

    set parent(parent) {
        if (this._parent === parent) return;

        if (this._parent) {
            const i = this._parent.children.indexOf(this);
            if (i !== -1) this._parent.children.splice(i, 1);
        }

        this._parent = parent ?? null;

        if (this._parent) {
            if (!this._parent.children.includes(this))
                 this._parent.children.push(this);
        }
    }
}
