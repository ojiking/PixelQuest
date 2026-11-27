// 고밀도 캐릭터 모델 공통 틀 — 뱀돌이 v2(hero_model.js)와 같은 밀도(복셀 4.5cm)·같은 부위 구조
// 부위 모양(머리·몸통·팔·다리)을 만드는 기본 틀 + 재질 칠하기 도우미 + 조립기.
// 각 캐릭터는 chars_enemies.js 에서 이 틀에 고유한 옷·장비·실루엣 장식을 얹는다.
import { V } from './config.js';
import { VoxGrid, meshGrid, hash3 } from './voxel.js';

export const H = V / 2;                       // 4.5cm
const WOUND = [0xc81e24, 0x9e1219, 0xe0382c, 0xb3161d];

// ---------------------------------------------------------------- 색 도우미
export const shade = (c, k) => { const r = Math.min(255, ((c >> 16) & 255) * k) | 0, gg = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0; return (r << 16) | (gg << 8) | b; };
// 채도 낮추기: k만큼 회색(밝기)으로 섞음 — 피가 아닌 빨강·노랑·주황은 15~25% 낮춰 피만 선명하게
export const desat = (c, k = .2) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, l = r * .3 + g * .59 + b * .11; const m = v => Math.round(v + (l - v) * k); return (m(r) << 16) | (m(g) << 8) | m(b); };
// 재질 얼룩(색 세 단계) — 위치 해시로 고정
export const pick = (x, y, z, a, b, c, pb = .22, pc = .14) => { const h = hash3(x * 3 + 11, y * 5 + 7, z * 7 + 3); return h < pc ? c : h < pc + pb ? b : a; };
// 재질 함수: 기본색에서 어두운/밝은 얼룩을 섞음
export const tone = (c, pb = .24, pc = .14, dk = .84, lt = 1.13) => (x, y, z) => pick(x, y, z, c, shade(c, dk), shade(c, lt), pb, pc);
// 녹·때 얼룩: 확률 p로 다른 색
export const grime = (x, y, z, c, g, p = .12, seed = 0) => hash3(x * 13 + seed, y * 17 + 5, z * 19 + 9) < p ? g : c;
// 이미 칠한 복셀을 어둡게/밝게
export function mul(g, x, y, z, k) { const c = g.get(x, y, z); if (c >= 0) g.set(x, y, z, shade(c, k)); }
export function recolor(g, x, y, z, c) { if (g.get(x, y, z) >= 0) g.set(x, y, z, c); }

// 큰 격자 안의 일부를 원점 이동해서 다루기 (뿔·꼬리처럼 밖으로 삐져나오는 장식 여유분)
export class Sub {
  constructor(g, dx, dy, dz) { this.g = g; this.dx = dx; this.dy = dy; this.dz = dz; }
  get(x, y, z) { return this.g.get(x + this.dx, y + this.dy, z + this.dz); }
  set(x, y, z, c) { this.g.set(x + this.dx, y + this.dy, z + this.dz, c); }
  fill(x0, y0, z0, x1, y1, z1, c) { for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, z, c); }
}

