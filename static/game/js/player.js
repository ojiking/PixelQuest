import { Actor } from './actor.js';
import { PLAYER, WEAPONS } from './config.js';

const FIST_COMBO = ['jab', 'cross', 'kick'];

export class Player extends Actor {
  constructor(game, stats) {
    super(game, 'player', { hp: stats.maxHp, team: 'hero', x: 3, z: 0 });
    this.power = stats.power;
    this.comboIdx = 0;
    this.comboWindow = 0;
    this.buffer = 0;
    this.lastTarget = null;
    this.lastTargetT = 0;
    this.airAttacked = false;
    this.getupInvuln = PLAYER.invulnAfterGetup;
  }

  perk(id) { return this.game.run.perks.has(id); }
  get combo() { return this.weapon ? WEAPONS[this.weapon.type].combo : FIST_COMBO; }

  update(dt) {
    const g = this.game, inp = g.input;
    if (inp.pressed('KeyJ')) this.buffer = 0.22;
    else this.buffer = Math.max(0, this.buffer - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this.lastTargetT -= dt;

    this.physics(dt);
    if (this.state === 'ko') { this.pose(dt); return; }
    if (this.updateCommon(dt)) { this.pose(dt); return; }

    const mx = inp.axisX(), mz = inp.axisZ();
    switch (this.state) {
      case 'idle':
      case 'walk': {
        this.vx = mx * PLAYER.speed;
        this.vz = mz * PLAYER.zSpeed;
        if (mx) this.facing = mx > 0 ? 1 : -1;
        if (mx || mz) { this.state = 'walk'; this.walkPhase += dt * 11; } else this.state = 'idle';
        if (inp.pressed('KeyK')) {
          this.setState('jump'); this.vy = PLAYER.jump; this.y = 0.001; this.airAttacked = false;
        } else if (inp.pressed('KeyL')) {
          g.interact(this);
        } else if (this.buffer > 0) {
          this.buffer = 0;
          if (this.carry) { this.startAttack('pThrowGib'); break; }
          const idx = this.comboWindow > 0 ? (this.comboIdx + 1) % this.combo.length : 0;
          this.doCombo(idx);
        }
        break;
      }
      case 'jump': {
        this.vx = mx * PLAYER.speed * 0.9;
        this.vz = mz * PLAYER.zSpeed * 0.6;
        if (mx) this.facing = mx > 0 ? 1 : -1;
        if (this.buffer > 0 && !this.airAttacked) {
          this.buffer = 0; this.airAttacked = true;
          const vx = this.vx, vz = this.vz;
          this.startAttack('flykick');
          this.attack.air = true; this.vx = vx; this.vz = vz;
        }
        break;
      }
      case 'attack': {
        const a = this.attack;
        if (a.def.hold) {
          // 전기톱: J를 누르는 동안 계속, 천천히 이동 가능
          const endT = a.def.startup + a.def.active;
          if ((!inp.held('KeyJ') || !this.weapon) && a.t < endT) a.t = Math.max(a.t, endT);
          this.vx = mx * PLAYER.speed * 0.35; this.vz = mz * PLAYER.zSpeed * 0.35;
          this.updateAttack(dt);
          break;
        }
        if (!a.air) {
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
    this.comboWindow = interrupted ? 0 : 0.28;
  }

  onHitLanded(v, d) {
    this.lastTarget = v;
    this.lastTargetT = 3;
    this.game.addCombo();
    if (d.weapon && this.weapon) {
      this.weapon.dur -= 1;
      if (this.weapon.dur <= 0) this.game.breakWeapon(this);
    }
  }
}
