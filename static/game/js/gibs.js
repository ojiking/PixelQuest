// 떨어져 나간 부위 덩어리와 시체 조각(트로피처럼 스테이지 끝까지 남음) + 관절에서 뿜어지는 붉은 블록
import { mat4, rand } from './math.js';
import { hexToRgb } from './voxel.js';
import { WOUND } from './models.js';
import { GIB_THROW } from './config.js';
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

  // partMat: 떨어지는 순간 부위의 월드 행렬, cut: { mesh, voxels }
  spawn(partMat, cut, vel, scale = 1, part = 'torso') {
    const v = cut.voxels;
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (let i = 0; i < v.length; i += 6) { cx += v[i]; cy += v[i + 1]; cz += v[i + 2]; n++; }
    if (!n) return;
    cx /= n; cy /= n; cz /= n;
    let ext = 0;
    for (let i = 0; i < v.length; i += 6) ext = Math.max(ext, Math.hypot(v[i] - cx, v[i + 1] - cy, v[i + 2] - cz));
    const O = mat4.copy(mat4.create(), partMat);
    O[12] = O[13] = O[14] = 0;
    const pos = mat4.point([0, 0, 0], partMat, cx, cy, cz);
    this.list.push({
      mesh: cut.mesh, voxels: v, O, c: [cx, cy, cz], pos, vel: [...vel],
      ax: 0, az: 0, wx: rand(-14, 14), wz: rand(-14, 14),
      r: Math.min(ext * scale * 0.45, 0.22), rest: false, scale, part, thrown: null,
    });
    if (this.list.length > MAX_GIBS) this.list.shift();
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

  matrix(g, out) {
    mat4.identity(out);
    mat4.translate(out, g.pos[0], g.pos[1], g.pos[2]);
    mat4.rotateZ(out, g.az);
    mat4.rotateX(out, g.ax);
    mat4.multiply(out, out, g.O);
    mat4.translate(out, -g.c[0], -g.c[1], -g.c[2]);
    return out;
  }

  update(dt) {
    const debris = this.game.debris;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      if (!g.rest) {
        g.vel[1] -= 22 * dt;
        g.pos[0] += g.vel[0] * dt; g.pos[1] += g.vel[1] * dt; g.pos[2] += g.vel[2] * dt;
        g.pos[2] = Math.max(-4, Math.min(3.5, g.pos[2]));
        g.ax += g.wx * dt; g.az += g.wz * dt;
        if (g.thrown) this.hitCheck(g);
        if (g.pos[1] < g.r) {
          g.pos[1] = g.r;
          g.thrown = null;
          if (Math.abs(g.vel[1]) < 2 && Math.hypot(g.vel[0], g.vel[2]) < 0.8) {
            g.rest = true;
          } else {
            g.vel[1] *= -0.35; g.vel[0] *= 0.55; g.vel[2] *= 0.55;
            g.wx *= 0.5; g.wz *= 0.5;
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
        debris.spawn(M[12], M[13], M[14], -dir * rand(0.5, 2.5), rand(2, 4.5), rand(-1, 1), r, gg, b, rand(0.06, 0.1), rand(1.8, 2.8));
      }
    }
  }

  hitCheck(g) {
    const game = this.game, th = g.thrown;
    for (const a of game.actors) {
      if (a.team === th.team || !a.alive || a.state === 'down' || a.dead) continue;
      if (Math.abs(a.x - g.pos[0]) > 0.35 + a.radius || Math.abs(a.z - g.pos[2]) > 0.5) continue;
      if (g.pos[1] < a.y - 0.1 || g.pos[1] > a.y + 1.9 * a.scale) continue;
      const dir = g.vel[0] >= 0 ? 1 : -1;
      applyHit(game, a, {
        attacker: th.owner, dmg: GIB_THROW.dmg * (th.owner.power ?? 1), knock: GIB_THROW.knock, dir, zone: 'high',
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
      r.drawMesh(g.mesh, this.matrix(g, M));
    }
  }
}

// 피 대신 붉은 블록이 튐
export function bleed(debris, x, y, z, dir, n) {
  for (let i = 0; i < n; i++) {
    const [r, g, b] = WOUND_RGB[i % WOUND_RGB.length];
    debris.spawn(x, y, z, dir * rand(0.5, 4) + rand(-1, 1), rand(1.5, 5.5), rand(-1.6, 1.6),
      r, g, b, rand(0.06, 0.13), rand(2.2, 3.4));
  }
}