// ---------------------------------------------------------------- 도형
// 둥근 덩어리 (타원체) — f(x,y,z,d)가 색을 돌려줌
export function ell(g, cx, cy, cz, rx, ry, rz, f, cond = null) {
  for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const d = ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 + ((z + .5 - cz) / rz) ** 2;
    if (d <= 1 && (!cond || cond(x, y, z, d))) g.set(x, y, z, f(x, y, z, d));
  }
}
// 모서리 깎은 상자
export function rbox(g, x0, y0, z0, x1, y1, z1, f, cut = 1) {
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ex = x === x0 || x === x1, ez = z === z0 || z === z1, ey = y === y0 || y === y1;
    if (cut && ex && ez) continue;
    if (cut > 1 && ey && (ex || ez)) continue;
    g.set(x, y, z, f(x, y, z));
  }
}
// 원뿔 가시 (밑면 반지름 r, 높이 h, 방향 d = [dx,dy,dz] 단위축)
export function spike(g, x, y, z, d, h, c, ct = 0xe8e8e0) {
  for (let i = 0; i < h; i++) {
    const px = x + d[0] * i, py = y + d[1] * i, pz = z + d[2] * i;
    g.set(px, py, pz, i === h - 1 ? ct : c);
    if (i === 0) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const o = d[0] ? [0, a, b] : d[1] ? [a, 0, b] : [a, b, 0];
      g.set(px + o[0], py + o[1], pz + o[2], shade(c, .8));
    }
  }
}
// 선 (복셀 직선)
export function line(g, x0, y0, z0, x1, y1, z1, f) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) || 1;
  for (let i = 0; i <= n; i++) { const t = i / n, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t), z = Math.round(z0 + (z1 - z0) * t); g.set(x, y, z, typeof f === 'function' ? f(x, y, z, i) : f); }
}
// 글자 모양 찍기: rows 문자열 배열, '#'이면 c (위 행부터) — face: 'x' 면(x 고정, 가로=z) / 'z' 면(z 고정, 가로=x)
export function stamp(g, rows, ax, ay, az, axis, c, flip = false) {
  rows.forEach((row, r) => [...row].forEach((ch, i) => {
    if (ch === '.' || ch === ' ') return;
    const col = typeof c === 'object' ? c[ch] : c;
    const k = flip ? -i : i;
    if (axis === 'x') g.set(ax, ay - r, az + k, col); else g.set(ax + k, ay - r, az, col);
  }));
}

