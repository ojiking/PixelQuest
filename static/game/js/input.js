// 키보드 입력. 보조 키(Z/X/C/Space/방향키)는 기본 키로 통일
const ALIAS = { KeyZ: 'KeyJ', KeyX: 'KeyK', Space: 'KeyK', KeyC: 'KeyL' };
const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor() {
    this.down = new Set();
    this.just = new Set();
    this.touchX = 0; this.touchZ = 0; // 모바일 조이스틱 (-1..1)
    addEventListener('keydown', e => {
      if (BLOCK.has(e.code)) e.preventDefault();
      const c = ALIAS[e.code] || e.code;
      if (!e.repeat) this.just.add(c);
      this.down.add(c);
    });
    addEventListener('keyup', e => this.down.delete(ALIAS[e.code] || e.code));
    addEventListener('blur', () => { this.down.clear(); this.just.clear(); this.touchX = this.touchZ = 0; });
  }
  pressed(c) { return this.just.has(c); }
  held(c) { return this.down.has(c); }
  axisX() {
    const k = (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0) - (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0);
    return k || this.touchX;
  }
  axisZ() {
    const k = (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0) - (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0);
    return k || this.touchZ;
  }
  endFrame() { this.just.clear(); }
}
