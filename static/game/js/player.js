import { Actor } from './actor.js';
import { PLAYER, WEAPONS, LIMB_WEAPONS } from './config.js';

const FIST_COMBO = ['jab', 'cross', 'kick'];
const FIST_COMBO4 = ['jab', 'cross', 'elbow', 'kick'];

export class Player extends Actor {
  constructor(game, stats) {
    super(game, 'player', { hp: stats.maxHp, team: 'hero', x: 3, z: 0 });
    this.power = stats.power;
    this.st8 = stats;                        // 정비소 업그레이드
    this.spd = PLAYER.speed * stats.speedMul;
    this.zspd = PLAYER.zSpeed * stats.speedMul;
    this.wpow = stats.wpow; this.wspd = stats.wspd; this.backMul = stats.backMul;
    this.otgAll = stats.otg; this.dashLv = stats.dashLv;
    this.comboIdx = 0;
    this.comboWindow = 0;
    this.buffer = 0;
    this.lastTarget = null;
    this.lastTargetT = 0;
    this.airAttacked = false;
    this.airDashed = false;
    this.dashCd = 0; this.dashDir = 1; this.dashAtkWindow = 0;
    this.lastTap = { code: null, t: 0 };
    this.getupInvuln = PLAYER.invulnAfterGetup;
  }

  // 좌우 키 두 번 연속 = 대쉬
  doubleTap(inp) {
    for (const [code, dir] of [['KeyD', 1], ['ArrowRight', 1], ['KeyA', -1], ['ArrowLeft', -1]]) {
      if (!inp.pressed(code)) continue;
      const now = this.game.time;
      const hit = this.lastTap.dir === dir && now - this.lastTap.t < 0.26;
      this.lastTap = { dir, t: now };
      if (hit) return dir;
    }
    return 0;
  }

  startDash(dir) {
    this.dashDir = dir || this.facing;
    this.facing = this.dashDir;
    this.setState('dash');
    this.dashCd = PLAYER.dashCooldown * (1 - 0.2 * this.dashLv);
    this.invuln = Math.max(this.invuln, 0.14 + 0.05 * this.dashLv);
    if (!this.grounded) { this.airDashed = true; this.vy = Math.max(this.vy, 1.8); }
    this.game.debris.puff(this.x - this.dashDir * .3, this.y + .15, this.z, [0xd8d0c0, 0xb8b0a0], 6, 1.2, .12, .3, -0.3);
    this.game.sfx?.('dash');
  }

  dashAttack() {
    const air = !this.grounded;
    this.startAttack('dashAtk');
    this.attack.air = air;
    this.vx = this.dashDir * 9;
  }

  perk(id) { return this.game.run.perks.has(id); }
  get combo() { return this.heldDef()?.combo ?? (this.st8.combo4 ? FIST_COMBO4 : FIST_COMBO); }