// ---------------------------------------------------------------- 얼굴 (뱀돌이 머리와 같은 좌표)
// 피부 블록 x 7..17, y 0..top, z 3..14 / 정면 x=17, 코 x=18. 눈 y4..5, 눈썹 y6, 입 y1..3
export function faceBase(g, F) {
  const s = F.skin, sd = shade(s, .84), sl = shade(s, 1.1), top = F.top ?? 9;
  for (let y = 0; y <= top; y++) {
    const z0 = y === 0 ? 5 : y === 1 ? 4 : 3, z1 = 17 - z0, x0 = y <= 1 ? 9 : 7;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= 17; x++) g.set(x, y, z, shade(s, (z <= 4 || z >= 13 ? .9 : 1) * (x <= 8 ? .92 : 1)));
  }
  if (F.jaw) { g.fill(17, 0, 5, 17, 0, 12, s); g.fill(13, -0, 4, 17, 0, 13, s); }        // 넓은 턱
  if (F.cranium) ell(g, 12.2, top, 8.5, 5.6, F.cranium, 6.3, (x, y, z) => (F.scalp ? F.scalp(x, y, z) : shade(s, y > top + 2 ? 1.05 : 1)), (x, y) => y > top);
  // 수염 자국 (턱·아래 뺨)
  if (F.stub) for (let y = 0; y <= (F.beardH ?? 2); y++) for (let z = 3; z <= 14; z++) for (let x = 8; x <= 17; x++) if (g.get(x, y, z) >= 0 && (x === 17 || z <= 4 || z >= 13 || y === 0)) g.set(x, y, z, hash3(x, y, z) < .7 ? F.stub : sd);
  // 입
  const M = F.mouthC ?? 0x2a1c14, T = 0xe8e2d2, TD = 0xc8c0ae;
  switch (F.mouth ?? 'grit') {
    case 'grit':     // 악문 이
      for (let z = 5; z <= 12; z++) { g.set(17, 1, z, M); g.set(17, 2, z, z % 2 ? T : TD); g.set(17, 3, z, M); }
      g.set(17, 2, 5, M); g.set(17, 2, 12, M); break;
    case 'snarl':    // 위아래 이가 보이게 벌린 입 (한쪽 입꼬리 올라감)
      for (let z = 5; z <= 12; z++) { g.set(17, 3, z, z % 2 ? T : TD); g.set(17, 2, z, M); g.set(17, 1, z, z % 2 ? TD : T); }
      g.set(17, 3, 5, M); g.set(17, 1, 12, M); g.set(17, 4, 12, M); g.set(17, 0, 7, M); g.set(17, 0, 10, M); break;
    case 'grin':     // 귀까지 찢어진 미친 웃음
      for (let z = 4; z <= 13; z++) { g.set(17, 3, z, z % 2 ? T : TD); g.set(17, 2, z, z % 2 ? TD : T); g.set(17, 1, z, M); }
      for (let z = 6; z <= 11; z++) g.set(17, 1, z, z % 2 ? T : TD);
      g.set(17, 0, 7, M); g.set(17, 0, 10, M);
      g.set(17, 4, 3, M); g.set(17, 4, 14, M); g.set(17, 3, 3, M); g.set(17, 3, 14, M); break;
    case 'frown':    // 꾹 다문 입 (입꼬리 내려감)
      for (let z = 6; z <= 11; z++) g.set(17, 1, z, M); g.set(17, 0, 5, M); g.set(17, 0, 12, M); break;
  }
  // 코
  if (F.nose !== false) {
    const nc = F.noseC ?? s;
    g.fill(18, 3, 8, 18, 4, 9, nc); g.set(18, 3, 8, shade(nc, .85)); g.set(18, 3, 9, shade(nc, .85));
    g.set(17, 3, 7, sd); g.set(17, 3, 10, sd);
    if (F.bigNose) { g.fill(18, 2, 7, 19, 4, 10, nc); g.fill(19, 3, 8, 19, 3, 9, shade(nc, 1.1)); g.set(19, 4, 8, shade(nc, 1.15)); }
  }
  // 눈 (흰자 3×eh + 눈동자). wild = 동그랗게 뜬 눈(꼬마)
  if (F.eyes !== false) {
    const eh = F.eyeH ?? 2, ey = F.eyeY ?? 4;
    for (const [z0, pz] of [[4, 6], [11, 11]]) {
      if (F.skipEye === z0) continue;
      g.fill(17, ey, z0, 17, ey + eh - 1, z0 + 2, 0xf2eee4);
      g.fill(17, ey, pz, 17, ey + (F.wild ? eh - 1 : eh - 1), pz, 0x16100c);
      if (F.wild) g.set(17, ey + eh - 1, pz, 0x3a2a20);
    }
  }
  // 눈썹 (화난 모양: 안쪽이 눈을 누름, 한 칸 튀어나옴)
  if (F.brow !== false) {
    const b = F.brow ?? 0x24140a, by = (F.eyeY ?? 4) + (F.eyeH ?? 2);
    for (let z = 3; z <= 7; z++) g.set(18, by, z, b);
    for (let z = 10; z <= 14; z++) g.set(18, by, z, b);
    if (F.angry !== false) { g.set(18, by - 1, 7, b); g.set(18, by - 1, 10, b); g.set(17, by - 1, 7, b); g.set(17, by - 1, 10, b); g.set(17, by, 8, sd); g.set(17, by, 9, sd); }
    if (F.thickBrow) { for (let z = 3; z <= 7; z++) g.set(18, by + 1, z, b); for (let z = 10; z <= 14; z++) g.set(18, by + 1, z, b); }
  }
  // 콧수염
  if (F.stache) {
    const c = F.stache, cl = shade(c, 1.2);
    for (let z = 4; z <= 13; z++) { g.set(18, 2, z, pick(18, 2, z, c, cl, shade(c, .8))); if (z >= 5 && z <= 12) g.set(18, 3, z, c); }
    g.set(18, 3, 8, F.noseC ?? s); g.set(18, 3, 9, F.noseC ?? s);
    g.fill(18, 0, 3, 18, 1, 4, c); g.fill(18, 0, 13, 18, 1, 14, c);   // 늘어진 끝
    if (F.bushy) { for (let z = 3; z <= 14; z++) { g.set(19, 2, z, pick(19, 2, z, c, cl, shade(c, .8))); g.set(18, 1, z, c); } g.fill(19, 3, 6, 19, 3, 11, c); g.set(18, 0, 2, c); g.set(18, 0, 15, c); g.set(18, -0, 3, c); }
  }
  // 귀
  if (F.ears !== false) { g.fill(11, 3, 2, 12, 5, 2, s); g.fill(11, 3, 15, 12, 5, 15, s); g.set(11, 4, 2, sd); g.set(11, 4, 15, sd); }
  if (F.earring) { g.set(12, 2, 1, F.earring); g.set(12, 1, 1, F.earring); g.set(12, 2, 16, F.earring); g.set(12, 1, 16, F.earring); }
}

