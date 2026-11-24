// 모든 캐릭터(플레이어/동료/적)의 공통 기반: 물리, 상태, 공격 진행, 절차적 애니메이션, 부위 렌더링
import { mat4, clamp } from './math.js';
import { GRAVITY, LANE, ATTACKS, WEAPONS, LIMB_WEAPONS } from './config.js';
import { getModel, WEAPON_MODEL } from './models.js';
import { tryHits } from './combat.js';

const M = mat4.create(), PM = mat4.create(), WM = mat4.create();
// 부모가 자식보다 먼저 (위팔→아래팔, 허벅지→정강이)
export const PART_ORDER = ['legB', 'shinB', 'armB', 'handB', 'torso', 'head', 'legF', 'shinF', 'armF', 'handF'];
const PART_HP = { head: .5, armF: .35, armB: .35, handF: .25, handB: .25, legF: .4, legB: .4, shinF: .3, shinB: .3 };
export const CHILD = { armF: 'handF', armB: 'handB', legF: 'shinF', legB: 'shinB' };
const TOP = ['head', 'torso', 'armF', 'armB', 'legF', 'legB'];
const FLASH = [1, 1, 1, .75];
const WARN = [1, .2, .08, .5];

export class Actor {
  constructor(game, modelKey, o) {
    this.game = game;
    this.modelKey = modelKey;
    this.model = getModel(game.r, modelKey);
    this.x = o.x ?? 0; this.y = 0; this.z = o.z ?? 0;
    this.grounded = true; this.floor = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = 1;
    this.scale = o.scale ?? 1;
    this.team = o.team;
    this.maxHp = this.hp = o.hp;
    this.radius = 0.32 * this.scale;
    this.state = 'idle'; this.st = 0;
    this.walkPhase = 0; this.flash = 0; this.invuln = 0; this.hitstun = 0; this.downT = 0;
    this.fall = 0; this.spin = 0; this.lowered = 0; this.hopLift = 0; this.lean = 0; this.twist = 0; this.grip = -0.6;
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
  armOK(s) { return this.parts['arm' + s].alive && this.parts['hand' + s].alive; }
  legOK(s) { return this.parts['leg' + s].alive && this.parts['shin' + s].alive; }
  hasArms() { return this.armOK('F') || this.armOK('B'); }
  legCount() { return (this.legOK('F') ? 1 : 0) + (this.legOK('B') ? 1 : 0); }
  // 남은 다리 중 가장 긴 쪽 길이 (몸이 그만큼 내려앉음)
  sideLegLen(s) { const m = this.model; return this.parts['leg' + s].alive ? (this.parts['shin' + s].alive ? m.legLen : m.legULen) : 0; }
  legFactor() { const n = this.legCount(); return n === 2 ? 1 : n === 1 ? 0.75 : 0.3; }
  // 한 다리: 깡충 뛰는 순간에만 앞으로 나감 (절뚝거림)
  hopPulse() { return Math.max(0, Math.sin(this.walkPhase)); }
  perk() { return false; }
  // 지금 휘두르는 무기 정의 (무기 > 집어 든 팔·다리·머리)
  heldDef() {
    if (this.weapon) return WEAPONS[this.weapon.type];
    if (this.carry?.limb) return LIMB_WEAPONS[this.carry.limb];
    return null;
  }

  // AI 이동: 낭떠러지·벽을 피하고, 건너편 목표면 점프해서 넘어감
  moveToward(tx, tz, speed) {
    if (!this.grounded) return false; // 공중에선 관성 유지
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz * 1.3);
    if (d < 0.1) { this.vx = 0; this.vz = 0; return true; }
    let sp = speed * this.legFactor();
    if (this.legCount() === 1) sp *= 0.15 + 1.25 * this.hopPulse();
    let vx = dx / d * sp, vz = dz / d * sp * 0.8;
    const g = this.game, look = 0.5;
    const ok = (x, z) => { const h = g.floorAt(x, z); return h > -50 && h <= this.y + 0.4; };
    const ux = Math.abs(dx) > 0.05 ? Math.sign(dx) : 0, uz = Math.abs(dz) > 0.05 ? Math.sign(dz) : 0;
    if (!ok(this.x + ux * look, this.z + uz * look * 0.8)) {
      // 앞이 틈/벽: 건너편에 설 곳이 있으면 점프
      if (ux && Math.abs(dx) > 1.2 && this.legCount() > 0) {
        for (const far of [2.4, 3.0]) {
          const lx = this.x + ux * far, lz = this.z;
          const h = g.floorAt(lx, lz);
          if (h > -50 && h <= this.y + 1.1 && ok(lx, lz)) {
            this.vy = 8.8; this.grounded = false;
            this.vx = ux * Math.max(sp, 3.7); this.vz = 0;
            return false;
          }
        }
      }
      // 미끄러지듯 우회: 한 축만 움직여 봄
      if (uz && ok(this.x, this.z + uz * look * 0.8)) vx = 0;
      else if (ux && ok(this.x + ux * look, this.z)) vz = 0;
      else { vx = 0; vz = 0; }
    }
    this.vx = vx; this.vz = vz;
    return false;
  }

