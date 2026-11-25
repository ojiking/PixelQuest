// 복셀 파편, 타격 불꽃, 떠오르는 텍스트
import { mat4, rand } from './math.js';
import { hexToRgb } from './voxel.js';
import { WOUND } from './models.js';
import { BLOOD } from './config.js';

// 피(상처 색) 복셀인지: 이런 파편은 닿는 곳에 얼룩을 남김
const WOUND_KEYS = new Set(WOUND);
const rgbKey = (r, g, b) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);

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
    this.b = new Uint8Array(cap);   // 1 = 피 (닿으면 얼룩)
    this.inst = new Float32Array(cap * 7);
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 1, blood = 0) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else i = Math.floor(Math.random() * this.cap);
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c[i3] = r; this.c[i3 + 1] = g; this.c[i3 + 2] = b;
    this.s[i] = size; this.life[i] = life; this.max[i] = life; this.g[i] = grav; this.b[i] = blood;
  }

  // 모델 부위의 복셀을 월드로 변환해 튕겨냄
  burst(voxels, matrix, opt = {}) {
    const frac = opt.frac ?? 0.45, size = opt.size ?? 0.13, imp = opt.impulse ?? [0, 0, 0], spread = opt.spread ?? 2.5;
    for (let i = 0; i < voxels.length; i += 6) {
      if (Math.random() > frac) continue;
      mat4.point(tmp, matrix, voxels[i], voxels[i + 1], voxels[i + 2]);
      this.spawn(tmp[0], tmp[1], tmp[2],
        imp[0] + rand(-spread, spread), imp[1] + rand(1, spread * 1.6), imp[2] + rand(-spread, spread) * 0.6,
        voxels[i + 3], voxels[i + 4], voxels[i + 5], size * rand(0.8, 1.25), rand(1.6, 2.6), 1,
        WOUND_KEYS.has(rgbKey(voxels[i + 3], voxels[i + 4], voxels[i + 5])) ? 1 : 0);
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

  // blood: { actor(i, x, y, z) → 묻었으면 true, stain(x, y, z, axis, sign, size, r, g, b) }
  update(dt, floorAt = null, blood = null) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.n;
        if (i !== last) {
          const i3 = i * 3, l3 = last * 3;
          for (let k = 0; k < 3; k++) { this.p[i3 + k] = this.p[l3 + k]; this.v[i3 + k] = this.v[l3 + k]; this.c[i3 + k] = this.c[l3 + k]; }
          this.s[i] = this.s[last]; this.life[i] = this.life[last]; this.max[i] = this.max[last]; this.g[i] = this.g[last]; this.b[i] = this.b[last];
          i--;
        }
        continue;
      }
      const i3 = i * 3;
      this.v[i3 + 1] -= 22 * this.g[i] * dt;
      const ox = this.p[i3], oy = this.p[i3 + 1], oz = this.p[i3 + 2];
      this.p[i3] += this.v[i3] * dt;
      this.p[i3 + 1] += this.v[i3 + 1] * dt;
      this.p[i3 + 2] += this.v[i3 + 2] * dt;
      const half = this.s[i] / 2;
      const fl = this.g[i] > 0 && floorAt ? floorAt(this.p[i3], this.p[i3 + 2]) : 0;
      if (this.b[i] && blood && floorAt && this.life[i] > 0.05) {
        const x = this.p[i3], y = this.p[i3 + 1], z = this.p[i3 + 2];
        // 1) 캐릭터에 묻음 (튀어나온 직후는 제외)
        if (this.max[i] - this.life[i] > 0.1 && blood.actor(x, y, z)) { this.life[i] = 0.0001; continue; }
        // 2) 벽(높은 블록 옆면)에 부딪힘: 이전 위치는 비어 있고 지금 위치는 블록 안
        if (fl > y + 0.04 && fl - y < 6 && floorAt(ox, oz) <= oy + 0.04) {
          const s = this.s[i] * rand(1.1, 1.8);
          const xCell = Math.floor(ox) !== Math.floor(x) && floorAt(x, oz) > y + 0.04;
          const sw = s * BLOOD.wallSize / 1.45;
          let sx = x, sy = Math.min(y, fl - sw / 2), sz = z, axis = 2, sg = this.v[i3 + 2] > 0 ? 1 : -1;
          if (xCell) { sx = this.v[i3] > 0 ? Math.floor(x) : Math.floor(ox); axis = 0; sg = this.v[i3] > 0 ? 1 : -1; }
          else sz = this.v[i3 + 2] > 0 ? Math.floor(z) : Math.floor(oz);
          blood.stain(sx, sy, sz, axis, sg, sw, this.c[i3], this.c[i3 + 1], this.c[i3 + 2]);
          // 주변 튄 방울 + 아래로 흘러내리는 줄기
          for (let k = 0; k < 3; k++) {
            const t = axis === 0 ? [0, rand(-1, 1), rand(-1, 1)] : [rand(-1, 1), rand(-1, 1), 0];
            blood.stain(sx + t[0] * sw * .9, sy + t[1] * sw * .9, sz + t[2] * sw * .9, axis, sg, sw * rand(.3, .55), this.c[i3], this.c[i3 + 1], this.c[i3 + 2]);
          }
          const nd = Math.floor(rand(BLOOD.drip[0], BLOOD.drip[1] + 1)), dw = sw * rand(.3, .45);
          for (let k = 1; k <= nd && sy - k * dw > 0.02; k++) blood.stain(sx, sy - sw / 2 - (k - .5) * dw, sz, axis, sg, dw * (1 - k * .08), this.c[i3] * .85, this.c[i3 + 1], this.c[i3 + 2]);
          this.life[i] = 0.0001; continue;
        }
        // 3) 바닥에 떨어짐: 튕기지 않고 얼룩이 됨 (빠를수록 길게 번짐)
        if (fl > -50 && this.v[i3 + 1] < 0 && y < fl + half && y > fl - 0.4) {
          const sp = Math.hypot(this.v[i3], this.v[i3 + 2]), base = this.s[i] * BLOOD.floorSize;
          const n = Math.min(BLOOD.streak, 1 + Math.floor(sp / 1.2));
          const ux = sp ? this.v[i3] / sp : 0, uz = sp ? this.v[i3 + 2] / sp : 0;
          for (let k = 0; k < n; k++) {
            const u = k * base * 0.55;
            blood.stain(x + ux * u, fl, z + uz * u, 1, 1, base * rand(.85, 1.2) * (1 - k * 0.15), this.c[i3], this.c[i3 + 1], this.c[i3 + 2]);
          }
          // 사방으로 흩뿌려진 작은 방울
          const ns = Math.floor(rand(BLOOD.satellites[0], BLOOD.satellites[1] + 1));
          for (let k = 0; k < ns; k++) {
            const a = Math.random() * Math.PI * 2, d = rand(.4, 1) * BLOOD.satRadius;
            const px = x + Math.cos(a) * d + ux * d * .6, pz = z + Math.sin(a) * d * .7 + uz * d * .6;
            if (floorAt(px, pz) === fl) blood.stain(px, fl, pz, 1, 1, base * rand(.2, .42), this.c[i3], this.c[i3 + 1], this.c[i3 + 2]);
          }
          this.life[i] = 0.0001; continue;
        }
      }
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

// 배경에 남는 핏자국: 표면 바로 안쪽에 묻힌 얇은 큐브 (표면에 페인트처럼 보임). 스테이지 끝까지 유지
export class Stains {
  constructor(cap = 18000) { this.cap = cap; this.n = 0; this.head = 0; this.inst = new Float32Array(cap * 7); }
  clear() { this.n = 0; this.head = 0; }
  // axis: 0 = x면(벽 옆), 1 = 바닥(위), 2 = z면(벽 앞) / sign: 표면이 바라보는 쪽의 반대(피가 날아온 방향)
  add(x, y, z, axis, sign, size, r, g, b) {
    const d = this.inst, o = this.head * 7, e = 0.008;
    const off = size / 2 - e;
    if (axis === 1) { y -= off; }
    else if (axis === 0) { x += sign * off; }
    else { z += sign * off; }
    const k = rand(0.62, 1.0);            // 마른 피~선홍색
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = r * k; d[o + 5] = g * k; d[o + 6] = b * k;
    this.head = (this.head + 1) % this.cap;
    this.n = Math.min(this.n + 1, this.cap);
  }
  // 영역 안 핏자국 제거 (차가 폭발해 지붕이 사라질 때 등)
  removeBox(x0, x1, z0, z1, yMin) {
    const d = this.inst;
    for (let i = 0; i < this.n; i++) {
      const o = i * 7;
      if (d[o] >= x0 && d[o] <= x1 && d[o + 2] >= z0 && d[o + 2] <= z1 && d[o + 1] > yMin) d[o + 3] = 0;
    }
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
