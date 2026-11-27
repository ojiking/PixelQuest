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

// 배경 핏자국: 스테이지 전체를 덮는 3D 맵(10cm 칸)에 직접 칠함 → 바닥·벽·차 표면이 그 색을 읽어 그림
// 아무리 많이 묻어도 그리는 비용은 늘지 않음 (바뀐 칸만 GPU로 올림)
export class Stains {
  constructor(r) { this.r = r; this.n = 0; this.data = null; }
  init(L) {
    this.res = 10;
    this.o = [-1, -0.5, -6];                       // 월드 원점
    this.W = Math.ceil((L + 2) * this.res); this.H = Math.ceil(3.5 * this.res); this.D = Math.ceil(14 * this.res);
    this.data = new Uint8Array(this.W * this.H * this.D);
    this.dirty = null; this.n = 0;
    this.r.setStainVolume(this.data, this.W, this.H, this.D, this.o, this.res);
  }
  clear() { if (this.data) { this.data.fill(0); this.dirty = [0, this.W - 1, 0, this.H - 1, 0, this.D - 1]; } this.n = 0; }
  cell(x, y, z) { return [Math.floor((x - this.o[0]) * this.res), Math.floor((y - this.o[1]) * this.res), Math.floor((z - this.o[2]) * this.res)]; }
  put(ix, iy, iz, v) {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= this.W || iy >= this.H || iz >= this.D) return;
    const k = ix + this.W * (iy + this.H * iz);
    this.data[k] = Math.min(255, this.data[k] + v);
    const d = this.dirty;
    if (!d) this.dirty = [ix, ix, iy, iy, iz, iz];
    else { if (ix < d[0]) d[0] = ix; if (ix > d[1]) d[1] = ix; if (iy < d[2]) d[2] = iy; if (iy > d[3]) d[3] = iy; if (iz < d[4]) d[4] = iz; if (iz > d[5]) d[5] = iz; }
  }
  // axis: 0 = x면(벽 옆), 1 = 바닥(위), 2 = z면(벽 앞) / sign: 피가 날아간 방향 (벽 안쪽)
  add(x, y, z, axis, sign, size) {
    if (!this.data) return;
    this.n++;
    const e = 0.03, rad = Math.max(0.6, size * 0.55 * this.res);   // 칸 단위 반지름
    const R = Math.ceil(rad + 1);
    let c, ua, ub;                                 // 칠할 평면의 두 축
    if (axis === 1) { c = this.cell(x, y - e, z); ua = 0; ub = 2; }
    else if (axis === 0) { c = this.cell(x + sign * e, y, z); ua = 1; ub = 2; }
    else { c = this.cell(x, y, z + sign * e); ua = 0; ub = 1; }
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const d = Math.hypot(a, b) / rad;
      if (d > 1.25) continue;
      const v = Math.max(0, 1.25 - d) * (0.6 + Math.random() * 0.6);
      if (v < 0.15) continue;
      const p = [c[0], c[1], c[2]]; p[ua] += a; p[ub] += b;
      const amt = Math.round(v * 150);
      this.put(p[0], p[1], p[2], amt);
      if (axis === 1) this.put(p[0], p[1] - 1, p[2], amt >> 1);   // 블록 위 높이가 조금 달라도 묻게 한 층 더
    }
  }
  // 바닥 핏자국 진하기 읽기 (발밑 주변 3×3칸 중 최댓값, 0~255)
  sample(x, y, z) {
    if (!this.data) return 0;
    const c = this.cell(x, y - 0.03, z);
    let m = 0;
    for (const dy of [0, -1]) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const ix = c[0] + a, iy = c[1] + dy, iz = c[2] + b;
      if (ix < 0 || iy < 0 || iz < 0 || ix >= this.W || iy >= this.H || iz >= this.D) continue;
      m = Math.max(m, this.data[ix + this.W * (iy + this.H * iz)]);
    }
    return m;
  }
  // 바닥에 발자국 하나 (10cm 칸 기준, 진행 방향 dir=±1)
  // fill: 칸이 찍힐 확률 (발에 남은 피가 줄수록 듬성듬성해져 옅어지는 느낌)
  footprint(x, y, z, dir, amt, fill = 1) {
    if (!this.data) return;
    const c = this.cell(x, y - 0.03, z);
    const cells = [];
    for (let b = 0; b < 3; b++) { cells.push([-2, b], [-1, b], [1, b], [2, b]); if (b < 2) cells.push([3, b]); }   // 뒤꿈치 2칸 + 한 칸 띄우고 앞꿈치 3칸, 폭 3칸
    for (const [a, b] of cells) {
      if (Math.random() > fill) continue;
      const v = Math.round(amt * (0.75 + Math.random() * 0.4));
      this.put(c[0] + a * dir, c[1], c[2] + b - 1, v);
      this.put(c[0] + a * dir, c[1] - 1, c[2] + b - 1, v >> 1);   // (b-1: 발 중심 기준 좌우)   // 블록 높이가 조금 달라도 묻게 한 층 더
    }
  }
  // 영역 안 핏자국 제거 (차가 폭발해 지붕이 사라질 때 등)
  removeBox(x0, x1, z0, z1, yMin) {
    if (!this.data) return;
    const a = this.cell(x0, yMin, z0), b = this.cell(x1, 3, z1);
    for (let iz = Math.max(0, a[2]); iz <= Math.min(this.D - 1, b[2]); iz++) for (let iy = Math.max(0, a[1]); iy < this.H; iy++) for (let ix = Math.max(0, a[0]); ix <= Math.min(this.W - 1, b[0]); ix++) {
      this.data[ix + this.W * (iy + this.H * iz)] = 0;
    }
    this.dirty = [0, this.W - 1, 0, this.H - 1, 0, this.D - 1];
  }
  // 프레임마다 바뀐 영역만 GPU로
  flush() {
    if (!this.dirty || !this.data) return;
    this.r.updateStainVolume(this.data, this.dirty);
    this.dirty = null;
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
  clear() { this.list.forEach(t => t.el.remove()); this.list = []; this.setHint(null); }
  // 따라다니는 안내 라벨 하나 (L 키 대상)
  setHint(h) {
    if (!this.hintEl) { this.hintEl = document.createElement('div'); this.hintEl.id = 'lhint'; this.root.appendChild(this.hintEl); }
    this.hint = h;
    this.hintEl.style.display = h ? '' : 'none';
    if (h && this.hintEl.dataset.k !== h.html) { this.hintEl.innerHTML = h.html; this.hintEl.dataset.k = h.html; }
  }
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
    const h = this.hint;
    if (h && this.hintEl) {
      const cx = vp[0] * h.x + vp[4] * h.y + vp[8] * h.z + vp[12];
      const cy = vp[1] * h.x + vp[5] * h.y + vp[9] * h.z + vp[13];
      const cw = vp[3] * h.x + vp[7] * h.y + vp[11] * h.z + vp[15];
      this.hintEl.style.transform = `translate(${(cx / cw * 0.5 + 0.5) * W}px, ${(1 - (cy / cw * 0.5 + 0.5)) * H}px) translate(-50%, -100%)`;
    }
  }
}