  // ------------------------------------------------ 공격
  startAttack(key) {
    const def = ATTACKS[key];
    if (this.team === 'hero' && (def.weapon || def.anim === 'kick' || def.anim === 'flykick' || def.anim === 'dashAtk')) this.game.sfx?.('swing');
    this.attack = { key, def, t: 0, hit: new Set(), activated: false, ended: false, spawned: false };
    this.setState('attack');
    if (!def.air && this.grounded) { this.vx = 0; this.vz = 0; }
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
    const hd = d.weapon ? this.heldDef() : null;
    if (hd?.slow) spd /= hd.slow;
    a.t += dt * spd;
    const s = d.startup, e = s + d.active;
    if (a.t >= s && (a.t < e || !a.activated)) {
      a.activated = true;
      this.activeFrame(a, dt);
    } else if (a.t >= e && !a.ended) {
      a.ended = true;
      if (d.dash) this.vx = 0;
    }
    if (this.attack === a && a.t >= e + d.recovery) this.endAttack();
  }

  activeFrame(a, dt = 0) {
    const d = a.def, g = this.game;
    if (d.tick) {
      // 전기톱: 일정 간격마다 판정을 새로 해서 계속 갈아냄
      a.tickT = (a.tickT ?? 0) - dt;
      if (a.tickT > 0) return;
      a.tickT = d.tick;
      a.hit.clear();
      g.debris.sparks(this.x + this.facing * 1.2 * this.scale, 1.2 * this.scale, this.z + 0.2, 0xffd27a, 3, 3);
      tryHits(g, this, a);
      return;
    }
    if (d.projectile === 'barrel') {
      if (!a.spawned) {
        a.spawned = true;
        if (this.carry?.kind === 'barrel') g.spawnProjectile({ kind: 'barrel', x: this.x + this.facing * 0.5, y: 1.7 * this.scale, z: this.z, dir: this.facing, team: this.team, dmg: 0, owner: this });
        this.carry = null;
      }
      return;
    }
    if (d.projectile === 'gib') {
      if (!a.spawned) {
        a.spawned = true;
        if (this.carry) g.gibs.throwGib(this.carry, this.x + this.facing * 0.5, 1.4 * this.scale, this.z, this.facing, this);
        this.carry = null;
      }
      return;
    }
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
    if (d.stomp) { this.vy = Math.min(this.vy, -15); return; } // 착지할 때 판정
    if (d.dash) this.vx = this.facing * d.dash * this.legFactor();
    tryHits(g, this, a);
    if (d.shock && !a.shocked) { a.shocked = true; g.groundShock(this, a); }
  }