// ---------------------------------------------------------------- 몸통 틀
// x 0..X-1(앞면 x=X-1), y 0..TH-1, z 0..D-1 + 승모근 2줄. paint(region, x,y,z) → 색
// region: 'belt'(아래 2줄) / 'body' / 'chest'(가슴 볼록, x=X) / 'trap'(목 둘레로 솟은 어깨) / 'belly'
export function torsoShape(g, P, paint) {
  const X = P.X ?? 10, TH = P.TH ?? 9, D = P.D ?? 18, belt = P.belt ?? 2, tr = P.trap ?? 2;
  const inset = P.inset ?? (y => y <= 1 ? 3 : y <= 4 ? 2 : 0);
  for (let y = 0; y < TH; y++) {
    const z0 = inset(y), z1 = D - 1 - z0;
    for (let z = z0; z <= z1; z++) for (let x = 0; x < X; x++) g.set(x, y, z, paint(y < belt ? 'belt' : 'body', x, y, z));
  }
  // 가슴: 앞으로 한 칸 볼록
  const c0 = P.chestY ?? [TH - 4, TH - 2], cz = P.chestZ ?? [Math.round(D / 3), D - 1 - Math.round(D / 3)];
  for (let y = c0[0]; y <= c0[1]; y++) for (let z = cz[0]; z <= cz[1]; z++) g.set(X, y, z, paint('chest', X, y, z));
  // 배: 앞으로 볼록 (뚱뚱한 체형)
  if (P.belly) { const [b0, b1, k] = P.belly; for (let y = b0; y <= b1; y++) { const t = 1 - Math.abs((y - (b0 + b1) / 2) / ((b1 - b0) / 2 + 1)); const n = Math.round(k * t + .4); for (let i = 1; i <= n; i++) for (let z = 3 + i; z <= D - 4 - i; z++) g.set(X - 1 + i, y, z, paint('belly', X - 1 + i, y, z)); } }
  // 승모근: 목 둘레로 솟아 머리를 감쌈
  const nz0 = P.neck?.[0] ?? Math.round(D / 3), nz1 = P.neck?.[1] ?? D - 1 - Math.round(D / 3);
  for (let y = TH; y < TH + tr; y++) for (let z = 2; z <= D - 3; z++) for (let x = 2; x <= X - 2; x++) {
    if (z >= nz0 && z <= nz1 && x >= 4) continue;
    if (y === TH + tr - 1 && (z <= 3 || z >= D - 4)) continue;
    g.set(x, y, z, paint('trap', x, y, z));
  }
}

// ---------------------------------------------------------------- 팔 틀
// 격자 (W+1) × AH × D. 아래부터 주먹 → 손목 → 팔뚝 → 이두 → 둥근 어깨
// P: { W, D, AH, f1(주먹 윗줄), w1(손목 윗줄), fo1(팔뚝 윗줄), b1(이두 윗줄), foIn(팔뚝 안쪽 들임), foreBulge }
export function armShape(P, paint, front) {
  const W = P.W ?? 9, D = P.D ?? 9, AH = P.AH ?? 16, f1 = P.f1 ?? 4, w1 = P.w1 ?? 6, fo1 = P.fo1 ?? 8, b1 = P.b1 ?? 11;
  const px = P.padX ?? 0, pz = P.padZ ?? 1, py = P.padY ?? 0;       // 둘레 여유 (징·칼날 지느러미용, 아래 = 주먹 밑으로 뻗는 칼날)
  const g = new VoxGrid(W + 2 + px, AH + py, D + 2 * pz), s = new Sub(g, px, py, pz);
  const fi = P.foIn ?? 1, wi = P.wIn ?? 1;
  // 주먹
  rbox(s, 0, 0, 0, W - 1, f1, D - 1, (x, y, z) => paint('fist', x, y, z), 2);
  if (!P.noFingers) {
    for (let z = 2; z < D - 2; z += 2) for (let y = 1; y < f1; y++) mul(s, W - 1, y, z, .8);       // 손가락 홈
    for (let z = 1; z < D - 1; z++) { mul(s, W - 1, f1, z, 1.12); mul(s, W - 2, f1, z, 1.08); }   // 마디
    const tz = front ? 0 : D - 1;                                                                   // 엄지
    for (let x = W - 4; x <= W - 1; x++) for (let y = 1; y <= 2; y++) { s.set(x, y, tz, shade(paint('fist', x, y, tz), .86)); }
  }
  for (let y = f1 + 1; y <= w1; y++) rbox(s, wi, y, wi, W - 1 - wi, y, D - 1 - wi, (x, yy, z) => paint('wrist', x, yy, z));
  for (let y = w1 + 1; y <= fo1; y++) rbox(s, fi, y, fi, W - 1 - fi, y, D - 1 - fi, (x, yy, z) => paint('fore', x, yy, z));
  if (P.foreBulge) for (let y = w1 + 2; y <= fo1; y++) for (let z = 2; z <= D - 3; z++) s.set(W - fi, y, z, paint('fore', W - fi, y, z));
  for (let y = fo1 + 1; y <= b1; y++) {
    rbox(s, 1, y, 1, W - 2, y, D - 2, (x, yy, z) => paint('bic', x, yy, z));
    if (y >= b1 - 1) for (let z = 2; z <= D - 3; z++) s.set(W - 1, y, z, paint('bic', W - 1, y, z));   // 이두 볼록
  }
  for (let z = 1; z <= D - 2; z++) mul(s, 1, fo1 + 1, z, .88);                                       // 삼두 그늘
  const cy = b1 + 1.6, ry = AH - cy + .2;
  ell(s, W / 2, cy, D / 2, W / 2 + .1, ry, D / 2 + .1, (x, y, z) => paint('sh', x, y, z), (x, y) => y > b1);
  return { g, s, W, D, px, pz, py };
}

