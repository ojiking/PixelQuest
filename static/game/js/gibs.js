// 떨어져 나간 부위 덩어리와 시체 조각(트로피처럼 스테이지 끝까지 남음) + 관절에서 뿜어지는 붉은 블록
import { mat4, rand } from './math.js';
import { hexToRgb } from './voxel.js';
import { WOUND } from './models.js';
import { GIB_THROW, GIB_BOUNCE, SETTLE } from './config.js';
import { applyHit } from './combat.js';

const M = mat4.create(), R = mat4.create();
const WOUND_RGB = WOUND.map(hexToRgb);
const MAX_GIBS = 1500; // 안전 상한. 넘으면 가장 오래된 것부터 정리 (보통 한 스테이지에 200개 내외)

export class Gibs {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spurts = [];
  }

  clear() { this.list = []; this.spurts = []; }

  // 여러 마디를 하나의 덩어리로 (예: 위팔+아래팔, 상반신 전체)
  // members: [{ mesh, voxels, M(떨어지는 순간의 월드 행렬) }]
  spawnGroup(members, vel, part = 'torso', spinScale = 1) {
    const P = [0, 0, 0];
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const m of members) {
      const v = m.voxels;
      for (let i = 0; i < v.length; i += 6) { mat4.point(P, m.M, v[i], v[i + 1], v[i + 2]); cx += P[0]; cy += P[1]; cz += P[2]; n++; }
    }
    if (!n) return;
    cx /= n; cy /= n; cz /= n;
    let ext = 0;
    for (const m of members) {
      const v = m.voxels;
      for (let i = 0; i < v.length; i += 18) { mat4.point(P, m.M, v[i], v[i + 1], v[i + 2]); ext = Math.max(ext, Math.hypot(P[0] - cx, P[1] - cy, P[2] - cz)); }
    }
    this.list.push({
      members: members.map(m => ({ mesh: m.mesh, voxels: m.voxels, M: mat4.copy(mat4.create(), m.M) })),
      c0: [cx, cy, cz], pos: [cx, cy, cz], vel: [...vel],
      ax: 0, az: 0, wx: rand(-14, 14) * spinScale, wz: rand(-14, 14) * spinScale,
      r: Math.min(ext * 0.45, 0.32), rest: false, part, thrown: null,
    });
    if (this.list.length > MAX_GIBS) this.list.shift();
  }

  // 골프채로 바닥의 머리통을 쳐서 날림 → 적에게 맞으면 큰 피해
  golfShot(att, a, r0, reach, depth) {
    for (const g of this.list) {
      if (!g.rest || g.part !== 'head' || a.hit.has(g)) continue;
      const dx = (g.pos[0] - att.x) * att.facing;
      if (dx < r0 - 0.4 || dx > reach + 0.4 || Math.abs(g.pos[2] - att.z) > depth + 0.25) continue;
      a.hit.add(g);
      g.rest = false;
      g.vel = [att.facing * 15, 4.2, 0];
      g.wx = rand(-25, 25); g.wz = rand(-25, 25);
      g.thrown = { owner: att, team: att.team, golf: true };
      this.game.bleed(g.pos[0], g.pos[1], g.pos[2], att.facing, 10);
      this.game.sfx?.('heavy');
    }
  }

  // 바닥에 놓인 조각 중 (x, z)에서 가장 가까운 것
  nearest(x, z) {
    let best = null, bd = 1e9;
    for (const g of this.list) {
      if (!g.rest) continue;
      const dx = Math.abs(g.pos[0] - x), dz = Math.abs(g.pos[2] - z);
      if (dx < 0.9 && dz < 0.6 && dx + dz < bd) { best = g; bd = dx + dz; }
    }
    return best;
  }

  take(g) { this.list.splice(this.list.indexOf(g), 1); return g; }

  // 들고 있던 조각을 발밑에 내려놓음
  drop(g, x, z) {
    g.pos = [x, 0.6, z]; g.vel = [0, 1, 0]; g.rest = false; g.thrown = null;
    this.list.push(g);
  }

  throwGib(g, x, y, z, dir, owner) {
    g.pos = [x, y, z];
    g.vel = [dir * GIB_THROW.speed, 2.5, 0];
    g.wx = rand(-16, 16); g.wz = rand(-16, 16);
    g.rest = false;
    g.thrown = { owner, team: owner.team };
    this.list.push(g);
  }

  // 잘린 관절에서 dur초 동안 붉은 블록이 뿜어져 나옴
  spurt(actor, part, dur) { this.spurts.push({ actor, part, t: dur }); }

  matrix(g, mem, out) {
    mat4.identity(out);
    mat4.translate(out, g.pos[0], g.pos[1], g.pos[2]);
    mat4.rotateZ(out, g.az);
    mat4.rotateX(out, g.ax);
    mat4.translate(out, -g.c0[0], -g.c0[1], -g.c0[2]);
    mat4.multiply(out, out, mem.M);
    return out;
  }

  update(dt) {
    const debris = this.game.debris;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.settle = g.rest ? (g.settle || 0) + dt : 0;          // 멈춰 있는 시간 (움직이면 0 → 원래 색)
      if (!g.rest) {
        g.vel[1] -= 22 * dt;
        g.pos[0] += g.vel[0] * dt; g.pos[1] += g.vel[1] * dt; g.pos[2] += g.vel[2] * dt;
        g.pos[2] = Math.max(-4, Math.min(5.5, g.pos[2]));
        g.ax += g.wx * dt; g.az += g.wz * dt;
        if (g.thrown) this.hitCheck(g);
        const fl = this.game.floorAt(g.pos[0], g.pos[2]);
        if (g.pos[1] < -8) { this.list.splice(i, 1); continue; }
        if (fl > -50 && g.pos[1] < fl + g.r && g.pos[1] > fl - 0.5) {
          g.pos[1] = fl + g.r;
          g.thrown = null;
          // 머리·팔·다리는 바닥에서 몇 번 통통 튀다가 멈춤 (몸통은 무겁게 털썩)
          const limb = g.part !== 'torso' && g.part !== 'upper' && g.part !== 'lower';
          g.bounces = (g.bounces || 0) + 1;
          if (g.part === 'head') { this.ballBounce(g, fl, dt); continue; }
          const B = GIB_BOUNCE.limb;
          const minB = limb ? B.times : 1;
          if (g.bounces > minB && Math.abs(g.vel[1]) < 2 && Math.hypot(g.vel[0], g.vel[2]) < 0.8) {
            g.rest = true;
          } else {
            let up = -g.vel[1] * (limb ? 0.62 : 0.35);
            if (limb && g.bounces <= minB) up = Math.max(up, B.speed - g.bounces * B.drop);
            g.vel[1] = up;
            const f = limb ? B.keep : 0.55;
            g.vel[0] *= f; g.vel[2] *= f;
            if (limb && g.bounces <= minB) {
              // 튈 때마다 옆으로 툭 차여 이리저리 굴러다님
              g.vel[0] += (Math.random() - .5) * 2 * B.roll; g.vel[2] += (Math.random() - .5) * B.roll;
              g.wx = g.wx * B.spin + (Math.random() - .5) * 6; g.wz = g.wz * B.spin + (Math.random() - .5) * 6;
            } else { g.wx *= limb ? 0.75 : 0.5; g.wz *= limb ? 0.75 : 0.5; }
            if (limb && up > 1.2) {
              this.game.bleed(g.pos[0], fl + 0.08, g.pos[2], g.vel[0] >= 0 ? 1 : -1, 3);   // 튈 때마다 핏방울
            }
          }
        }
      }
    }
    for (let i = this.spurts.length - 1; i >= 0; i--) {
      const s = this.spurts[i];
      s.t -= dt;
      const a = s.actor;
      if (s.t <= 0 || a.remove) { this.spurts.splice(i, 1); continue; }
      a.rootMatrix(R);
      a.partMatrix(s.part, R, M);
      const dir = a.facing;
      for (let k = 0; k < 2; k++) {
        const [r, gg, b] = WOUND_RGB[Math.floor(Math.random() * WOUND_RGB.length)];
        debris.spawn(M[12], M[13], M[14], -dir * rand(0.5, 2.5), rand(2, 4.5), rand(-1, 1), r, gg, b, rand(0.06, 0.1), rand(1.8, 2.8), 1, 1);
      }
    }
  }

  // 잘린 머리: 축구공처럼 탄성으로 통통 → 낮아지면 데굴데굴 구르다 멈춤
  ballBounce(g, fl, dt) {
    const B = GIB_BOUNCE.head;
    const vy = -g.vel[1];
    if (vy > 1.4 || g.bounces === 1) {
      // 튀어오름
      let up = vy * B.bounce;
      if (g.bounces === 1) {
        up = Math.max(up, B.speed);                                     // 첫 튐은 뻥 차올림
        const dir = g.vel[0] >= 0 ? 1 : -1;
        if (Math.abs(g.vel[0]) < B.kick) g.vel[0] = dir * B.kick;
      }
      g.vel[1] = up;
      g.vel[0] *= B.keep; g.vel[2] = g.vel[2] * B.keep + (Math.random() - .5) * B.roll;
      g.wz = -g.vel[0] / g.r * 0.6; g.wx = g.vel[2] / g.r * 0.6;         // 진행 방향으로 굴러가듯 회전
      if (up > 1.2) this.game.bleed(g.pos[0], fl + 0.08, g.pos[2], g.vel[0] >= 0 ? 1 : -1, 5);   // 튈 때마다 핏방울
      if (up > 2.5) this.game.sfx?.('land');                                                     // '퉁'
    } else {
      // 구르기: 바닥에 붙어서 마찰로 느려짐
      g.vel[1] = 0;
      const f = Math.pow(B.rollFric, dt);
      g.vel[0] *= f; g.vel[2] *= f;
      g.wz = -g.vel[0] / g.r; g.wx = g.vel[2] / g.r;
      if (Math.random() < dt * 6 && Math.hypot(g.vel[0], g.vel[2]) > 0.6) this.game.bleed(g.pos[0], fl + 0.05, g.pos[2], g.vel[0] >= 0 ? 1 : -1, 1);   // 굴러간 자리에 핏자국
      if (Math.hypot(g.vel[0], g.vel[2]) < 0.25) { g.rest = true; g.wx = g.wz = 0; }
    }
  }

  hitCheck(g) {
    const game = this.game, th = g.thrown;
    for (const a of game.actors) {
      if (a.team === th.team || !a.alive || a.state === 'down' || a.dead) continue;
      if (Math.abs(a.x - g.pos[0]) > 0.35 + a.radius || Math.abs(a.z - g.pos[2]) > 0.5) continue;
      if (g.pos[1] < a.y - 0.1 || g.pos[1] > a.y + 1.9 * a.scale) continue;
      const dir = g.vel[0] >= 0 ? 1 : -1;
      if (th.golf) {
        // 골프 샷: 머리통 직격
        applyHit(game, a, {
          attacker: th.owner, dmg: 20 * (th.owner.power ?? 1) * (th.owner.wpow ?? 1), knock: 6.5, dir, zone: 'head',
          knockdown: true, sever: 1.2, mode: 'knock', fling: 2, hitstop: .1, shake: .15,
        });
        if (th.owner === game.player) game.goreBonus(a, 'golf');
        game.stat('golf');
      } else applyHit(game, a, {
        attacker: th.owner, dmg: GIB_THROW.dmg * (th.owner.power ?? 1) * (th.owner.st8?.throwMul ?? 1), knock: GIB_THROW.knock, dir, zone: 'high',
        knockdown: false, sever: 0.3, hitstop: .04, shake: .05, hitstun: GIB_THROW.hitstun,
      });
      g.vel[0] *= -0.3; g.vel[1] = 2.5;
      g.thrown = null;
      return;
    }
  }

  draw(r) {
    const { camX, viewHalf } = this.game;
    for (const g of this.list) {
      if (Math.abs(g.pos[0] - camX) > viewHalf + 4) continue; // 화면 밖은 그리지 않음
      const k = settleK(g.settle);
      let tint = null;
      if (k > 0) { g.tint ??= [...SETTLE.rgb, 0]; g.tint[3] = k * SETTLE.amount; tint = g.tint; }
      for (const mem of g.members) r.drawMesh(mem.mesh, this.matrix(g, mem, M), tint);
    }
  }
}

// 멈춘 시간 → 가라앉는 정도(0~1)
export function settleK(t) { return Math.max(0, Math.min(1, ((t || 0) - SETTLE.delay) / SETTLE.time)); }

// 피 대신 붉은 블록이 튐
export function bleed(debris, x, y, z, dir, n) {
  for (let i = 0; i < n; i++) {
    const [r, g, b] = WOUND_RGB[i % WOUND_RGB.length];
    debris.spawn(x, y, z, dir * rand(0.5, 4) + rand(-1, 1), rand(1.5, 5.5), rand(-1.6, 1.6),
      r, g, b, rand(0.06, 0.13), rand(2.2, 3.4), 1, 1);
  }
}
