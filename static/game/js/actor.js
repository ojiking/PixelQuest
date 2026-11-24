// 모든 캐릭터(플레이어/동료/적)의 공통 기반: 물리, 상태, 공격 진행, 절차적 애니메이션, 부위 렌더링
import { mat4, clamp } from './math.js';
import { GRAVITY, LANE, ATTACKS, WEAPONS } from './config.js';
import { getModel, WEAPON_MODEL } from './models.js';
import { tryHits } from './combat.js';

const M = mat4.create(), PM = mat4.create(), WM = mat4.create();
export const PART_ORDER = ['legB', 'armB', 'torso', 'head', 'legF', 'armF'];
const PART_HP = { head: .5, armF: .32, armB: .32, legF: .38, legB: .38 };
const FLASH = [1, 1, 1, .75];
const WARN = [1, .2, .08, .5];

export class Actor {
  constructor(game, modelKey, o) {
    this.game = game;
    this.modelKey = modelKey;
    this.model = getModel(game.r, modelKey);
    this.x = o.x ?? 0; this.y = 0; this.z = o.z ?? 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = 1;
    this.scale = o.scale ?? 1;
    this.team = o.team;
    this.maxHp = this.hp = o.hp;
    this.radius = 0.32 * this.scale;
    this.state = 'idle'; this.st = 0;
    this.walkPhase = 0; this.flash = 0; this.invuln = 0; this.hitstun = 0; this.downT = 0;
    this.fall = 0; this.spin = 0; this.lowered = 0;
    this.dead = false; this.remove = false;
    this.destructible = !!o.destructible;
    this.poise = o.poise ?? 0; this.armorAcc = 0;
    this.attack = null; this.weapon = null;
    this.atkSpeed = 1; this.power = 1;
    this.parts = {};
    for (const k of PART_ORDER) {
      const max = (PART_HP[k] ?? 0) * this.maxHp;
      this.parts[k] = { alive: true, hp: max, max, rz: 0, rx: 0 };
    }
  }

  setState(s) { this.state = s; this.st = 0; }
  get busy() { return !(this.state === 'idle' || this.state === 'walk'); }
  get alive() { return !this.dead && this.state !== 'ko'; }
  hasArms() { return this.parts.armF.alive || this.parts.armB.alive; }
  legCount() { return (this.parts.legF.alive ? 1 : 0) + (this.parts.legB.alive ? 1 : 0); }
  legFactor() { const n = this.legCount(); return n === 2 ? 1 : n === 1 ? 0.55 : 0.3; }
  perk() { return false; }