// ---------------------------------------------------------------- 다리 틀
// 격자 Wx × LH × D. 아래 신발(밑창 2줄 + 갑피) → 바짓단 → 바지. 앞(발끝) = +x
// P: { Wx, D, LH, boot1(신발 윗줄), toe(발끝 x), px0, px1(바지 x 범위), cuff(밑단 줄 수) }
export function legShape(P, paint) {
  const Wx = P.Wx ?? 13, D = P.D ?? 9, LH = P.LH ?? 18, b1 = P.boot1 ?? 6, toe = P.toe ?? 12, px0 = P.px0 ?? 1, px1 = P.px1 ?? 9;
  const g = new VoxGrid(Wx, LH, D);
  for (let y = b1 + 1; y < LH; y++) for (let z = 0; z < D; z++) for (let x = px0; x <= px1; x++) {
    if ((x === px0 || x === px1) && (z === 0 || z === D - 1)) continue;
    g.set(x, y, z, paint('pant', x, y, z));
  }
  const cuff = P.cuff ?? 0;
  for (let y = b1 + 1; y <= b1 + cuff; y++) rbox(g, px0 - 1, y, 0, px1 + 1, y, D - 1, (x, yy, z) => paint('cuff', x, yy, z));
  // 밑창: 홈 파인 두꺼운 밑창
  rbox(g, 0, 0, 0, toe, P.sole ?? 1, D - 1, (x, y, z) => paint('sole', x, y, z), 1);
  // 갑피: 발등이 앞으로 경사
  for (let y = (P.sole ?? 1) + 1; y <= b1; y++) {
    const xm = y <= (P.sole ?? 1) + 2 ? toe - 1 : Math.max(px1 - 1, toe - 1 - (y - (P.sole ?? 1) - 2));
    rbox(g, 0, y, 0, xm, y, D - 1, (x, yy, z) => paint('boot', x, yy, z), 1);
  }
  return g;
}

