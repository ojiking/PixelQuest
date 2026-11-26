// 부술 수 있는 오브젝트, 함정, 바닥 아이템
import { mat4, sign } from './math.js';
import { TRAPS, WEAPONS } from './config.js';
import { getModel, WEAPON_MODEL } from './models.js';
import { applyHit } from './combat.js';

const M = mat4.create();
const FLASH = [1, 1, 1, .7];
const WARN = [1, .85, .2, .45];

export class Prop {
  constructor(kind, x, z) {
    this.kind = kind; this.x = x; this.z = z; this.y = 0;
    this.radius = kind === 'crate' ? 0.45 : kind === 'moto' ? 0.75 : 0.4;
    this.hp = kind === 'crate' ? 18 : kind === 'moto' ? TRAPS.moto.hp : 1;
    this.broken = false; this.flash = 0; this.fuse = -1;
    this.model = kind;
  }
  hit(game, dmg, dir) {
    if (this.broken) return;
    this.hp -= dmg; this.flash = 0.1;
    if (this.kind === 'barrel') { if (this.fuse < 0) this.fuse = TRAPS.barrel.fuse; }
    else if (this.kind === 'moto') { game.debris.sparks(this.x, .5, this.z, 0xfff3a0, 5, 2); if (this.hp <= 0 && this.fuse < 0) this.fuse = TRAPS.moto.fuse; }
    else if (this.hp <= 0) game.breakProp(this, dir);
  }
  update(dt, game) {
    if (this.flash > 0) this.flash -= dt;
    if (this.fuse >= 0) {
      this.fuse -= dt;
      if (this.fuse < 0 && !this.broken) {
        this.broken = true;
        const T = this.kind === 'moto' ? TRAPS.moto : TRAPS.barrel;
        game.explode(this.x, this.z, T.radius, T.dmg, null);
        if (this.kind === 'moto') { mat4.identity(M); mat4.translate(M, this.x, .3, this.z); game.debris.burst(getModel(game.r, 'moto').voxels, M, { frac: .6, size: .12, spread: 4 }); }
      }
    }
  }
  draw(r, game) {
    if (this.broken) return;
    mat4.identity(M); mat4.translate(M, this.x, 0, this.z);
    if (this.kind === 'moto') { mat4.translate(M, 0, 0.28, 0); mat4.rotateX(M, Math.PI / 2); mat4.rotateY(M, this.tilt ?? 0); } // 옆으로 쓰러진 오토바이
    let tint = this.flash > 0 ? FLASH : null;
    if (this.fuse >= 0 && Math.floor(game.time * 20) % 2) tint = WARN;
    r.drawMesh(getModel(r, this.model).mesh, M, tint);
  }
}

export class SpikeTrap {
  constructor(cx, cz, offset) {
    this.x = cx; this.z = cz; this.t = offset; this.hitSet = new Set(); this.wasUp = false;
  }
  get rise() {
    const T = TRAPS.spike;
    if (this.t < T.warnAt) return 0;
    if (this.t < T.upAt) return 0.3;
    return 1;
  }
  update(dt, game) {
    const T = TRAPS.spike;
    this.t = (this.t + dt) % T.cycle;
    const up = this.t >= T.upAt;
    if (up && !this.wasUp) { this.hitSet.clear(); game.debris.sparks(this.x, 0.3, this.z, 0xdddddd, 6, 2); }
    this.wasUp = up;
    if (!up) return;
    for (const a of game.actors) {
      if (a.dead || a.y > 0.3 || this.hitSet.has(a)) continue;
      if (Math.abs(a.x - this.x) > 1 || Math.abs(a.z - this.z) > 1) continue;
      this.hitSet.add(a);
      if (applyHit(game, a, { attacker: null, dmg: T.dmg, knock: 2, dir: sign(a.x - this.x) || 1, zone: 'low', knockdown: false, sever: 1.5, hitstop: .04, shake: .08 })) {
        if (!a.dead && a.state === 'hurt') { a.vy = 4; a.y = 0.01; }
      }
    }
  }
  draw(r, game) {
    mat4.identity(M); mat4.translate(M, this.x, 0, this.z);
    r.drawMesh(getModel(r, 'spikePlate').mesh, M);
    const jitter = this.rise === 0.3 ? Math.sin(game.time * 60) * 0.02 : 0;
    mat4.identity(M); mat4.translate(M, this.x, -0.5 + this.rise * 0.52 + jitter, this.z);
    r.drawMesh(getModel(r, 'spikes').mesh, M);
  }
}

export class Item {
  constructor(kind, type, x, z, o = {}) {
    this.kind = kind; this.type = type; this.x = x; this.z = z;
    this.y = o.y ?? 0; this.vy = o.vy ?? 0; this.vx = o.vx ?? 0;
    this.dur = o.dur ?? (kind === 'weapon' ? WEAPONS[type].dur : 0);
    this.value = o.value ?? 1;
    this.life = kind === 'scrap' ? 14 : Infinity;
    this.remove = false;
    this.radius = 0.3;
  }
  get modelKey() { return this.kind === 'weapon' ? WEAPON_MODEL[this.type] : this.kind; }
  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.remove = true; return; }
    const fl = game.floorAt(this.x, this.z);
    if (this.y > fl || this.vy > 0) {
      this.vy -= 20 * dt; this.y += this.vy * dt; this.x += this.vx * dt;
      if (this.y <= fl && this.y > fl - 0.5) { this.y = fl; this.vy = Math.abs(this.vy) > 3 ? -this.vy * 0.3 : 0; this.vx *= 0.5; }
      if (this.y < -6) { this.remove = true; return; }
    }
    // 음식(체력 회복): 가까이 가면 자동으로 먹음. 체력이 가득이면 남겨 둠
    if (this.kind === 'food' && this.vy === 0) {
      const p = game.player;
      if (!p.alive || p.hp >= p.maxHp) return;
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      if (d < 1.3 && d > 0.01) { this.x += dx / d * dt * 4; this.z += dz / d * dt * 4; }   // 살짝 끌려옴
      if (d < 0.5 && Math.abs(p.y - this.y) < 1) { this.remove = true; game.eatFood(p, this); }
      return;
    }
    if (this.kind === 'scrap') {
      const p = game.player;
      if (p.state === 'ko') return;
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      if (d < 2.4 && this.vy === 0) { this.x += dx / d * dt * 7; this.z += dz / d * dt * 7; }
      if (d < 0.45) { this.remove = true; game.collectScrap(this.value); }
    }
  }
  draw(r, game) {
    if (this.life < 3 && Math.floor(game.time * 8) % 2) return;
    mat4.identity(M);
    const bob = this.kind === 'weapon' ? 0.05 : 0.12 + Math.sin(game.time * 4 + this.x) * 0.06;
    mat4.translate(M, this.x, this.y + bob, this.z);
    mat4.rotateY(M, this.kind === 'weapon' ? 0.4 : game.time * 2);
    r.drawMesh(getModel(r, this.modelKey).mesh, M);
  }
}
