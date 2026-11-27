// 배경(환경) 공통 도구: 작은 복셀 그리드를 월드에 배치해 x 구간별로 합친 메시(청크)로 만들고, 화면 근처 청크만 그림
import { MeshBuilder, FACES, hash3, VoxGrid } from './voxel.js';

const RGB = new Map();
export const rgb = c => {
  let v = RGB.get(c);
  if (!v) { v = [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]; RGB.set(c, v); }
  return v;
};
// 색 섞기 / 밝기 (정수 색)
export const mixC = (a, b, t) => {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
export const shadeC = (c, f) => {
  const k = v => Math.max(0, Math.min(255, Math.round(v * f)));
  return (k((c >> 16) & 255) << 16) | (k((c >> 8) & 255) << 8) | k(c & 255);
};
// 0~1 값 노이즈 (정수 좌표 해시)
export const h3 = (x, y, z) => hash3(x | 0, y | 0, z | 0);
export function vnoise(x, z, seed = 0) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const s = t => t * t * (3 - 2 * t), u = s(xf), v = s(zf);
  const a = hash3(xi, seed, zi), b = hash3(xi + 1, seed, zi), c = hash3(xi, seed, zi + 1), d = hash3(xi + 1, seed, zi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// VoxGrid 보조: 상자 채우기 (col: 정수 색 또는 (x,y,z)→색, -2면 건너뜀)
export function box(g, x0, y0, z0, x1, y1, z1, col) {
  const f = typeof col === 'function';
  for (let z = Math.max(0, z0); z <= Math.min(g.d - 1, z1); z++) for (let y = Math.max(0, y0); y <= Math.min(g.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(g.w - 1, x1); x++) {
    const c = f ? col(x, y, z) : col;
    if (c !== -2) g.data[x + g.w * (y + g.h * z)] = c;
  }
}
// 축 방향 원기둥 (axis 'x'|'y'|'z'), 중심 (a, b)는 나머지 두 축 좌표
export function cyl(g, axis, a, b, r, t0, t1, col) {
  const f = typeof col === 'function';
  for (let t = t0; t <= t1; t++) for (let i = Math.floor(a - r); i <= Math.ceil(a + r); i++) for (let j = Math.floor(b - r); j <= Math.ceil(b + r); j++) {
    if ((i + .5 - a) ** 2 + (j + .5 - b) ** 2 > r * r) continue;
    const p = axis === 'x' ? [t, i, j] : axis === 'y' ? [i, t, j] : [i, j, t];
    const c = f ? col(p[0], p[1], p[2], t) : col;
    if (c !== -2) g.set(p[0], p[1], p[2], c);
  }
}
// 선분 그리기 (철근·철골·전선)
export function line(g, x0, y0, z0, x1, y1, z1, col, th = 0) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t), z = Math.round(z0 + (z1 - z0) * t);
    if (th) box(g, x - th, y - th, z - th, x + th, y + th, z + th, col); else g.set(x, y, z, col);
  }
}
export const grid = (w, h, d) => new VoxGrid(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)), Math.max(1, Math.ceil(d)));