  endAttack() {
    this.attack = null;
    this.armorAcc = 0;
    this.spin = 0;
    this.setState(this.grounded ? 'idle' : 'jump');
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
    const g = this.game;
    // 좌우 이동 (벽에 막힘. 날아가던 몸은 벽에 튕김)
    const nx = this.x + this.vx * dt;
    if (g.wallAt(nx, this.z, this.y)) {
      if (this.state === 'down' || this.state === 'dying') {
        if (this.flung && Math.abs(this.vx) > 5) g.wallSlam(this);
        this.vx *= -0.3;
      } else this.vx = 0;
    } else this.x = nx;
    const nz = clamp(this.z + this.vz * dt, LANE.zMin, LANE.zMax);
    if (g.wallAt(this.x, nz, this.y)) this.vz = 0; else this.z = nz;
    // 바닥 (낭떠러지면 끝없이 떨어짐)
    const fl = g.floorAt(this.x, this.z);
    this.floor = fl;
    if (this.y > fl + 0.001 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      this.grounded = false;
      if (this.y <= fl && this.vy <= 0) {
        const impact = this.vy;
        this.y = fl; this.vy = 0; this.grounded = true;
        this.onLand(impact);
      }
    } else { this.y = fl; this.grounded = true; }
    if (this.y < -3.5 && !this.fellOut) { this.fellOut = true; g.fallOut(this); }
    const sliding = this.state === 'hurt' || ((this.state === 'down' || this.state === 'dying' || this.state === 'ko') && this.grounded);
    if (sliding) { const f = Math.pow(0.004, dt); this.vx *= f; this.vz *= f; }
    this.lowered = this.fall < 0.2 ? this.model.legLen - Math.max(this.sideLegLen('F'), this.sideLegLen('B')) : 0;
  }

