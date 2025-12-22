export class Inputs {
  static s = null;

  constructor(element) {
    if (!element) throw new Error("Inputs: element is required");

    this.element = element;
    this.doc = element.ownerDocument;

    this.mouse = { dx: 0, dy: 0 };
    this.keys = Object.create(null);

    this._pointerLocked = false;

    this.pointermoveHandler = this.pointermoveHandler.bind(this);
    this.keydownHandler = this.keydownHandler.bind(this);
    this.keyupHandler = this.keyupHandler.bind(this);

    this.doc.addEventListener("keydown", this.keydownHandler, { passive: false });
    this.doc.addEventListener("keyup", this.keyupHandler, { passive: false });

    this.element.addEventListener('click', e => this.element.requestPointerLock());
    this.doc.addEventListener('pointerlockchange', e => {
        if (this.doc.pointerLockElement === this.element) {
            this.doc.addEventListener('pointermove', this.pointermoveHandler);
        } else {
            this.doc.removeEventListener('pointermove', this.pointermoveHandler);
        }
    });

    Inputs.s = this;
  }

  update() {
    this.mouse.dx = 0;
    this.mouse.dy = 0;

    for (const code in this.keys) {
      const k = this.keys[code];
      k.pressed = false;
      k.released = false;
    }
  }

  static mouseDelta() {
    return { dx: Inputs.s.mouse.dx, dy: Inputs.s.mouse.dy };
  }

  static isHeld(code) {
    return !!Inputs.s.keys[code]?.down;
  }

  static isPressed(code) {
    return !!Inputs.s.keys[code]?.pressed;
  }

  static isReleased(code) {
    return !!Inputs.s.keys[code]?.released;
  }

  pointermoveHandler(e) {
    this.mouse.dx += e.movementX;
    this.mouse.dy += e.movementY;
  }

  getKey(code) {
    return (this.keys[code] ??= { down: false, pressed: false, released: false });
  }

  keydownHandler(e) {
    const k = this.getKey(e.code);
    if (!k.down) k.pressed = true;
    k.down = true;
  }

  keyupHandler(e) {
    const k = this.getKey(e.code);
    if (k.down) k.released = true;
    k.down = false;
  }
}
