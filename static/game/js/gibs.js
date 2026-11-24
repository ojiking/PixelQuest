// 떨어져 나간 부위 덩어리(굴러다니다 부스러짐) + 관절에서 뿜어지는 붉은 블록
import { mat4, rand } from './math.js';
import { hexToRgb } from './voxel.js';
import { WOUND } from './models.js';

const M = mat4.create(), R = mat4.create();
const WOUND_RGB = WOUND.map(hexToRgb);
const MAX_GIBS = 40;

export class Gibs {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spurts = [];
  }

  clear() { this.list = []; this.spurts = []; }

  // partMat: 떨어지는 순간 부위의 월드 행렬, cut: { mesh, voxels }
  spawn(partMat, cut, vel, scale = 1) {
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
      r: Math.min(ext * scale * 0.45, 0.22), t: 0, life: rand(4, 5.5), rest: false,
    });
    if (this.list.length > MAX_GIBS) this.list[0].t = Math.max(this.list[0].t, this.list[0].life - 0.01);
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
      g.t += dt;
      if (!g.rest) {
        g.vel[1] -= 22 * dt;
        g.pos[0] += g.vel[0] * dt; g.pos[1] += g.vel[1] * dt; g.pos[2] += g.vel[2] * dt;
        g.pos[2] = Math.max(-4, Math.min(3.5, g.pos[2]));
        g.ax += g.wx * dt; g.az += g.wz * dt;
        if (g.pos[1] < g.r) {
          g.pos[1] = g.r;
          if (Math.abs(g.vel[1]) < 2 && Math.hypot(g.vel[0], g.vel[2]) < 0.8) {
            g.rest = true;
          } else {
            g.vel[1] *= -0.35; g.vel[0] *= 0.55; g.vel[2] *= 0.55;
            g.wx *= 0.5; g.wz *= 0.5;
          }
        }
      }
      if (g.t >= g.life) {
        debris.burst(g.voxels, this.matrix(g, M), { frac: 0.5, size: 0.09, spread: 1.2 });
        this.list.splice(i, 1);
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

  draw(r) {
    const time = this.game.time;
    for (const g of this.list) {
      if (g.life - g.t < 0.8 && Math.floor(time * 12) % 2) continue;
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