  onLand(impact) {
    const g = this.game;
    if (this.state === 'jump') { this.setState('idle'); if (impact < -6) g.sfx?.('land'); }
    else if (this.state === 'attack' && this.attack?.def.stomp) {
      const a = this.attack;
      tryHits(g, this, a);
      g.stompImpact(this);
      a.t = a.def.startup + a.def.active; a.air = false; this.vx = 0;
    }
    else if (this.state === 'attack' && this.attack?.air) {
      if (this.attack.def.momentum) this.attack.air = false; else this.endAttack();
    }
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
        if (this.grounded) this.downT += dt;
        if (this.downT > 0.8) this.setState('getup');
        return true;
      case 'getup':
        if (this.st > 0.35) { this.setState('idle'); this.invuln = this.getupInvuln ?? 0.4; }
        return true;
      case 'dying':
        if (this.grounded && this.st > 0.55) this.shatter();
        return true;
    }
    return false;
  }

  // ------------------------------------------------ 애니메이션
  // 각 관절 목표각(T)을 정하고 부드럽게 따라감. hand*/shin* 은 팔꿈치/무릎 굽힘(부모 기준)
  pose(dt) {
    const P = this.parts, t = this.game.time;
    const T = { legF: 0, shinF: 0, legB: 0, shinB: 0, armF: .12, handF: .3, armB: .12, handB: .3, torso: 0, head: 0, grip: -0.6, twist: 0 };
    let fallT = 0, rate = 18, lift = 0, spread = 0;
    switch (this.state) {
      case 'idle': T.armF = .15 + Math.sin(t * 2.2) * .05; T.armB = .1 - Math.sin(t * 2.2) * .05; T.shinF = -.05; break;
      case 'walk': {
        const legs = this.legCount();
        if (legs === 1) {
          // 남은 다리로 깡충, 팔은 벌려서 균형
          const pulse = this.hopPulse();
          const sd = this.legOK('F') ? 'F' : 'B';
          T['leg' + sd] = -0.25 + pulse * 0.55;
          T['shin' + sd] = -0.5 + pulse * 0.45;
          T.armF = -0.2 + pulse * 0.3; T.armB = 0.2 - pulse * 0.3;
          T.torso = -0.12 - pulse * 0.1;
          lift = pulse * 0.13; spread = 0.7;
        } else if (legs === 0) {
          // 다리 없음: 팔로 기어감
          const w = Math.sin(this.walkPhase);
          T.armF = 1.7 + w * 0.6; T.armB = 1.7 - w * 0.6; T.handF = -.4 - w * .3; T.handB = -.4 + w * .3; T.torso = -0.35;
        } else {
          const w = Math.sin(this.walkPhase);
          T.legF = w * .7; T.legB = -w * .7;
          T.shinF = -Math.max(0, -w) * .9 - .1; T.shinB = -Math.max(0, w) * .9 - .1;
          T.armF = -w * .55; T.armB = w * .55; T.handF = .35 + Math.max(0, w) * .4; T.handB = .35 + Math.max(0, -w) * .4;
        }
        break;
      }
      case 'jump': T.legF = .9; T.shinF = -1.2; T.legB = -.3; T.shinB = -.9; T.armF = 2.3; T.armB = -.5; break;
      case 'hurt': T.torso = .3; T.head = .3; T.armF = -.6; T.armB = -.4; T.handF = .6; T.handB = .6; T.shinF = -.3; rate = 30; break;
      case 'down': case 'dying': case 'ko': fallT = Math.PI / 2; T.armF = 2.6; T.armB = 2.4; T.handF = .2; T.handB = .5; T.legF = .2; T.shinF = -.4; break;
      case 'getup': fallT = Math.PI / 2 * (1 - Math.min(1, this.st / .35)); T.legF = .8; T.shinF = -1.4; break;
      case 'dash':
        T.torso = -.5; T.armF = -.9; T.armB = -.7; T.handF = .4; T.handB = .4;
        T.legF = .9; T.shinF = -.3; T.legB = -.6; T.shinB = -1.2; T.head = .2; break;
      case 'repair': T.armF = 1.3 + Math.sin(t * 20) * .3; T.armB = 1.3 - Math.sin(t * 20) * .3; T.handF = .8; T.handB = .8; T.torso = -.4; break;
      case 'attack': this.attackPose(T); rate = 35; break;
    }
    // 드럼통을 머리 위로 들고 있음
    if (this.carry?.kind === 'barrel' && (this.state === 'idle' || this.state === 'walk' || this.state === 'jump')) {
      T.armF = T.armB = 2.9; T.handF = T.handB = 0.2;
    }
    const k = Math.min(1, dt * rate);
    for (const n of PART_ORDER) if (P[n].alive && T[n] !== undefined) P[n].rz += (T[n] - P[n].rz) * k;
    this.grip += (T.grip - this.grip) * k;
    this.twist += (T.twist - this.twist) * k;
    if (this.legCount() === 1 && this.fall < 0.3 && spread === 0 && this.state !== 'attack') spread = 0.35;
    P.armF.rx += (-spread - P.armF.rx) * k;
    P.armB.rx += (spread - P.armB.rx) * k;
    this.hopLift = lift;
    // 한 다리면 남은 다리 쪽으로 몸이 기움
    const leanT = this.legCount() === 1 && this.fall < 0.3 ? (this.legOK('F') ? 0.14 : -0.14) : 0;
    this.lean += (leanT - this.lean) * Math.min(1, dt * 10);
    this.fall += (fallT - this.fall) * Math.min(1, dt * 12);
  }

  attackPose(T) {
    const a = this.attack, d = a.def, ph = this.attackPhase(), t = this.game.time;
    const S = ph === 'startup', A = ph === 'active';
    this.spin = 0;
    switch (d.anim) {
      case 'punchF':
        T.armF = S ? -.4 : A ? 1.6 : .9; T.handF = S ? 1.6 : A ? 0 : .6; T.armB = .5; T.handB = 1.4;
        T.torso = A ? -.18 : 0; T.legF = .3; T.legB = -.2; T.shinB = -.2; break;
      case 'punchB':
        T.armB = S ? -.4 : A ? 1.6 : .9; T.handB = S ? 1.6 : A ? 0 : .6; T.armF = .5; T.handF = 1.4;
        T.torso = A ? -.18 : 0; T.legF = .3; T.legB = -.2; T.shinB = -.2; break;
      case 'kick':
        T.legF = S ? .5 : A ? 1.5 : .7; T.shinF = S ? -1.4 : A ? 0 : -.8;
        T.torso = S ? .1 : .35; T.armF = -.6; T.armB = .7; T.handB = 1; break;
      case 'flykick': T.legF = 1.45; T.shinF = 0; T.legB = -.5; T.shinB = -1.3; T.torso = .25; T.armF = -.8; T.armB = 1.4; break;
      case 'swing': // 내려찍기 (파이프, 도끼, 곡괭이)
        T.armF = S ? 3.0 : A ? .55 : .35; T.handF = S ? .6 : 0;
        T.torso = S ? .2 : -.25; T.armB = .3; T.legF = .35; T.legB = -.25; T.shinB = -.3; break;
      case 'slam': // 두 손 내려찍기 (오함마, 덩치)
        T.armF = T.armB = S ? 3.0 : A ? .7 : .5; T.handF = T.handB = S ? .3 : 0;
        T.torso = S ? .3 : -.45; T.legF = .4; T.shinF = -.4; T.legB = -.3; T.shinB = -.5; break;
      case 'hslash': case 'hswing': // 몸을 비틀어 가로로 휘두름 (마체테, 배트, 쇠사슬)
        T.armF = S ? 1.2 : 1.45; T.handF = .1; T.grip = -1.57;
        T.armB = .6; T.handB = .8;
        T.twist = S ? 1.1 : A ? -0.9 : -0.4;
        T.legF = .35; T.legB = -.3; T.shinB = -.3;
        if (d.anim === 'hswing') T.torso = S ? .15 : -.2;
        break;
      case 'golf': // 아래에서 위로 올려치기
        T.armF = S ? -1.0 : A ? 2.7 : 2.3; T.armB = S ? -.9 : A ? 2.5 : 2.1;
        T.handF = 0; T.handB = .2; T.grip = -1.57;
        T.torso = S ? -.35 : .15; T.twist = S ? .5 : A ? -.6 : -.4;
        T.legF = .3; T.shinF = -.35; T.legB = -.2; T.shinB = -.35; break;
      case 'saw': { // 전기톱: 앞으로 내밀고 덜덜 떨림
        const j = Math.sin(t * 90) * .05;
        T.armF = 1.25 + j; T.armB = 1.1 - j; T.handF = .15; T.handB = .45; T.grip = -1.35;
        T.torso = -.15; T.twist = Math.sin(t * 50) * .03;
        T.legF = .4; T.legB = -.35; T.shinB = -.25; break;
      }
      case 'dashAtk': // 어깨 박치기 + 무릎
        T.torso = -.6; T.armF = 1.2; T.handF = 1.5; T.armB = -.6; T.handB = .8;
        T.legF = 1.1; T.shinF = -1.1; T.legB = -.5; T.shinB = -.4; T.twist = -.35; T.head = .25; break;
      case 'stomp': // 두 발로 내려찍기
        T.legF = S ? .9 : .15; T.shinF = S ? -1.4 : -.1; T.legB = S ? .7 : -.15; T.shinB = S ? -1.4 : -.1;
        T.armF = 2.4; T.armB = 2.2; T.torso = .15; break;
      case 'throw':
        T.armF = S ? 2.9 : 1.2; T.handF = S ? .8 : 0; T.torso = S ? .25 : -.2; T.armB = .4; break;
      case 'charge':
        if (S) { T.torso = -.5; T.armF = T.armB = -.9; T.legF = .5; T.shinF = -.6; T.legB = -.5; T.shinB = -.4; }
        else if (A) { const w = Math.sin(t * 28); T.legF = w * .9; T.legB = -w * .9; T.shinF = -Math.max(0, -w) * 1.1; T.shinB = -Math.max(0, w) * 1.1; T.torso = -.6; T.armF = T.armB = -1.1; }
        else { T.head = Math.sin(t * 9) * .35; T.armF = .3; T.armB = .3; T.torso = .15; }
        break;
      case 'fuse': T.armF = 2.6; T.armB = 2.6; T.head = Math.sin(t * 30) * .15; break;
      case 'spin':
        T.legF = 1.4; T.shinF = 0; T.armF = 1.5; T.armB = 1.5; T.handF = T.handB = 0;
        if (A) this.spin = ((a.t - d.startup) / d.active) * Math.PI * 4;
        break;
      case 'wspin': // 무기를 수평으로 뻗고 제자리 회전 (강철 체인)
        T.armF = 1.45; T.handF = 0; T.grip = -1.57; T.armB = .4; T.handB = .8;
        T.legF = .35; T.legB = -.3; T.shinB = -.3; T.torso = -.1;
        if (S) T.twist = 1.0;
        if (A) this.spin = ((a.t - d.startup) / d.active) * Math.PI * 2;
        break;
    }
  }

  // ------------------------------------------------ 렌더링
  rootMatrix(m) {
    mat4.identity(m);
    mat4.translate(m, this.x, this.y, this.z);
    mat4.rotateY(m, -0.42 * this.facing + this.spin);
    mat4.scale(m, this.facing, 1, 1);
    if (this.hopLift || this.lean) { mat4.translate(m, 0, this.hopLift * this.scale, 0); mat4.rotateX(m, this.lean); }
    if (this.twist) mat4.rotateY(m, this.twist);
    const ff = this.fall / (Math.PI / 2);
    mat4.translate(m, 0, 0.22 * this.scale * ff - this.lowered * this.scale, 0);
    mat4.rotateZ(m, this.fall);
    mat4.scale(m, this.scale, this.scale, this.scale);
    return m;
  }

  partMatrix(k, root, out) {
    const p = this.parts[k], mp = this.model.parts[k], piv = mp.pivot;
    if (mp.parent) this.partMatrix(mp.parent, root, out); else mat4.copy(out, root);
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
    if (this.hidden) return;
    if (this.invuln > 0 && this.team === 'hero' && Math.floor(this.game.time * 20) % 2) return;
    const root = this.rootMatrix(M);
    const tint = this.tint();
    for (const k of PART_ORDER) {
      const mp = this.model.parts[k];
      if (!this.parts[k].alive) {
        // 몸에 남은 붉은 단면 (부모가 살아 있을 때만)
        if (!mp.parent || this.parts[mp.parent].alive) {
          this.partMatrix(k, root, PM);
          r.drawMesh(mp.stump, PM, tint);
        }
        continue;
      }
      this.partMatrix(k, root, PM);
      r.drawMesh(mp.mesh, PM, tint);
      if (k === 'handF' && this.weapon) {
        mat4.copy(WM, PM);
        mat4.translate(WM, 0, -this.model.handLen, 0);
        mat4.rotateZ(WM, this.grip);
        r.drawMesh(getModel(r, WEAPON_MODEL[this.weapon.type]).mesh, WM, tint);
      }
      if (k === 'handF' && this.carry?.kind === 'barrel') {
        mat4.copy(WM, root);
        mat4.translate(WM, 0.05, this.model.height + 0.02, 0);
        r.drawMesh(getModel(r, 'barrel').mesh, WM, tint);
      } else if (k === 'handF' && this.carry) {
        const c = this.carry;
        mat4.copy(WM, PM);
        if (c.limb) {
          // 팔·다리·머리: 관절 쪽을 쥐고 무기처럼 뻗음
          if (!c.local) {
            const M0 = c.members[0].M, s = Math.hypot(M0[0], M0[1], M0[2]);
            const inv = mat4.invert(mat4.create(), M0);
            c.local = c.members.map(m => { const L = mat4.multiply(mat4.create(), inv, m.M); return mat4.multiply(L, mat4.scale(mat4.create(), s, s, s), L); });
          }
          mat4.translate(WM, 0, -this.model.handLen, 0);
          mat4.rotateZ(WM, this.grip);
          mat4.rotateZ(WM, c.limb === 'head' ? -Math.PI / 2 : Math.PI / 2);
          c.lastM = c.members.map((mem, i) => { const out = mat4.multiply(mat4.create(), WM, c.local[i]); r.drawMesh(mem.mesh, out, tint); return out; });
        } else {
          mat4.translate(WM, 0.05, -this.model.handLen - 0.1, 0);
          mat4.translate(WM, -c.c0[0], -c.c0[1], -c.c0[2]);
          for (const mem of c.members) {
            mat4.multiply(R2, WM, mem.M);
            r.drawMesh(mem.mesh, R2, tint);
          }
        }
      }
    }
  }

  // 부위(와 그 아래 마디)를 떼어냄. h.mode: cut/knock/saw → 덩어리로 날아감, crush → 그 자리에서 박살
  severPart(k, dir, h = {}) {
    const p = this.parts[k];
    if (!p.alive) return;
    const g = this.game;
    const root = this.rootMatrix(M);
    const child = CHILD[k];
    const withChild = child && this.parts[child].alive;
    const members = [this.member(k, root, withChild ? 'cut' : 'cutTB')];
    if (withChild) members.push(this.member(child, root, 'cut'));
    this.partMatrix(k, root, PM);
    const jx = PM[12], jy = PM[13], jz = PM[14];
    p.alive = false; p.rz = 0; p.rx = 0;
    if (withChild) { const c = this.parts[child]; c.alive = false; c.rz = 0; c.rx = 0; }
    if (h.mode === 'crush') {
      for (const m of members) g.debris.burst(m.voxels, m.M, { frac: .9, size: .1, impulse: [dir * 2, 1.5, 0], spread: 2.8 });
      g.bleed(jx, jy, jz, dir, 45);
    } else {
      const fl = h.fling ?? 1;
      const v = gibVelocity(k, dir, this.vx);
      v[0] *= fl; v[1] *= 0.6 + 0.4 * fl;
      g.gibs.spawnGroup(members, v, k);
      g.bleed(jx, jy, jz, dir, h.mode === 'saw' ? 40 : 26);
    }
    g.gibs.spurt(this, k, h.mode === 'saw' ? 0.9 : 0.5);
    if ((k === 'armF' || k === 'handF') && this.weapon) g.dropWeapon(this);
  }

  // 부위 k의 현재 월드 행렬 + 표시할 메시 변형
  member(k, root, variant) {
    const mp = this.model.parts[k];
    const v = mp[variant] ?? mp.cut;
    const Mk = this.partMatrix(k, root, mat4.create());
    return { mesh: v.mesh, voxels: v.voxels, M: Mk };
  }

  // 남아 있는 부위를 마디째로 묶어 그룹 목록을 만듦
  groups(root, keys, torsoVariant = 'cut') {
    const out = [];
    for (const k of keys) {
      if (!this.parts[k].alive) continue;
      const child = CHILD[k];
      const withChild = child && this.parts[child].alive;
      const list = [this.member(k, root, k === 'torso' ? torsoVariant : withChild ? 'cut' : 'cutTB')];
      if (withChild) list.push(this.member(child, root, 'cut'));
      out.push({ k, list });
    }
    return out;
  }

  // 죽을 때: 남은 부위가 각각 떨어져 나감
  shatter() {
    if (this.remove) return;
    this.remove = true;
    const root = this.rootMatrix(M);
    const g = this.game;
    const dir = this.vx >= 0 ? 1 : -1;
    for (const { k, list } of this.groups(root, TOP)) {
      g.gibs.spawnGroup(list, gibVelocity(k, dir * 0.6, this.vx * 0.3, true), k);
      if (k !== 'torso') g.bleed(list[0].M[12], list[0].M[13], list[0].M[14], dir, 12);
    }
    g.onShatter(this);
  }

  // 허리 절단: 상반신(몸통+머리+팔)과 하반신(다리)이 분리돼 날아감
  bisect(dir) {
    if (this.remove) return;
    this.remove = true;
    const root = this.rootMatrix(M);
    const g = this.game;
    const upper = this.groups(root, ['torso', 'head', 'armF', 'armB'], this.parts.head.alive ? 'cutB' : 'cutTB').flatMap(x => x.list);
    const lower = this.groups(root, ['legF', 'legB']).flatMap(x => x.list);
    this.partMatrix('torso', root, PM);
    const wx = PM[12], wy = PM[13], wz = PM[14];
    if (upper.length) g.gibs.spawnGroup(upper, [dir * 2.6 + this.vx * .2, 6.5, (Math.random() - .5)], 'upper', 0.45);
    if (lower.length) g.gibs.spawnGroup(lower, [dir * 0.5, 1.6, 0], 'lower', 0.25);
    g.bleed(wx, wy, wz, dir, 70);
    g.bleed(wx, wy + .2, wz, -dir, 30);
    g.onShatter(this);
  }
}

const R2 = mat4.create();

function gibVelocity(k, dir, base = 0, burst = false) {
  const up = burst ? 1.2 : 1;
  const side = k.endsWith('F') ? 1 : k.endsWith('B') ? -1 : 0;
  const r = Math.random;
  if (k === 'head') return [base + dir * (1.5 + r() * 1.5), (5 + r() * 2) * up, (r() - .5)];
  if (k.startsWith('arm') || k.startsWith('hand')) return [base + dir * (2 + r() * 2), (3 + r() * 2) * up, side * (0.6 + r())];
  if (k.startsWith('leg') || k.startsWith('shin')) return [base + dir * (1 + r() * 1.5), (2 + r() * 1.5) * up, side * (0.4 + r() * 0.6)];
  return [base + dir * 0.8, 2.2 * up, 0];
}