  update(dt) {
    const g = this.game, inp = g.input;
    if (inp.pressed('KeyJ')) this.buffer = 0.3;
    else this.buffer = Math.max(0, this.buffer - dt);
    if (inp.pressed('KeyK')) this.jumpBuf = 0.2;
    else this.jumpBuf = Math.max(0, (this.jumpBuf || 0) - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this.lastTargetT -= dt;
    this.dashCd -= dt; this.dashAtkWindow -= dt;
    const tap = this.doubleTap(inp);
    const wantDash = inp.pressed('KeyI') || tap !== 0;

    this.physics(dt);
    if (this.state === 'ko') { this.pose(dt); return; }
    if (this.updateCommon(dt)) { this.pose(dt); return; }

    const mx = inp.axisX(), mz = inp.axisZ();
    if (this.grabbing && this.state === 'idle') this.state = 'grab'; // 무릎 차기 후 다시 잡은 자세로
    switch (this.state) {
      case 'grab': {
        const e = this.grabbing;
        if (!e || e.dead || e.grabbedBy !== this) { g.releaseGrab(this); break; }
        this.vx = this.vz = 0;
        this.grabT += dt;
        if (this.grabT > e.grabEscape) { g.releaseGrab(this, true); break; }
        if (inp.pressed('KeyL')) {
          // 반대 방향을 누르고 던지면 뒤로 던지기
          if (mx && Math.sign(mx) !== this.facing) { this.facing = -this.facing; e.facing = -this.facing; }
          this.startAttack('grabThrow');
        } else if (this.buffer > 0) { this.buffer = 0; this.startAttack('grabKnee'); }
        break;
      }
      case 'idle':
      case 'walk': {
        let slow = this.carry?.kind === 'barrel' ? 0.78 : this.carry?.kind === 'moto' ? 0.68 : 1;
        if (this.st8.fx?.has('bloodrush') && this.blood) { const v = Object.values(this.blood); slow *= 1 + 0.15 * v.reduce((a, b) => a + b, 0) / 10; }   // 전리품: 피범벅
        this.vx = mx * this.spd * slow;
        this.vz = mz * this.zspd * slow;
        if (mx) this.facing = mx > 0 ? 1 : -1;
        if (mx || mz) { this.state = 'walk'; this.walkPhase += dt * 11; } else this.state = 'idle';
        if (wantDash && this.dashCd <= 0) {
          this.startDash(tap || (mx ? Math.sign(mx) : this.facing));
        } else if (this.jumpBuf > 0) {
          this.jumpBuf = 0;
          this.setState('jump'); this.vy = PLAYER.jump; this.grounded = false; this.airAttacked = false; this.airDashed = false; this.doubleJumped = false;
          this.game.sfx?.('jump');
        } else if (inp.pressed('KeyL')) {
          g.interact(this);
        } else if (this.buffer > 0) {
          this.buffer = 0;
          if (this.dashAtkWindow > 0) { this.dashAttack(); break; }
          if (this.carry?.kind === 'barrel' || this.carry?.kind === 'moto') { this.startAttack('pThrowBarrel'); break; }
          if (this.carry && !this.carry.limb) { this.startAttack('pThrowGib'); break; }
          const idx = this.comboWindow > 0 ? (this.comboIdx + 1) % this.combo.length : 0;
          this.doCombo(idx);
        }
        break;
      }
      case 'jump': {
        // 대쉬 점프 관성은 유지, 그 외엔 공중 조작
        if (Math.abs(this.vx) <= this.spd + 0.1 || (mx && Math.sign(mx) !== Math.sign(this.vx))) this.vx = mx * this.spd;
        this.vz = mz * this.zspd * 0.6;
        if (mx) this.facing = mx > 0 ? 1 : -1;
        if (wantDash && !this.airDashed) { this.startDash(tap || (mx ? Math.sign(mx) : this.facing)); break; }
        if (this.jumpBuf > 0 && this.st8.djump && !this.doubleJumped && this.st > 0.08) {
          this.jumpBuf = 0; this.doubleJumped = true; this.vy = PLAYER.jump * 0.9;
          this.game.debris.puff(this.x, this.y, this.z, [0xffffff, 0xd8e8ff], 8, 1.5, .12, .3, -0.2);
          this.game.sfx?.('jump');
        }
        if (this.buffer > 0 && !this.airAttacked) {
          this.buffer = 0; this.airAttacked = true;
          const vx = this.vx, vz = this.vz;
          if (mz > 0.5 && this.st8.stomp) {
            // 아래 + 공격: 내려찍기
            this.startAttack('stomp');
            this.attack.air = true; this.vx = vx * 0.3; this.vz = 0; this.vy = -15;
          } else if (this.heldDef() && !this.heldDef().combo.includes('saw')) {
            this.startAttack('airSlash');
            this.attack.air = true; this.vx = vx; this.vz = vz;
          } else if (this.st8.flykick) {
            // 날아차기: 앞으로 쭉 뻗어나감
            this.startAttack('flykick');
            this.attack.air = true; this.vx = this.facing * Math.max(Math.abs(vx), 6.5); this.vz = vz;
          } else {
            this.startAttack('airPunch'); // 해금 전: 약한 공중 펀치
            this.attack.air = true; this.vx = vx; this.vz = vz;
          }
        }
        break;
      }
      case 'dash': {
        this.vx = this.dashDir * (PLAYER.dashSpeed * this.st8.speedMul) * (1 - this.st / PLAYER.dashTime * 0.35);
        this.vz = mz * 2.5;
        if (this.buffer > 0) { this.buffer = 0; this.dashAttack(); break; }
        if (inp.pressed('KeyK') && this.grounded) {
          // 대쉬 점프: 멀리 뛰기
          this.setState('jump'); this.vy = PLAYER.jump; this.grounded = false; this.airAttacked = false;
          this.vx = this.dashDir * (PLAYER.dashSpeed * this.st8.speedMul) * 0.75;
          this.game.sfx?.('jump');
          break;
        }
        if (this.st > PLAYER.dashTime) { this.setState(this.grounded ? 'idle' : 'jump'); this.dashAtkWindow = 0.15; }
        break;
      }
      case 'attack': {
        const a = this.attack;
        if (a.def.hold) {
          // 전기톱: J를 누르는 동안 계속, 천천히 이동 가능
          const endT = a.def.startup + a.def.active;
          if ((!inp.held('KeyJ') || !this.weapon) && a.t < endT) a.t = Math.max(a.t, endT);
          this.vx = mx * this.spd * 0.35; this.vz = mz * this.zspd * 0.35;
          this.updateAttack(dt);
          break;
        }
        // 후딜레이(판정이 끝난 뒤)는 대쉬/점프로 취소 가능, 살짝 움직일 수 있음
        const recovering = a.activated && a.t >= a.def.startup + a.def.active;
        if (recovering && !a.air && this.grounded) {
          if (wantDash && this.dashCd <= 0) { this.interrupt(); this.startDash(tap || (mx ? Math.sign(mx) : this.facing)); break; }
          if (this.jumpBuf > 0) {
            this.interrupt(); this.jumpBuf = 0;
            this.setState('jump'); this.vy = PLAYER.jump; this.grounded = false; this.airAttacked = false; this.airDashed = false; this.doubleJumped = false;
            this.vx = mx * this.spd; this.game.sfx?.('jump');
            break;
          }
        }
        if (a.def.momentum) {
          this.vx *= Math.pow(0.12, dt);
          this.vz = 0;
        } else if (recovering && !a.air) {
          this.vx = mx * this.spd * 0.4; this.vz = mz * this.zspd * 0.4;
          if (mx && this.buffer > 0) this.facing = mx > 0 ? 1 : -1; // 다음 타 방향 전환
        } else if (!a.air) {
          this.vx *= Math.pow(0.001, dt);
          this.vz = 0;
          // 첫 프레임 방향 전환 허용 (선딜 동안)
          if (a.t < a.def.startup && mx) this.facing = mx > 0 ? 1 : -1;
        }
        this.updateAttack(dt);
        if (this.attack === a && !a.air && this.buffer > 0 && a.activated && a.t >= a.def.startup + a.def.active) {
          const next = this.comboIdx + 1;
          if (next < this.combo.length) { this.buffer = 0; this.doCombo(next); }
        }
        break;
      }
    }
    this.pose(dt);
  }

  doCombo(idx) {
    this.comboIdx = idx;
    this.startAttack(this.combo[idx]);
  }

  onAttackEnd(interrupted) {
    if (this.weapon?.empty) this.game.discardWeapon(this);
    this.comboWindow = interrupted ? 0 : 0.35;
  }

  onHitLanded(v, d) {
    this.lastTarget = v;
    this.lastTargetT = 3;
    this.game.addCombo();
    if (d.weapon && this.weapon && !d.shot && !d.flame) {
      this.weapon.dur -= 1;
      if (this.weapon.dur <= 0) this.game.breakWeapon(this);
    } else if (d.weapon && this.carry?.limb) {
      this.carry.dur -= 1;
      if (this.carry.dur <= 0) this.game.breakCarry(this);
    }
  }
}