// ---------------------------------------------------------------- 조립
// s: { head:{g, origin}, torso:{g, origin, joint, far}, armF, armB (팔 격자 {g,W,D}), AU, AL,
//      leg (격자), LU, LL, legO:[ox,oz], hipZ(m), shZ(복셀), shUp(몸통 위로 솟은 어깨 칸), THn, opts }
export function assemble(r, s) {
  const opt = { ao: true };
  const mk = (grid, origin, joint, far = null) => {
    const paint = (g, y) => { for (let z = 0; z < grid.d; z++) for (let x = 0; x < grid.w; x++) if (grid.get(x, y, z) >= 0) g.set(x, y, z, WOUND[(x * 7 + z * 3 + y) % WOUND.length]); };
    const copy = () => { const g = new VoxGrid(grid.w, grid.h, grid.d); g.data.set(grid.data); return g; };
    const cut = copy(); paint(cut, joint);
    const stump = new VoxGrid(grid.w, grid.h, grid.d); paint(stump, joint);
    const out = { ...meshGrid(r, grid, H, origin, opt), cut: meshGrid(r, cut, H, origin, opt), stump: meshGrid(r, stump, H, origin).mesh };
    if (far != null) {
      const tb = copy(); paint(tb, joint); paint(tb, far);
      const b = copy(); paint(b, far);
      out.cutTB = meshGrid(r, tb, H, origin, opt);
      out.cutB = meshGrid(r, b, H, origin, opt);
    }
    return out;
  };
  const slice = (g, y0, y1) => {
    const o = new VoxGrid(g.w, y1 - y0 + 1, g.d);
    for (let z = 0; z < g.d; z++) for (let y = y0; y <= y1; y++) for (let x = 0; x < g.w; x++) o.set(x, y - y0, z, g.get(x, y, z));
    return o;
  };
  const { AU, AL, LU, LL, THn } = s, AH = AU + AL, LHn = LU + LL;
  const LH = LHn * H, TH = THn * H;
  const armPart = a => {
    const ox = a.W / 2 + a.px, oz = a.D / 2 + a.pz, py = a.py ?? 0;   // armShape의 둘레 여유
    return { U: mk(slice(a.g, py + AL, py + AH - 1), [ox, AU, oz], AU - 1, 0), L: mk(slice(a.g, 0, py + AL - 1), [ox, py + AL, oz], py + AL - 1) };
  };
  const aF = armPart(s.armF), aB = s.armB === s.armF ? aF : armPart(s.armB);
  const lo = s.legO ?? [5.5, 4.5];
  const legF = { U: mk(slice(s.leg, LL, LHn - 1), [lo[0], LU, lo[1]], LU - 1, 0), L: mk(slice(s.leg, 0, LL - 1), [lo[0], LL, lo[1]], LL - 1) };
  const legB = s.legB ? { U: mk(slice(s.legB, LL, LHn - 1), [lo[0], LU, lo[1]], LU - 1, 0), L: mk(slice(s.legB, 0, LL - 1), [lo[0], LL, lo[1]], LL - 1) } : legF;
  const headM = mk(s.head.g, s.head.origin, 0);
  const torsoM = mk(s.torso.g, s.torso.origin, s.torso.joint ?? THn - 1, s.torso.far ?? 0);
  const shZ = s.shZ * H, shY = LH + TH + (s.shUp ?? 3) * H, hipZ = s.hipZ;
  // 머리 꼭대기 높이 (머리 격자에서 실제로 찬 가장 높은 줄)
  let top = 0; const hg = s.head.g;
  for (let y = hg.h - 1; y >= 0 && !top; y--) for (let i = 0; i < hg.w * hg.d && !top; i++) if (hg.data[i % hg.w + hg.w * (y + hg.h * Math.floor(i / hg.w))] >= 0) top = y + 1;
  const headTop = top - s.head.origin[1];
  return {
    height: s.height ?? (LHn + THn) * H + headTop * H,
    armLen: AH * H, armULen: AU * H, handLen: AL * H,
    legLen: LH, legULen: LU * H,
    brawl: { arm: .15, hand: .75, leg: .24 }, armSpread: .34, legSpread: .1,   // 적 기본 싸움 자세 (actor.js idle)
    ...s.opts,
    parts: {
      legB:  { ...legB.U, pivot: [0, LH, -hipZ] },
      shinB: { ...legB.L, pivot: [0, -LU * H, 0], parent: 'legB' },
      armB:  { ...aB.U, pivot: [0, shY, -shZ] },
      handB: { ...aB.L, pivot: [0, -AU * H, 0], parent: 'armB' },
      torso: { ...torsoM, pivot: [0, LH, 0] },
      head:  { ...headM, pivot: [0, LH + TH + (s.headUp ?? 0) * H, 0] },
      legF:  { ...legF.U, pivot: [0, LH, hipZ] },
      shinF: { ...legF.L, pivot: [0, -LU * H, 0], parent: 'legF' },
      armF:  { ...aF.U, pivot: [0, shY, shZ] },
      handF: { ...aF.L, pivot: [0, -AU * H, 0], parent: 'armF' },
    },
  };
}