  moveToward(tx, tz, speed) {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz * 1.3);
    if (d < 0.1) { this.vx = 0; this.vz = 0; return true; }
    const sp = speed * this.legFactor();
    this.vx = dx / d * sp;
    this.vz = dz / d * sp * 0.8;
    return false;
  }

  // ------------------------------------------------ 공격
  startAttack(key) {
    const def = ATTACKS[key];
    this.attack = { key, def, t: 0, hit: new Set(), activated: false, ended: false, spawned: false };
    this.setState('attack');
    if (!def.air && this.y <= 0) { this.vx = 0; this.vz = 0; }
  }

  attackPhase() {
    const a = this.attack;
    if (!a) return null;
    if (a.t < a.def.startup) return 'startup';
    if (a.t < a.def.startup + a.def.active) return 'active';
    return 'recovery';
  }

  updateAttack(dt) {
    const a = this.attack;
    if (!a) return;
    const d = a.def;
    let spd = this.atkSpeed;
    if (d.weapon && this.weapon && WEAPONS[this.weapon.type].slow) spd /= WEAPONS[this.weapon.type].slow;
    a.t += dt * spd;
    const s = d.startup, e = s + d.active;
    if (a.t >= s && (a.t < e || !a.activated)) {
      a.activated = true;
      this.activeFrame(a);
    } else if (a.t >= e && !a.ended) {
      a.ended = true;
      if (d.dash) this.vx = 0;
    }
    if (this.attack === a && a.t >= e + d.recovery) this.endAttack();
  }

  activeFrame(a) {
    const d = a.def, g = this.game;
    if (d.projectile) {
      if (!a.spawned) {
        a.spawned = true;
        const o = { kind: d.projectile, x: this.x + this.facing * 0.5 * this.scale, y: 1.45 * this.scale, z: this.z, dir: this.facing, team: this.team, dmg: d.dmg, owner: this };
        if (d.projectile === 'weapon') {
          if (!this.weapon) return;
          o.weaponType = this.weapon.type; o.dur = this.weapon.dur; o.dmg = WEAPONS[this.weapon.type].throwDmg;
          this.weapon = null;
        }
        g.spawnProjectile(o);
      }
      return;
    }
    if (d.explode) {
      if (!a.spawned) { a.spawned = true; g.explode(this.x, this.z, d.explode.radius, d.explode.dmg, this); }
      return;
    }
    if (d.dash) this.vx = this.facing * d.dash * this.legFactor();
    tryHits(g, this, a);
  }

  endAttack() {
    this.attack = null;
    this.armorAcc = 0;
    this.spin = 0;
    this.setState(this.y > 0 ? 'jump' : 'idle');
    this.onAttackEnd?.();
  }

  interrupt() {
    if (this.attack) { this.attack = null; this.spin = 0; this.onAttackEnd?.(true); }
    this.armorAcc = 0;
  }

  // ------------------------------------------------ 물리 / 공통 상태
  physics(dt) {
    this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        const impact = this.vy;
        this.y = 0; this.vy = 0;
        this.onLand(impact);
      }
    }
    this.z = clamp(this.z, LANE.zMin, LANE.zMax);
    const sliding = this.state === 'hurt' || ((this.state === 'down' || this.state === 'dying' || this.state === 'ko') && this.y <= 0);
    if (sliding) { const f = Math.pow(0.004, dt); this.vx *= f; this.vz *= f; }
    this.lowered = this.legCount() === 0 && this.fall < 0.2 ? this.model.legLen * 0.9 : 0;
  }

  onLand(impact) {
    const g = this.game;
    if (this.state === 'jump') this.setState('idle');
    else if (this.state === 'attack' && this.attack?.air) this.endAttack();
    else if ((this.state === 'down' || this.state === 'dying' || this.state === 'ko') && impact < -4) {
      g.debris.puff(this.x, 0.1, this.z, [0xbdb6a6, 0x9c958a], 8, 1.5, .14, .45, -0.2);
      g.shake(0.06);
    }
  }

  // hurt/down/getup/dying 처리. 처리했으면 true
  updateCommon(dt) {
    switch (this.state) {
      case 'hurt':
        if (this.st >= this.hitstun) this.setState('idle');
        return true;
      case 'down':
        if (this.y <= 0) this.downT += dt;
        if (this.downT > 0.8) this.setState('getup');
        return true;
      case 'getup':
        if (this.st > 0.35) { this.setState('idle'); this.invuln = this.getupInvuln ?? 0.4; }
        return true;
      case 'dying':
        if (this.y <= 0 && this.st > 0.55) this.shatter();
        return true;
    }
    return false;
  }

  // ------------------------------------------------ 애니메이션
  pose(dt) {
    const P = this.parts, t = this.game.time;
    const T = { legF: 0, legB: 0, armF: .12, armB: .12, torso: 0, head: 0 };
    let fallT = 0, rate = 18;
    switch (this.state) {
      case 'idle': T.armF = .15 + Math.sin(t * 2.2) * .05; T.armB = .1 - Math.sin(t * 2.2) * .05; break;
      case 'walk': {
        const w = Math.sin(this.walkPhase);
        T.legF = w * .7; T.legB = -w * .7; T.armF = -w * .55; T.armB = w * .55;
        break;
      }
      case 'jump': T.legF = .9; T.legB = -.3; T.armF = 2.3; T.armB = -.5; break;
      case 'hurt': T.torso = .3; T.head = .3; T.armF = -.6; T.armB = -.4; rate = 30; break;
      case 'down': case 'dying': case 'ko': fallT = Math.PI / 2; T.armF = 2.6; T.armB = 2.4; T.legF = .2; break;
      case 'getup': fallT = Math.PI / 2 * (1 - Math.min(1, this.st / .35)); T.legF = .8; break;
      case 'repair': T.armF = 1.3 + Math.sin(t * 20) * .3; T.armB = 1.3 - Math.sin(t * 20) * .3; T.torso = -.4; break;
      case 'attack': this.attackPose(T); rate = 35; break;
    }
    const k = Math.min(1, dt * rate);
    for (const n in T) P[n].rz += (T[n] - P[n].rz) * k;
    this.fall += (fallT - this.fall) * Math.min(1, dt * 12);
  }

  attackPose(T) {
    const a = this.attack, d = a.def, ph = this.attackPhase(), t = this.game.time;
    this.spin = 0;
    switch (d.anim) {
      case 'punchF':
        T.armF = ph === 'startup' ? -.4 : ph === 'active' ? 1.6 : .9; T.armB = .5;
        T.torso = ph === 'active' ? -.18 : 0; T.legF = .3; T.legB = -.2; break;
      case 'punchB':
        T.armB = ph === 'startup' ? -.4 : ph === 'active' ? 1.6 : .9; T.armF = .5;
        T.torso = ph === 'active' ? -.18 : 0; T.legF = .3; T.legB = -.2; break;
      case 'kick':
        T.legF = ph === 'startup' ? .5 : ph === 'active' ? 1.5 : .7;
        T.torso = ph === 'startup' ? .1 : .35; T.armF = -.6; T.armB = .7; break;
      case 'flykick': T.legF = 1.45; T.legB = -.5; T.torso = .25; T.armF = -.8; T.armB = 1.4; break;
      case 'swing':
        T.armF = ph === 'startup' ? 3.0 : ph === 'active' ? .55 : .35;
        T.torso = ph === 'startup' ? .2 : -.25; T.armB = .3; T.legF = .35; T.legB = -.25; break;
      case 'slam':
        T.armF = T.armB = ph === 'startup' ? 3.0 : ph === 'active' ? .7 : .5;
        T.torso = ph === 'startup' ? .3 : -.45; break;
      case 'throw':
        T.armF = ph === 'startup' ? 2.9 : 1.2; T.torso = ph === 'startup' ? .25 : -.2; T.armB = .4; break;
      case 'charge':
        if (ph === 'startup') { T.torso = -.5; T.armF = T.armB = -.9; T.legF = .5; T.legB = -.5; }
        else if (ph === 'active') { const w = Math.sin(t * 28); T.legF = w * .9; T.legB = -w * .9; T.torso = -.6; T.armF = T.armB = -1.1; }
        else { T.head = Math.sin(t * 9) * .35; T.armF = .3; T.armB = .3; T.torso = .15; }
        break;
      case 'fuse': T.armF = 2.6; T.armB = 2.6; T.head = Math.sin(t * 30) * .15; break;
      case 'spin':
        T.legF = 1.4; T.armF = 1.5; T.armB = 1.5;
        if (ph === 'active') this.spin = ((a.t - d.startup) / d.active) * Math.PI * 4;
        break;
    }
  }

  // ------------------------------------------------ 렌더링
  rootMatrix(m) {
    mat4.identity(m);
    mat4.translate(m, this.x, this.y, this.z);
    mat4.rotateY(m, -0.42 * this.facing + this.spin);
    mat4.scale(m, this.facing, 1, 1);
    const ff = this.fall / (Math.PI / 2);
    mat4.translate(m, 0, 0.22 * this.scale * ff - this.lowered * this.scale, 0);
    mat4.rotateZ(m, this.fall);
    mat4.scale(m, this.scale, this.scale, this.scale);
    return m;
  }

  partMatrix(k, root, out) {
    const p = this.parts[k], piv = this.model.parts[k].pivot;
    mat4.copy(out, root);
    mat4.translate(out, piv[0], piv[1], piv[2]);
    mat4.rotateZ(out, p.rz);
    mat4.rotateX(out, p.rx);
    return out;
  }

  tint() {
    if (this.flash > 0) return FLASH;
    const a = this.attack;
    if (a && a.def.telegraph && this.attackPhase() === 'startup' && Math.floor(this.game.time * 14) % 2) return WARN;
    return null;
  }

  draw(r) {
    if (this.invuln > 0 && this.team === 'hero' && Math.floor(this.game.time * 20) % 2) return;
    const root = this.rootMatrix(M);
    const tint = this.tint();
    for (const k of PART_ORDER) {
      if (!this.parts[k].alive) continue;
      this.partMatrix(k, root, PM);
      r.drawMesh(this.model.parts[k].mesh, PM, tint);
      if (k === 'armF' && this.weapon) {
        mat4.copy(WM, PM);
        mat4.translate(WM, 0, -this.model.armLen, 0);
        mat4.rotateZ(WM, -0.6);
        r.drawMesh(getModel(r, WEAPON_MODEL[this.weapon.type]).mesh, WM, tint);
      }
    }
  }

  // 부위 하나를 복셀 파편으로 날림
  severPart(k, dir) {
    const p = this.parts[k];
    if (!p.alive) return;
    p.alive = false;
    const root = this.rootMatrix(M);
    this.partMatrix(k, root, PM);
    this.game.debris.burst(this.model.parts[k].voxels, PM, { frac: .7, impulse: [dir * 3.5, 2.5, 0], size: .12 });
    if (k === 'armF' && this.weapon) this.game.dropWeapon(this);
  }

  // 몸 전체를 복셀 파편으로
  shatter() {
    if (this.remove) return;
    this.remove = true;
    const root = this.rootMatrix(M);
    for (const k of PART_ORDER) {
      if (!this.parts[k].alive) continue;
      this.partMatrix(k, root, PM);
      this.game.debris.burst(this.model.parts[k].voxels, PM, { frac: .4, impulse: [this.vx * .3, 1.5, 0], size: .14 * this.scale, spread: 2.2 });
    }
    this.game.onShatter(this);
  }
}
