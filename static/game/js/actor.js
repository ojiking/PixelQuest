// 모든 캐릭터(플레이어/동료/적)의 공통 기반: 물리, 상태, 공격 진행, 절차적 애니메이션, 부위 렌더링
import { settleK } from './gibs.js';
import { mat4, clamp } from './math.js';
import { BLOOD, BERSERK, SETTLE, GRAVITY, LANE, ATTACKS, WEAPONS, LIMB_WEAPONS, FLEX } from './config.js';
import { hexToRgb } from './voxel.js';
import { getModel, WEAPON_MODEL } from './models.js';
import { tryHits } from './combat.js';

const M = mat4.create(), PM = mat4.create(), WM = mat4.create(), RM = mat4.create(), RP = mat4.create();
// 부모가 자식보다 먼저 (위팔→아래팔, 허벅지→정강이)
export const PART_ORDER = ['legB', 'shinB', 'armB', 'handB', 'torso', 'head', 'legF', 'shinF', 'armF', 'handF'];
const PART_HP = { head: .5, armF: .35, armB: .35, handF: .25, handB: .25, legF: .4, legB: .4, shinF: .3, shinB: .3 };
export const CHILD = { armF: 'handF', armB: 'handB', legF: 'shinF', legB: 'shinB' };
const TOP = ['head', 'torso', 'armF', 'armB', 'legF', 'legB'];
const FLASH = [1, 1, 1, .75];
const CHAR = [.08, .05, .03, .7];
const HEAVY = new Set(['barrel', 'moto']); // 머리 위로 들어 던지는 물건
const BURN = [1, .45, .08, .35];
const WARN = [.55, 1, 1, .62];   // 공격 예고: 피(빨강)와 겹치지 않는 밝은 청록
const GHOST = [.6, .9, 1, .7];   // 숄더 태클 잔상 색

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
    this.wantMove = true; // 절뚝거림 박자는 실제 속도가 아니라 걸으려는 의지로 진행
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
    if (this.team === 'hero' && def.anim !== 'batswing' && (def.weapon || def.anim === 'kick' || def.anim === 'flykick' || def.anim === 'dashAtk')) this.game.sfx?.('swing');
    this.attack = { key, def, t: 0, hit: new Set(), activated: false, ended: false, spawned: false };
    this.setState('attack');
    if (!def.air && this.grounded) { this.vx = 0; this.vz = 0; }
    if (def.lunge && this.grounded) this.vx = this.facing * def.lunge;   // 맨주먹: 한 걸음 내딛으며 침
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
    if (hd && this.wspd) spd *= this.wspd;
    if (this.berserk) spd *= BERSERK.atkSpeed;           // 광폭화: 공격 속도↑
    a.t += dt * spd;
    const s = d.startup, e = s + d.active;
    if (a.t >= s && (a.t < e || !a.activated)) {
      if (!a.activated && d.lunge && !d.weapon && this.team === 'hero') this.game.punchStreak?.(this, d);
      a.activated = true;
      this.activeFrame(a, dt);
    } else if (a.t >= e && !a.ended) {
      a.ended = true;
      if (d.dash || d.rush) this.vx = 0;
    }
    if (this.attack === a && a.t >= e + d.recovery) this.endAttack();
  }

  activeFrame(a, dt = 0) {
    const d = a.def, g = this.game;
    // 샷건: 한 번만 발사 (탄약 1 소모, 총구 불꽃·산탄 궤적·반동)
    if (d.shot) {
      if (a.spawned) return;
      a.spawned = true;
      const tip = this.weaponTip(1.15);
      g.muzzleFlash(tip, this.facing);
      this.vx = -this.facing * (d.recoil ?? 3.2);      // 반동으로 뒤로 밀림
      if (this.grounded) this.vy = Math.max(this.vy, 1.6);   // 살짝 들썩
      if (this.weapon) { this.weapon.dur -= 1; if (this.weapon.dur <= 0) this.weapon.empty = true; }
      tryHits(g, this, a);
      return;
    }
    // 화염 분사: 매 프레임 불길 입자, 일정 간격마다 판정과 연료 소모
    if (d.flame) {
      const tip = this.weaponTip(1.05);
      g.flameSpray(tip, this.facing, dt);
    }
    if (d.tick) {
      // 전기톱: 일정 간격마다 판정을 새로 해서 계속 갈아냄
      if (d.rush) this.vx = this.facing * d.rush * this.legFactor(); // 톱을 내밀고 밀고 들어옴
      a.tickT = (a.tickT ?? 0) - dt;
      if (a.tickT > 0) return;
      a.tickT = d.tick;
      a.hit.clear();
      if (d.flame && this.weapon) {
        this.weapon.dur -= 1;
        g.sfx?.('flame');
        if (this.weapon.dur <= 0) { this.weapon.empty = true; a.t = d.startup + d.active; }
      }
      g.debris.sparks(this.x + this.facing * 1.2 * this.scale, 1.2 * this.scale, this.z + 0.2, 0xffd27a, 3, 3);
      tryHits(g, this, a);
      return;
    }
    if (d.grab) {
      if (!a.spawned) { a.spawned = true; if (d.grab === 'knee') g.grabKnee(this); else g.grabThrow(this); }
      return;
    }
    if (d.projectile === 'barrel') {
      if (!a.spawned) {
        a.spawned = true;
        if (this.carry?.kind === 'moto' && this.team === 'hero') g.stat('moto');
        if (HEAVY.has(this.carry?.kind)) g.spawnProjectile({ kind: this.carry.kind, x: this.x + this.facing * 0.5, y: 1.7 * this.scale, z: this.z, dir: this.facing, team: this.team, dmg: 0, owner: this });
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

  // 손에 든 무기의 끝(총구/노즐) 월드 위치
  weaponTip(len) {
    const root = this.rootMatrix(RM);
    this.partMatrix('handF', root, RP);
    mat4.translate(RP, 0, -this.model.handLen, 0);
    mat4.rotateZ(RP, this.grip);
    return mat4.point([0, 0, 0], RP, len / this.scale, 0.05, 0);
  }

  // 불붙은 상태: 3초 동안 지속 피해 + 몸에서 불길
  updateBurn(dt) {
    if (!(this.burnT > 0) || this.remove) return;
    const g = this.game;
    this.burnT -= dt;
    if (Math.random() < dt * 25) g.debris.puff(this.x + (Math.random() - .5) * .4, this.y + 0.4 + Math.random() * 1.3 * this.scale, this.z, [0xffe14a, 0xff8a1f, 0xd94a2a], 2, .6, .13, .4, -0.6);
    this.burnTick = (this.burnTick ?? 0.3) - dt;
    if (this.burnTick > 0 || this.dead) return;
    this.burnTick = 0.3;
    this.hp -= 2;
    if (this.hp <= 0) { this.charred = true; g.kill(this, { dir: this.facing, knock: 2, attacker: this.burnBy, mode: 'burn' }); }
  }

  // ------------------------------------------------ 물리 / 공통 상태
  physics(dt) {
    this.st += dt;
    this.updateBurn(dt);
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
        if ((this.grounded && this.st > 0.55) || this.st > 2.5) this.shatter();
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
      case 'idle':
        if (this.team === 'hero' && this.modelKey === 'player' && !this.weapon && !this.carry) {
          // 맨손: 주먹을 턱 앞에 든 파이팅 자세 (살짝 들썩)
          const b = Math.sin(t * 5) * .04;
          T.armF = 1.0 + b; T.handF = 2.0; T.armB = .85 - b; T.handB = 2.15; T.torso = -.06;
          T.legF = .25; T.shinF = -.1; T.legB = -.2; T.shinB = -.15; lift = Math.abs(b) * .3;
        } else { T.armF = .15 + Math.sin(t * 2.2) * .05; T.armB = .1 - Math.sin(t * 2.2) * .05; T.shinF = -.05; }
        this.gunHold(T, t);
        break;
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
        this.gunHold(T, t);
        break;
      }
      case 'grab': T.armF = T.armB = 1.35; T.handF = T.handB = .45; T.torso = -.12; T.legF = .3; T.legB = -.25; T.shinB = -.2; break;
      case 'jump': T.legF = .9; T.shinF = -1.2; T.legB = -.3; T.shinB = -.9; T.armF = 2.3; T.armB = -.5; break;
      case 'hurt': T.torso = .3; T.head = .3; T.armF = -.6; T.armB = -.4; T.handF = .6; T.handB = .6; T.shinF = -.3; rate = 30; break;
      case 'down': case 'dying': case 'ko': fallT = Math.PI / 2; T.armF = 2.6; T.armB = 2.4; T.handF = .2; T.handB = .5; T.legF = .2; T.shinF = -.4; break;
      case 'getup': fallT = Math.PI / 2 * (1 - Math.min(1, this.st / .35)); T.legF = .8; T.shinF = -1.4; break;
      case 'dash':
        T.torso = -.5; T.armF = -.9; T.armB = -.7; T.handF = .4; T.handB = .4;
        T.legF = .9; T.shinF = -.3; T.legB = -.6; T.shinB = -1.2; T.head = .2; break;
      case 'repair': T.armF = 1.3 + Math.sin(t * 20) * .3; T.armB = 1.3 - Math.sin(t * 20) * .3; T.handF = .8; T.handB = .8; T.torso = -.4; break;
      case 'attack': this.poseRate = 0; this.attackPose(T); rate = this.poseRate || 35; break;
    }
    // 드럼통을 머리 위로 들고 있음
    if (HEAVY.has(this.carry?.kind) && (this.state === 'idle' || this.state === 'walk' || this.state === 'jump')) {
      T.armF = T.armB = 2.9; T.handF = T.handB = 0.2;
    }
    // 오토바이 탑승: 앉은 자세로 핸들을 잡음
    if (this.mounted && (this.state === 'idle' || this.state === 'walk' || this.state === 'jump' || this.state === 'attack')) {
      T.legF = T.legB = 1.35; T.shinF = T.shinB = -1.35; T.armF = T.armB = 1.2; T.handF = T.handB = .35;
      T.torso = this.revving ? -.45 : -.25; T.head = 0;
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
    if (this.weapon && FLEX[this.weapon.type] && this.parts.handF.alive) this.simRope(dt); else this.rope = null;
  }

  // 채찍·체인: 손잡이 끝에 매달린 마디들을 간단한 물리(Verlet)로 움직임
  simRope(dt) {
    const type = this.weapon.type, f = FLEX[type], g = this.game;
    const root = this.rootMatrix(RM);
    this.partMatrix('handF', root, RP);
    mat4.translate(RP, 0, -this.model.handLen, 0);
    mat4.rotateZ(RP, this.grip);
    mat4.translate(RP, f.handle / this.scale, 0, 0);
    const ax = RP[12], ay = RP[13], az = RP[14];
    let dx = RP[0], dy = RP[1], dz = RP[2];
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    const segL = i => (f.segLens ? f.segLens[i - 1] : f.seg) * this.scale; // i번째 마디 길이
    if (!this.cum || this.cumType !== type) { // 손잡이부터 각 점까지 누적 거리
      this.cum = [0]; this.cumType = type;
      for (let i = 1; i <= f.segs; i++) this.cum.push(this.cum[i - 1] + segL(i));
    }
    const cum = this.cum;
    if (!this.rope || this.rope.type !== type) {
      this.rope = { type, p: [] };
      for (let i = 0; i <= f.segs; i++) {
        const x = ax + dx * cum[i], y = ay + dy * cum[i], z = az + dz * cum[i];
        this.rope.p.push([x, y, z, x, y, z]);
      }
    }
    const P = this.rope.p;
    const swinging = this.attack?.def.weapon && this.attackPhase() !== 'recovery';
    const stiff = 1 - Math.pow(1 - (swinging ? f.stiffAtk : f.stiffIdle), dt * 60);
    P[0][0] = P[0][3] = ax; P[0][1] = P[0][4] = ay; P[0][2] = P[0][5] = az;
    const gstep = f.grav * dt * dt;
    for (let i = 1; i < P.length; i++) {
      const q = P[i];
      const vx = (q[0] - q[3]) * f.damp, vy = (q[1] - q[4]) * f.damp, vz = (q[2] - q[5]) * f.damp;
      q[3] = q[0]; q[4] = q[1]; q[5] = q[2];
      q[0] += vx; q[1] += vy - gstep; q[2] += vz;
      // 손잡이 방향으로 곧게 뻗으려는 힘 (휘두를 때 강해짐 → 휘어지며 펴짐)
      q[0] += (ax + dx * cum[i] - q[0]) * stiff;
      q[1] += (ay + dy * cum[i] - q[1]) * stiff;
      q[2] += (az + dz * cum[i] - q[2]) * stiff;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i];
        const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
        const d = Math.hypot(ex, ey, ez) || 1e-6;
        const k = segL(i) / d;
        b[0] = a[0] + ex * k; b[1] = a[1] + ey * k; b[2] = a[2] + ez * k;
      }
    }
    for (let i = 1; i < P.length; i++) {
      const fl = g.floorAt(P[i][0], P[i][2]);
      if (fl > -50 && P[i][1] < fl + 0.04) P[i][1] = fl + 0.04;
    }
    // 채찍 끝이 빠르게 움직이면 '딱' 불꽃
    if (f.crack && swinging && this.attackPhase() === 'active') {
      const t = P[P.length - 1];
      if (Math.hypot(t[0] - t[3], t[1] - t[4], t[2] - t[5]) / Math.max(dt, 1e-3) > 9 && Math.random() < 0.5) g.debris.sparks(t[0], t[1], t[2], 0xfff3c0, 3, 2);
    }
  }

  // 줄 마디를 인스턴스 큐브로 채움
  fillRope(buf, n, cap) {
    if (!this.rope || this.hidden) return n;
    const f = FLEX[this.rope.type], P = this.rope.p, s = this.scale;
    const C = f.colors.map(hexToRgb), T = hexToRgb(f.tip);
    const put = (x, y, z, size, c) => {
      if (n >= cap) return;
      const o = n * 7;
      buf[o] = x; buf[o + 1] = y; buf[o + 2] = z; buf[o + 3] = size; buf[o + 4] = c[0]; buf[o + 5] = c[1]; buf[o + 6] = c[2];
      n++;
    };
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], u = i / (P.length - 1);
      const size = (f.size[0] + (f.size[1] - f.size[0]) * u) * s;
      const c = i >= P.length - 2 ? T : C[i % C.length];
      if (f.stick && i - 1 >= f.stick.from) {
        // 단단한 막대: 마디를 따라 큐브를 촘촘히 (양 끝은 검은 띠)
        const SC = hexToRgb(f.stick.color), BC = hexToRgb(f.stick.band), m = 7;
        for (let k = 0; k <= m; k++) {
          const u2 = k / m;
          put(a[0] + (b[0] - a[0]) * u2, a[1] + (b[1] - a[1]) * u2, a[2] + (b[2] - a[2]) * u2, f.stick.size * s, k === 0 || k === m ? BC : SC);
        }
        continue;
      }
      if (f.ball) {
        put(b[0], b[1], b[2], size, c);                                                     // 고리
        put((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, size * 0.55, C[1]);    // 연결부
      } else {
        put((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, size, c);
        put(b[0], b[1], b[2], size * 0.95, c);
      }
    }
    if (f.ball) {
      const t = P[P.length - 1], b = f.ball * s;
      put(t[0], t[1], t[2], b, T);
      if (f.spikes) { // 가시: 쇠공 둘레 6방향
        const SC = hexToRgb(f.spikes), o = b * 0.62, ss = b * 0.32;
        for (const [ox, oy, oz] of [[o, 0, 0], [-o, 0, 0], [0, o, 0], [0, -o, 0], [0, 0, o], [0, 0, -o]]) put(t[0] + ox, t[1] + oy, t[2] + oz, ss, SC);
      }
    }
    return n;
  }

  // 양손 총기(샷건·화염 스프레이)는 늘어뜨리지 않고 총구를 앞쪽 아래로 향한 '로우 레디' 자세로 듦
  gunHold(T, t) {
    const w = this.weapon?.type;
    if (w !== 'shotgun' && w !== 'flamer') return;
    const bob = Math.sin(t * 3) * .03;
    // 허리 높이에서 총구를 앞으로 수평: 오른팔은 팔꿈치를 뒤로 접어 개머리판을 옆구리에 끼고, 왼팔은 앞에서 총열을 받침
    T.armF = .15 + bob; T.handF = 1.55; T.grip = -1.72;
    T.armB = .75 + bob; T.handB = .85; T.twist = .42;   // 몸을 옆으로 돌려 총이 화면 가로로 보이게
                          // 왼손: 앞쪽 펌프를 받침
    T.torso = -.05;
  }

  attackPose(T) {
    const a = this.attack, d = a.def, ph = this.attackPhase(), t = this.game.time;
    const S = ph === 'startup', A = ph === 'active';
    this.spin = 0;
    switch (d.anim) {
      case 'punchF': // 잽: 가드 자세에서 앞손을 곧게 내지름 (어깨를 들며 팔꿈치를 펴는 동작)
        T.armF = S ? 1.05 : A ? 1.62 : 1.2; T.handF = S ? 2.15 : A ? 0.02 : 1.2;
        T.armB = .95; T.handB = 2.1;                         // 뒷손은 턱 앞 가드
        T.torso = A ? -.22 : -.08; T.twist = S ? -.1 : A ? .4 : .2; T.head = A ? .1 : 0;   // 칠 때 몸을 옆으로 돌려 팔이 화면 가로로 뻗어 보이게
        T.legF = .42; T.shinF = -.1; T.legB = -.32; T.shinB = -.28; break;
      case 'punchB': // 스트레이트: 허리를 크게 틀며 뒷손을 끝까지 뻗음
        T.armB = S ? 1.0 : A ? 1.66 : 1.2; T.handB = S ? 2.2 : A ? 0.02 : 1.2;
        T.armF = .9; T.handF = 2.1;
        T.torso = A ? -.3 : -.05; T.twist = S ? -.35 : A ? .5 : .25; T.head = A ? .12 : 0;
        T.legF = .48; T.shinF = -.15; T.legB = -.42; T.shinB = -.15; break;
      case 'elbow': // 팔꿈치 훅: 팔을 접은 채 몸통 회전으로 휘두름
        T.armF = S ? 1.3 : 1.6; T.handF = 2.6; T.armB = .95; T.handB = 2.1;
        T.torso = A ? -.25 : 0; T.twist = S ? -.45 : A ? .55 : .3; T.head = A ? .15 : 0;
        T.legF = .42; T.legB = -.32; T.shinB = -.25; break;
      case 'kick': // 앞차기: 무릎을 당겼다가 발바닥으로 밀어 찬다 (상체를 뒤로 젖혀 균형)
        T.legF = S ? 1.3 : A ? 1.62 : .8; T.shinF = S ? -1.9 : A ? 0.02 : -.9;
        T.legB = -.12; T.shinB = -.08;
        T.torso = S ? .15 : A ? .45 : .2; T.armF = .7; T.handF = 1.9; T.armB = .4; T.handB = 1.9; break;
      case 'knee': // 멱살 잡고 무릎 올려차기
        T.armF = T.armB = A ? 1.0 : 1.3; T.handF = T.handB = .6; T.torso = A ? .25 : 0;
        T.legF = S ? .4 : A ? 1.75 : .9; T.shinF = S ? -.6 : A ? -2.2 : -1.2; T.legB = -.15; break;
      case 'gthrow': // 몸을 비틀어 집어던짐
        T.armF = T.armB = S ? 1.5 : 2.4; T.handF = T.handB = .2; T.twist = S ? .9 : -1.0; T.torso = S ? .15 : -.35;
        T.legF = .45; T.shinF = -.3; T.legB = -.35; T.shinB = -.35; break;
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
      case 'batswing': { // 야구 배트 풀스윙. 배트 방향 θ = armF + handF + grip (0 = 정면 수평, 1.57 = 위, 3.14 = 뒤)
        const big = d.big ? 1.15 : 1;
        // 세 자세: 장전(배트를 뒷어깨 위로, 앞발 들기) → 임팩트(팔을 뻗고 배트 수평) → 마무리(반대 어깨 위로 감김)
        const LOAD = { armF: 2.55 * big, handF: .95, th: 2.35, armB: 2.3, handB: 1.1, twist: .95 * big, torso: .18, head: -.05, legF: .75, shinF: -1.05, legB: -.08, shinB: -.2 };
        const HIT = { armF: 1.45, handF: .05, th: 0, armB: 1.35, handB: .25, twist: -.15, torso: -.28, head: .1, legF: .6, shinF: -.08, legB: -.55, shinB: -.25 };
        const FOL = { armF: 2.45, handF: 1.05, th: 2.95, armB: 2.1, handB: 1.0, twist: -.7 * big, torso: -.12, head: .05, legF: .5, shinF: -.1, legB: -.6, shinB: -.45 };
        const mix = (A0, B0, u) => { for (const k in A0) { const v = A0[k] + (B0[k] - A0[k]) * u; if (k === 'th') T.grip = v - (T.armF + T.handF); else T[k] = v; } };
        const set = P0 => { for (const k in P0) if (k !== 'th') T[k] = P0[k]; T.grip = P0.th - (P0.armF + P0.handF); };
        if (S) { set(LOAD); this.poseRate = 16; }                   // 천천히 감아 올림 (예비 동작이 보이게)
        else if (A) {                                                // 임팩트 구간: 순식간에 휘두름
          const u = Math.min(1, (a.t - d.startup) / d.active);
          if (u < .55) mix(LOAD, HIT, u / .55); else mix(HIT, FOL, (u - .55) / .45);
          this.poseRate = 70;
          if (!a.trailed) { a.trailed = 0; if (this.team === 'hero') this.game.sfx?.('batswing'); }   // 휘두르는 순간 '부웅'
          if (a.t - a.trailed > .012) { a.trailed = a.t; this.game.batTrail?.(this); }   // 배트 끝 잔상
        } else {                                                     // 마무리: 감긴 자세로 잠깐 멈췄다가 풀림
          const r = (a.t - d.startup - d.active) / d.recovery;
          set(FOL); this.poseRate = r < .45 ? 40 : 9;
        }
        break;
      }
      case 'golf': // 아래에서 위로 올려치기
        T.armF = S ? -1.0 : A ? 2.7 : 2.3; T.armB = S ? -.9 : A ? 2.5 : 2.1;
        T.handF = 0; T.handB = .2; T.grip = -1.57;
        T.torso = S ? -.35 : .15; T.twist = S ? .5 : A ? -.6 : -.4;
        T.legF = .3; T.shinF = -.35; T.legB = -.2; T.shinB = -.35; break;
      case 'flame': { // 화염 스프레이: 노즐을 앞으로, 살짝 흔들며 분사
        const j = Math.sin(t * 7) * .12;
        T.armF = 1.3 + j; T.armB = 1.15 + j; T.handF = .1; T.handB = .5; T.grip = -1.5;
        T.torso = -.1; T.legF = .4; T.legB = -.3; T.shinB = -.25; break;
      }
      case 'shoot': { // 샷건: 어깨에 붙여 조준 → 발사 반동 → 펌프 장전
        const ta = a.t - d.startup;                      // 발사 순간부터 지난 시간
        T.legF = .5; T.shinF = -.15; T.legB = -.45; T.shinB = -.3;   // 앞발을 내딛고 버티는 자세
        T.twist = .42;                                   // 옆모습: 총이 화면 가로로 길게 보이게
        if (ta < 0) {                                    // 조준: 개머리판을 어깨에, 총열 수평
          T.armF = 1.78; T.handF = .05; T.grip = -1.83; T.armB = 1.7; T.handB = .2;   // 어깨 높이로 들어 총열 수평
          T.torso = -.12; T.head = .08;
        } else if (ta < .16) {                           // 반동: 상체가 젖혀지고 총구가 위로 튐
          const k = 1 - ta / .16;
          T.armF = 1.78 + .6 * k; T.handF = .05; T.grip = -1.83 + .2 * k; T.armB = 1.65 + .5 * k; T.handB = .3;
          T.torso = .1 + .45 * k; T.head = -.25 * k; T.legF = .7; T.shinF = -.05;
        } else {                                         // 펌프: 왼손을 당겼다 밀며 장전, 탄피 배출
          const u = Math.min(1, (ta - .16) / .26), pull = Math.sin(u * Math.PI);
          T.armF = 1.7; T.handF = .1; T.grip = -1.82; T.armB = 1.6 - pull * .45; T.handB = .2 + pull * .7;
          T.torso = -.05; T.head = .05;
          if (u > .45 && !a.pumped) { a.pumped = true; this.game.shellEject?.(this); }
        }
        break;
      }
      case 'saw': { // 전기톱: 앞으로 내밀고 덜덜 떨림
        const j = Math.sin(t * 90) * .05;
        T.armF = 1.25 + j; T.armB = 1.1 - j; T.handF = .15; T.handB = .45; T.grip = -1.35;
        T.torso = -.15; T.twist = Math.sin(t * 50) * .03;
        T.legF = .4; T.legB = -.35; T.shinB = -.25; break;
      }
      case 'dashAtk': { // 숄더 태클: 상체를 깊게 숙이고 앞 어깨·팔뚝을 방패처럼 내밀어 들이받음
        const run = Math.sin(t * 30);
        T.torso = S ? -.45 : -.95; T.head = .55;
        T.armF = 1.75; T.handF = 2.5;           // 앞팔: 팔꿈치를 앞으로, 팔뚝은 가슴 앞에 접음
        T.armB = -1.0; T.handB = .5;            // 뒷팔: 뒤로 크게 젖힘
        T.legF = .9 + run * .5; T.shinF = -1.0 - Math.max(0, run) * .6; T.legB = -.7 - run * .4; T.shinB = -.6;
        T.twist = -.5; break;
      }
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
    if (this.flip) { const h = 0.9 * this.scale; mat4.translate(m, 0, h, 0); mat4.rotateZ(m, this.flip); mat4.translate(m, 0, -h, 0); }
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

  // 부위별 핏자국 (0~1). 셰이더에 묻은 양 + 개체별 무늬 시드 전달
  addBlood(k, amt) {
    if (!this.parts[k]?.alive) k = 'torso';
    this.blood ??= {};
    const cap = this.team === 'enemy' && !this.dead ? BLOOD.enemyMax : 1;
    this.blood[k] = Math.max(this.blood[k] || 0, Math.min(cap, (this.blood[k] || 0) + amt));
  }
  splatFor(k) {
    const v = this.blood?.[k];
    if (!v || v < 0.01) return null;
    this.splatBuf ??= {};
    this.splatSeed ??= [Math.random() * 50, Math.random() * 50, Math.random() * 50];
    const b = this.splatBuf[k] ??= new Float32Array([0, ...this.splatSeed]);
    b[0] = this === this.game.player ? Math.min(v, k === 'head' ? BLOOD.heroHeadMax : BLOOD.heroShowMax) : v;   // 주인공은 실루엣이 남게 상한
    return b;
  }
  // 주인공·볼트는 서서히 원래 색으로, 살아 있는 적은 아주 천천히, 시체는 그대로
  updateBlood(dt) {
    if (!this.blood || this.dead) return;
    const rate = this.team === 'hero' ? BLOOD.heroFade : BLOOD.enemyFade;
    if (this === this.game.player && !this.bathed && Object.keys(this.parts).filter(k => this.parts[k].alive).every(k => (this.blood[k] || 0) >= 0.85)) { this.bathed = true; this.game.stat('bath'); }
    for (const k in this.blood) this.blood[k] = Math.max(0, this.blood[k] - rate * dt);
  }

  // 시체: 튀고 미끄러지기를 멈추면 서서히 가라앉는 색, 다시 맞거나 들리면 즉시 원래 색
  updateSettle(dt) {
    const still = this.dead && this.grounded && Math.abs(this.vx) < 0.05 && Math.abs(this.vz) < 0.05 && !this.flung && !this.grabbedBy && !this.remove;
    this.settleT = still ? (this.settleT || 0) + dt : 0;
  }

  tint() {
    if (this.flash > 0) return FLASH;
    if (this.charred) return CHAR;
    if (this.dead && this.settleT > 0) {
      const k = settleK(this.settleT);
      if (k > 0) { this.settleTint ??= [...SETTLE.rgb, 0]; this.settleTint[3] = k * SETTLE.amount; return this.settleTint; }
    }
    if (this.burnT > 0 && Math.floor(this.game.time * 12) % 2) return BURN;
    const a = this.attack;
    if (a && a.def.telegraph && this.attackPhase() === 'startup' && Math.floor(this.game.time * 14) % 2) return WARN;
    if (this.revving && Math.floor(this.game.time * 14) % 2) return WARN; // 폭주족 돌진 예고
    return null;
  }

  draw(r) {
    if (this.hidden) return;
    if (this.invuln > 0 && this.team === 'hero' && Math.floor(this.game.time * 20) % 2) return;
    // 숄더 태클: 뒤로 늘어지는 청백색 잔상
    if (this.attack?.def.anim === 'dashAtk' && this.attack.t < this.attack.def.startup + this.attack.def.active) {
      const x0 = this.x;
      for (let i = 3; i >= 1; i--) {
        this.x = x0 - this.facing * 0.42 * i;
        const gm = this.rootMatrix(M);
        GHOST[3] = 0.85 - i * 0.12;
        for (const k of PART_ORDER) if (this.parts[k].alive) { this.partMatrix(k, gm, PM); r.drawMesh(this.model.parts[k].mesh, PM, GHOST); }
      }
      this.x = x0;
    }
    const root = this.rootMatrix(M);
    const tint = this.tint();
    if (this.mounted) {
      // 타고 있는 오토바이 (몸 아래)
      mat4.copy(WM, root);
      mat4.translate(WM, -0.05, 0, 0);
      r.drawMesh(getModel(r, 'moto').mesh, WM, tint);
    }
    if (this.shieldUp()) {
      // 맨홀 방패: 몸 앞쪽에
      mat4.copy(WM, root);
      mat4.translate(WM, 0.42, 0.95, 0.05);
      r.drawMesh(getModel(r, 'manhole').mesh, WM, this.guardBroken > 0 ? WARN : tint);
    }
    for (const k of PART_ORDER) {
      const mp = this.model.parts[k];
      if (!this.parts[k].alive) {
        // 몸에 남은 붉은 단면 (부모가 살아 있을 때만)
        if (!mp.parent || this.parts[mp.parent].alive) {
          this.partMatrix(k, root, PM);
          r.drawMesh(mp.stump, PM, tint, 0, 1, this.splatFor(mp.parent ?? 'torso'));
        }
        continue;
      }
      this.partMatrix(k, root, PM);
      r.drawMesh(mp.mesh, PM, tint, 0, 1, this.splatFor(k));
      if (k === 'handF' && this.weapon) {
        mat4.copy(WM, PM);
        mat4.translate(WM, 0, -this.model.handLen, 0);
        mat4.rotateZ(WM, this.grip);
        const fx = FLEX[this.weapon.type];
        r.drawMesh(getModel(r, fx ? fx.handleModel : WEAPON_MODEL[this.weapon.type]).mesh, WM, tint);
      }
      if (k === 'handF' && HEAVY.has(this.carry?.kind)) {
        mat4.copy(WM, root);
        mat4.translate(WM, 0.05, this.model.height + 0.02, 0);
        r.drawMesh(getModel(r, this.carry.kind).mesh, WM, tint);
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

  shieldUp() { return this.blocks && this.parts.armB.alive && this.parts.handB.alive; }

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
    if (h.mode === 'blast') h = { ...h, mode: 'knock', fling: 3 }; // 샷건: 부위가 멀리 날아감
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
    if ((k === 'armB' || k === 'handB') && this.blocks) g.dropShield(this);
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

  // 샷건 처치: 모든 부위가 사방으로 날아가고 몸통 일부는 터져 흩어짐
  blastApart(dir) {
    if (this.remove) return;
    this.remove = true;
    const root = this.rootMatrix(M);
    const g = this.game;
    const parts = ['head', 'armF', 'handF', 'armB', 'handB', 'legF', 'shinF', 'legB', 'shinB', 'torso'];
    for (const k of parts) {
      if (!this.parts[k].alive) continue;
      const m = this.member(k, root, k === 'torso' ? 'cutTB' : (this.model.parts[k].cutTB ? 'cutTB' : 'cut'));
      if (k === 'torso') g.debris.burst(m.voxels, m.M, { frac: .55, size: .12, impulse: [dir * 5, 3, 0], spread: 3.5 });
      const sp = 6 + Math.random() * 6;
      g.gibs.spawnGroup([m], [dir * sp + (Math.random() - .5) * 3, 3 + Math.random() * 5, (Math.random() - .5) * 4], k, 1.6);
    }
    const c = this.partMatrix('torso', root, PM);
    for (let i = 0; i < 3; i++) g.bleed(c[12], c[13] + .5, c[14], dir, 60);
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