// 그리드를 메시 빌더에 월드 위치 (ox, oy, oz)로 덧붙임. 복셀마다 밝기 약간씩 + 틈새 그늘
// opt: jitter(밝기 흔들림), seed, bottom:false(바닥면 생략 — 땅에 붙은 것), thin(앞뒤 면만, 철망용)
//      cull(기본 켬): 카메라(z +15.5, 높이 8.6m)에서 절대 안 보이는 뒷면(-z)·아랫면을 빼서 삼각형 수를 줄임
// 면·꼭짓점별 틈새 그늘 이웃 칸 (voxel.js faceAO와 같은 규칙, 미리 계산해 빠르게)
const AO_LV = [0.52, 0.7, 0.86, 1];
const AO_OFF = FACES.map(f => {
  const a = f.n[0] ? 0 : f.n[1] ? 1 : 2, u = (a + 1) % 3, v = (a + 2) % 3;
  return f.c.map(c => {
    const du = [0, 0, 0], dv = [0, 0, 0]; du[u] = c[u] ? 1 : -1; dv[v] = c[v] ? 1 : -1;
    const p = f.n;
    return [[p[0] + du[0], p[1] + du[1], p[2] + du[2]], [p[0] + dv[0], p[1] + dv[1], p[2] + dv[2]], [p[0] + du[0] + dv[0], p[1] + du[1] + dv[1], p[2] + du[2] + dv[2]]];
  });
});
export function emitGrid(mb, g, s, ox, oy, oz, opt = {}) {
  const jit = opt.jitter ?? 0.12, base = 1 - jit * 0.55, seed = opt.seed ?? 0, noBottom = opt.bottom === false, thin = !!opt.thin, cull = opt.cull !== false, W = g.w, H = g.h, D = g.d, data = g.data;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && data[x + W * (y + H * z)] >= 0;
  let n = 0;
  const ao = [1, 1, 1, 1];
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = data[x + W * (y + H * z)];
    if (c < 0) continue;
    let col = null;
    for (let fi = 0; fi < 6; fi++) {
      const f = FACES[fi];
      if (solid(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
      if (f.n[2] === -1 && cull) continue;                // 카메라 반대쪽(뒤) 면은 보이지 않음
      if (f.n[1] === -1 && (cull ? oy + y * s < 8 : noBottom && y === 0)) continue;   // 눈높이(8.6m)보다 낮은 아랫면도 보이지 않음
      if (thin && f.n[2] === 0) continue;                 // 얇은 철망: 앞뒤 면만
      if (!col) { const k = base + hash3(x + seed, y, z - seed) * jit, b = rgb(c); col = [Math.min(1, b[0] * k), Math.min(1, b[1] * k), Math.min(1, b[2] * k)]; }
      if (!thin) for (let i = 0; i < 4; i++) {
        const o = AO_OFF[fi][i];
        const s1 = solid(x + o[0][0], y + o[0][1], z + o[0][2]), s2 = solid(x + o[1][0], y + o[1][1], z + o[1][2]);
        ao[i] = AO_LV[s1 && s2 ? 0 : 3 - (s1 + s2 + solid(x + o[2][0], y + o[2][1], z + o[2][2]))];
      }
      mb.quad(f, ox + x * s, oy + y * s, oz + z * s, s, s, s, col, col, 0, thin ? null : ao);
      n++;
    }
  }
  return n;
}

// x 구간별로 묶은 메시 (그릴 때 카메라 근처만). 멀리 있는(z가 작은) 것은 원근 때문에 더 넓게 보이므로 여유를 더 줌
export class Chunks {
  constructor(size = 10) { this.size = size; this.map = new Map(); this.faces = 0; }
  at(x, z = 0) {
    const k = Math.floor(x / this.size);
    let c = this.map.get(k);
    if (!c) { c = { mb: new MeshBuilder(), x0: Infinity, x1: -Infinity, zMin: 99 }; this.map.set(k, c); }
    return c;
  }
  // 그리드 g (복셀 s m)를 (ox, oy, oz)에 배치
  add(g, s, ox, oy, oz, opt) {
    const c = this.at(ox + g.w * s / 2);
    this.faces += emitGrid(c.mb, g, s, ox, oy, oz, opt);
    c.x0 = Math.min(c.x0, ox); c.x1 = Math.max(c.x1, ox + g.w * s); c.zMin = Math.min(c.zMin, oz);
  }
  // 직접 사각형을 붙일 때: 해당 위치 청크의 MeshBuilder
  mb(x0, x1, z) { const c = this.at((x0 + x1) / 2); c.x0 = Math.min(c.x0, x0); c.x1 = Math.max(c.x1, x1); c.zMin = Math.min(c.zMin, z); return c.mb; }
  build(r) {
    const out = [];
    for (const c of this.map.values()) if (c.mb.n) out.push({ x0: c.x0, x1: c.x1, zMin: c.zMin, mesh: c.mb.build(r) });
    return out;
  }
}
// 카메라 x에서 이 청크가 보이는지 (camera z ≈ 15.5, 가로 화각 반쯤 0.56)
export const chunkVisible = (c, camX) => { const hw = (15.5 - Math.min(0, c.zMin)) * 0.58 + 1.5; return c.x1 > camX - hw && c.x0 < camX + hw; };
