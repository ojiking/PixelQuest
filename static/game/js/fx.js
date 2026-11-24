// 복셀 파편, 타격 불꽃, 떠오르는 텍스트
import { mat4, rand } from './math.js';
import { hexToRgb } from './voxel.js';

const tmp = [0, 0, 0];

export class Debris {
  constructor(cap = 6000) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3);
    this.v = new Float32Array(cap * 3);
    this.c = new Float32Array(cap * 3);
    this.s = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.g = new Float32Array(cap);
    this.inst = new Float32Array(cap * 7);
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 1) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else i = Math.floor(Math.random() * this.cap);
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c[i3] = r; this.c[i3 + 1] = g; this.c[i3 + 2] = b;
    this.s[i] = size; this.life[i] = life; this.max[i] = life; this.g[i] = grav;
  }

  // 모델 부위의 복셀을 월드로 변환해 튕겨냄
  burst(voxels, matrix, opt = {}) {
    const frac = opt.frac ?? 0.45, size = opt.size ?? 0.13, imp = opt.impulse ?? [0, 0, 0], spread = opt.spread ?? 2.5;
    for (let i = 0; i < voxels.length; i += 6) {
      if (Math.random() > frac) continue;
      mat4.point(tmp, matrix, voxels[i], voxels[i + 1], voxels[i + 2]);
      this.spawn(tmp[0], tmp[1], tmp[2],
        imp[0] + rand(-spread, spread), imp[1] + rand(1, spread * 1.6), imp[2] + rand(-spread, spread) * 0.6,
        voxels[i + 3], voxels[i + 4], voxels[i + 5], size * rand(0.8, 1.25), rand(1.6, 2.6));
    }
  }

  sparks(x, y, z, color = 0xfff3a0, n = 8, speed = 4) {
    const [r, g, b] = hexToRgb(color);
    for (let i = 0; i < n; i++) {
      this.spawn(x, y, z, rand(-speed, speed), rand(-speed * .5, speed), rand(-speed, speed) * .5, r, g, b, rand(0.05, 0.1), rand(0.12, 0.25), 0);
    }
  }

  puff(x, y, z, colors, n = 20, speed = 3, size = .18, life = .6, grav = -0.3) {
    for (let i = 0; i < n; i++) {
      const [r, g, b] = hexToRgb(colors[i % colors.length]);
      this.spawn(x + rand(-.3, .3), y + rand(-.3, .3), z + rand(-.3, .3),
        rand(-speed, speed), rand(0, speed * 1.2), rand(-speed, speed) * .6, r, g, b, size * rand(.6, 1.3), life * rand(.6, 1.2), grav);
    }
  }

  clear() { this.n = 0; }

  update(dt, floorAt = null) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.n;
        if (i !== last) {
          const i3 = i * 3, l3 = last * 3;
          for (let k = 0; k < 3; k++) { this.p[i3 + k] = this.p[l3 + k]; this.v[i3 + k] = this.v[l3 + k]; this.c[i3 + k] = this.c[l3 + k]; }
          this.s[i] = this.s[last]; this.life[i] = this.life[last]; this.max[i] = this.max[last]; this.g[i] = this.g[last];
          i--;
        }
        continue;
      }
      const i3 = i * 3;
      this.v[i3 + 1] -= 22 * this.g[i] * dt;
      this.p[i3] += this.v[i3] * dt;
      this.p[i3 + 1] += this.v[i3 + 1] * dt;
      this.p[i3 + 2] += this.v[i3 + 2] * dt;
      const half = this.s[i] / 2;
      const fl = this.g[i] > 0 && floorAt ? floorAt(this.p[i3], this.p[i3 + 2]) : 0;
      if (this.g[i] > 0 && fl > -50 && this.p[i3 + 1] < fl + half && this.p[i3 + 1] > fl - 0.4) {
        this.p[i3 + 1] = fl + half;
        this.v[i3 + 1] *= -0.35;
        this.v[i3] *= 0.6; this.v[i3 + 2] *= 0.6;
      }
    }
  }

  fill() {
    const d = this.inst;
    for (let i = 0; i < this.n; i++) {
      const o = i * 7, i3 = i * 3;
      const shrink = Math.min(1, this.life[i] / Math.min(0.4, this.max[i]));
      d[o] = this.p[i3]; d[o + 1] = this.p[i3 + 1]; d[o + 2] = this.p[i3 + 2];
      d[o + 3] = this.s[i] * shrink;
      d[o + 4] = this.c[i3]; d[o + 5] = this.c[i3 + 1]; d[o + 6] = this.c[i3 + 2];
    }
    return this.n;
  }
}

// 화면 위 떠오르는 텍스트 (DOM)
export class Texts {
  constructor(root) { this.root = root; this.list = []; }
  add(x, y, z, text, cls = '') {
    const el = document.createElement('div');
    el.className = 'ftext ' + cls;
    el.textContent = text;
    this.root.appendChild(el);
    this.list.push({ el, x, y, z, t: 0, life: cls.includes('big') ? 1.2 : 0.8 });
    if (this.list.length > 40) this.list.shift().el.remove();
  }
  clear() { this.list.forEach(t => t.el.remove()); this.list = []; }
  update(dt, vp) {
    const W = this.root.clientWidth || window.innerWidth, H = this.root.clientHeight || window.innerHeight;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.t += dt;
      if (t.t > t.life) { t.el.remove(); this.list.splice(i, 1); continue; }
      const y = t.y + t.t * 1.2;
      const cx = vp[0] * t.x + vp[4] * y + vp[8] * t.z + vp[12];
      const cy = vp[1] * t.x + vp[5] * y + vp[9] * t.z + vp[13];
      const cw = vp[3] * t.x + vp[7] * y + vp[11] * t.z + vp[15];
      const sx = (cx / cw * 0.5 + 0.5) * W, sy = (1 - (cy / cw * 0.5 + 0.5)) * H;
      t.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      t.el.style.opacity = String(Math.min(1, (t.life - t.t) * 4));
    }
  }
}
