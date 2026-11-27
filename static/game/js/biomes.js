// 폐허 초원 · 모래 공업지대 · 얼어붙은 항구 배경 (기준: docs/art/ref/biome_*.webp)
// 길 뒤(z < -5)를 '구획(lot)'으로 나눠 건물·마당·부두를 늘어놓고, 그 뒤 원경(언덕·굴뚝·크레인·배)을 놓는다.
// 건물은 0.2m, 소품은 0.1m 복셀. 모두 x 구간별 청크로 합쳐 화면 근처만 그림.
import { Chunks, grid, box, cyl, line, h3, vnoise, mixC, shadeC, rgb } from './env.js';
import { FACES } from './voxel.js';
import { rand, randi, pick } from './math.js';
import { BIOME_ENV } from './config.js';

const B = 0.2, F = 0.1;   // 건물 복셀 / 소품 복셀 (m)
const CONC = [0x8e8a84, 0x7e7a74, 0x96928a, 0x86827c];
const RUST = [0x6e4028, 0x7a4a2e, 0x5e3622, 0x865436];
const WOOD = [0x6e5438, 0x7a5e40, 0x5e4830, 0x846646];
const SNOW = [0xd2d6d8, 0xc4c9cc, 0xdadedf], SAND = [0xb8a078, 0xaa9068, 0xc2aa82];
const DRY = [0x9a8c5e, 0x8a7c50, 0xa89a6a, 0x7a7046, 0xb0a272];
const VINE = [0x5a5e3a, 0x6a6a40, 0x4a5032, 0x767448];

// ---------------------------------------------------------------- 배치 계획 (지형보다 먼저: 항구는 부두 폭이 구획마다 다름)
export function planBiome(key, L, seed) {
  const lots = [];
  const kinds = {
    plains: [['apt', 9, 13, 3], ['field', 9, 16, 4], ['lowruin', 6, 9, 2]],
    desert: [['warehouse', 12, 18, 4], ['yard', 7, 12, 4]],
    snow: [['warehouse', 12, 16, 3], ['containers', 9, 14, 4], ['quay', 8, 13, 3]],
  }[key];
  let x = -14, prev = null;
  while (x < L + 16) {
    let k; do { const tot = kinds.reduce((a, q) => a + q[3], 0); let r = Math.random() * tot; k = kinds.find(q => (r -= q[3]) < 0) ?? kinds[0]; } while (k[0] === prev && kinds.length > 1 && k[0] !== 'field' && k[0] !== 'yard');
    const w = randi(k[1], k[2]);
    lots.push({ type: k[0], x0: x, x1: x + w, seed: lots.length * 37 + seed });
    prev = k[0]; x += w;
  }
  const lotAt = x => lots.find(l => x >= l.x0 && x < l.x1);
  // 원경 언덕 높이 (m, 0.25 단위로 끊음): 0.5m 격자 메시로 그림 (1m 블록 계단이 보이지 않게)
  const hillZ = { plains: -11, desert: -13, snow: -27 }[key];
  const hillH = (x, z) => {
    if (z >= hillZ) return 0;
    let h;
    if (key === 'plains') {
      h = (-z + hillZ) * 0.2 + vnoise(x * .07, z * .09, seed) * 2.4 - 0.5;
      if (z < -22) h += (-z - 22) * 0.3 + vnoise(x * .05, z * .05, seed + 7) * 3;
    } else if (key === 'desert') h = (-z + hillZ) * 0.22 + vnoise(x * .06, z * .14, seed) * 2.6 + Math.sin(x * .09 + z * .2) * .8 - .6;
    else h = (-z + hillZ) * 0.55 + vnoise(x * .06, z * .1, seed) * 4 - 1;
    return Math.max(0, Math.round(h * 4) / 4);
  };
  // 1m 블록 지형 높이 (null = 물: 블록 없음). 언덕 자리는 높이 0 바닥만 깔고 그 위에 언덕 메시
  const groundH = (x, z) => {
    if (z >= -5 || key !== 'snow') return 0;
    if (z < hillZ) return 0;
    const lot = lotAt(x);
    if (z >= -7) return 0;
    if (lot && lot.type !== 'quay' && z >= -17) return 0;
    return null;
  };
  return { key, L, seed, lots, groundH, hillH, hillZ };
}

// ================================================================ 건물·구조물 (0.2m)
// 폐허 아파트: 콘크리트 층·깨진 창·부서진 발코니·철근·덩굴, 한쪽 윗부분이 무너짐
function apartment(ch, lot, low) {
  const w = lot.x1 - lot.x0 - randi(0, 2), x0 = lot.x0 + rand(0, 1), s = lot.seed;
  const W = w * 5, H = low ? randi(18, 28) : randi(48, 70), D = 22, FP = 5;   // FP: 앞쪽 발코니 여백
  const g = grid(W, H + 6, D + FP), fz = D - 1;
  const side = h3(s, 1, 1) < .5, cw = W * rand(.3, .55);
  const top = x => {
    if (low) return H - 1 - Math.floor(vnoise(x * .12, 0, s) * 12);
    const t = side ? (W - x) / cw : x / cw;   // 무너진 쪽으로 갈수록 낮아짐
    return t < 1 ? Math.floor(H * (.45 + .55 * t) - vnoise(x * .3, 1, s) * 6) : H - 1 - (vnoise(x * .2, 2, s) > .75 ? 2 : 0);
  };
  const win = (x, y) => { const fy = y % 15, bx = x % 10; return y >= 15 && bx >= 2 && bx <= 7 && fy >= 4 && fy <= 11; };
  box(g, 0, 0, 0, W - 1, H - 1, fz, (x, y, z) => {
    if (y > top(x)) return -1;
    const edge = x === 0 || x === W - 1 || z === 0 || z === fz;
    if (z >= fz - 2 && win(x, y)) return -1;          // 창 구멍
    if (z === fz - 3 && win(x, y)) return h3(x, y, s) < .15 ? 0x3a3632 : 0x1e1c1a;   // 어두운 실내
    if (y < 13 && z >= fz - 2 && x % 25 >= 9 && x % 25 <= 15 && x > 2 && x < W - 3) return -1;   // 1층 입구
    if (y < 13 && z === fz - 3 && x % 25 >= 9 && x % 25 <= 15) return 0x1a1816;
    let c = CONC[(vnoise(x * .2, y * .2, s) * 3.99) | 0];
    if (y % 15 === 0 || y % 15 === 14) c = shadeC(c, .78);                          // 층 띠
    if (h3(x, 0, s) < .25 && (top(x) - y) < 6 + h3(x, 1, s) * 14) c = shadeC(c, .8); // 빗물 자국
    if (y < 4) c = mixC(c, 0x5a5040, .35);
    if (vnoise(x * .15, y * .15, s + 4) > .74) c = mixC(c, 0x5e6040, .45);           // 이끼
    return c;
  });
  // 층 띠 (앞으로 한 칸)
  for (let y = 15; y < H; y += 15) for (let x = 0; x < W; x++) if (y <= top(x)) g.set(x, y, fz + 1, shadeC(CONC[1], .85));
  // 창틀 조각·깨진 유리
  for (let x = 0; x < W; x++) for (let y = 15; y < H; y++) if (win(x, y) && y <= top(x) && (x % 10 === 2 || x % 10 === 7 || y % 15 === 4) && h3(x, y, s + 2) < .55) g.set(x, y, fz - 2, h3(x, y, s) < .3 ? 0x5a6266 : 0x3e3a36);
  // 발코니: 슬래브 + 녹슨 난간 (일부 부서짐)
  for (let fy = 15; fy < H - 4; fy += 15) for (let bx = 0; bx + 10 <= W; bx += 10) {
    if (h3(bx, fy, s + 5) > .55 || fy + 5 > top(bx + 5)) continue;
    const brk = h3(bx, fy, s + 6) < .35;
    for (let x = bx; x < bx + 10; x++) {
      const out = brk ? Math.max(0, 4 - Math.floor((x - bx) * .6)) : 4;
      for (let z = fz + 1; z <= fz + out; z++) g.set(x, fy, z, CONC[2]);
      if (out >= 4) { g.set(x, fy + 4, fz + 4, RUST[x % 4]); if (x % 2 === 0) for (let y = fy + 1; y < fy + 4; y++) g.set(x, y, fz + 4, RUST[(x + y) % 4]); }
      else if (out > 0 && h3(x, fy, s) < .5) line(g, x, fy, fz + out, x, fy - 2, fz + out + 1, RUST[1]);   // 부러진 철근
    }
  }
  // 무너진 윗부분의 철근
  for (let x = 1; x < W - 1; x += 2) { const t = top(x); if (t < H - 4 && h3(x, 3, s) < .6) for (let y = t + 1; y < Math.min(H, t + randi(2, 6)); y++) g.set(x, y, fz - randi(0, 1), RUST[y % 4]); }
  // 덩굴
  for (let x = 0; x < W; x++) {
    if (vnoise(x * .15, 3, s) < .45 || h3(x, 4, s) < .4) continue;
    const t = Math.min(top(x), H - 1), len = randi(4, 22);
    for (let k = 0; k < len && t - k > 0; k++) { g.set(x, t - k, fz + 1, VINE[(x + k) % 4]); if (h3(x, k, s) < .2) g.set(x + 1, t - k, fz + 1, VINE[2]); }
  }
  // 바닥 잔해
  for (let x = 0; x < W; x++) for (let z = fz + 1; z < fz + FP; z++) { const hh = Math.floor(vnoise(x * .25, z * .4, s + 9) * 4 - (z - fz) * .7); for (let y = 0; y < hh; y++) g.set(x, y, z, CONC[(x + y + z) % 4]); }
  ch.add(g, B, x0, 0, -6.4 - D * B, { seed: s });
}

// 철골 창고 (사막·항구): 골함석 벽, 무너진 지붕과 트러스, 반쯤 무너진 셔터, 깨진 창
function warehouse(ch, lot, key) {
  const snow = key === 'snow', s = lot.seed, w = lot.x1 - lot.x0 - randi(1, 2), x0 = lot.x0 + rand(0, 1);
  const W = w * 5, Hw = randi(22, 26), D = 40, roofRise = .3, H = Hw + Math.ceil(D * roofRise) + 3, FP = 6;
  const g = grid(W, H, D + FP), fz = D - 1;
  const base = snow ? pick([0x6e7074, 0x6a6660, 0x5e6266]) : pick([0x7e7468, 0x8a6a4e, 0x76705e]);
  const roofY = z => Hw + Math.floor((fz - z) * roofRise);
  const door0 = randi(6, Math.max(7, W - 26)), door1 = door0 + 18, doorH = 18;
  const doorHole = x => 2 + Math.floor(vnoise(x * .3, 0, s) * 7) + (x > door0 + 4 && x < door1 - 4 ? 4 : 0);
  const wallC = (x, y, l) => {
    let c = l % 3 === 2 ? shadeC(base, .78) : base;                         // 골함석
    if (y % 8 === 0) c = shadeC(base, .7);                                   // 띠장
    const r = vnoise(l * .12, y * .1, s);
    if (r > (snow ? .62 : .5)) c = mixC(c, RUST[(l + y) % 4], snow ? .7 : .85);
    if (y > Hw - 4 && h3(l, 0, s) < .35) c = mixC(c, RUST[1], .6);             // 녹물
    if (!snow && y < 4) c = ((l + y) % 8 < 4) ? 0x9a8a44 : 0x2e2c28;             // 경고 띠
    return c;
  };
  // 벽: 앞·뒤·양옆 (두께 2칸)
  for (let x = 0; x < W; x++) for (let z = 0; z <= fz; z++) for (let y = 0; y < Hw; y++) {
    const front = z >= fz - 1, back = z <= 1, sideW = x <= 1 || x >= W - 2;
    if (!front && !back && !sideW) continue;
    if (front && x >= door0 && x < door1 && y < doorH) {                      // 셔터
      if (y < doorHole(x)) continue;
      if (z === fz) g.set(x, y, z, y % 2 ? 0x6a665e : 0x58544e);
      continue;
    }
    if (front && y >= Hw - 9 && y < Hw - 3 && x % 16 >= 1 && x % 16 <= 13 && Math.abs(x - (door0 + door1) / 2) > 13) {   // 창: 철제 격자 + 깨진 유리
      if (z === fz) { const fr = x % 16 === 1 || x % 16 === 13 || x % 3 === 1 || y === Hw - 9 || y === Hw - 4 || y === Hw - 7; g.set(x, y, z, fr ? 0x3a342e : h3(x, y, s) < .35 ? 0x5a6064 : -1); }
      else g.set(x, y, z, 0x161514);
      continue;
    }
    if (front && z === fz && x % 3 === 2) { g.set(x, y, fz - 1, wallC(x, y, x)); continue; }   // 골 (한 칸 들어감)
    g.set(x, y, z, wallC(front || back ? x : z, y, front || back ? x : z));
  }
  // 기둥 (앞으로 한 칸)
  for (let x = 0; x < W; x += 20) for (let y = 0; y < Hw; y++) { g.set(x, y, fz + 1, 0x3a342e); g.set(x + 1, y, fz + 1, 0x3a342e); }
  // 셔터 위 상자와 등
  for (let x = door0 - 1; x <= door1; x++) for (let y = doorH; y < doorH + 2; y++) g.set(x, y, fz + 1, 0x4a443e);
  box(g, ((door0 + door1) >> 1) - 1, doorH + 3, fz + 1, ((door0 + door1) >> 1) + 1, doorH + 3, fz + 2, 0x5a5650);
  // 지붕: 뒤로 높아지는 경사, 군데군데 무너져 트러스가 보임
  for (let x = 0; x < W; x++) for (let z = 0; z <= fz + 1; z++) {
    const y = roofY(Math.min(z, fz)), hole = vnoise(x * .09, z * .12, s + 3) > .56 && x > 3 && x < W - 4;
    if (!hole) g.set(x, y, z, snow && vnoise(x * .3, z * .3, s) > .2 ? SNOW[(x + z) % 3] : (x % 3 === 2 ? shadeC(base, .8) : mixC(base, RUST[2], vnoise(x * .1, z * .1, s + 1) > .55 ? .7 : .15)));
    if (x % 15 === 7 && z % 2 === 0) g.set(x, y - 1, z, 0x3a2e26);                               // 트러스 위현
    if (x % 15 === 7 && (z % 8 === 0 || (z + y) % 8 === 0) ) for (let yy = Hw; yy < y; yy++) if ((z + yy) % 4 === 0) g.set(x, yy, z, 0x3a2e26);
    if (z === fz + 1 && snow && h3(x, 9, s) < .45) { const n = randi(1, 4); for (let k = 1; k <= n; k++) g.set(x, Hw - k, fz + 2, k === n ? 0xb8c8d0 : 0xa8bcc6); }   // 고드름
  }
  for (let x = 2; x < W - 2; x += 15) for (let z = 0; z <= fz; z++) g.set(x + 5, Hw, z, 0x3a2e26);   // 가로 보
  // 바닥 (안쪽, 어둡게) + 셔터 아래로 흘러든 모래/눈
  for (let x = 2; x < W - 2; x++) for (let z = 2; z < fz - 1; z++) g.set(x, 0, z, snow ? 0x4a4c4e : 0x6a5a44);
  const drift = snow ? SNOW : SAND;
  for (let x = door0 - 3; x < door1 + 3; x++) for (let z = fz - 8; z < fz + FP; z++) {
    const hgt = Math.floor((1 - Math.abs(z - fz) / 9) * (4 + vnoise(x * .2, z * .2, s) * 5));
    for (let y = 0; y < hgt; y++) if (g.get(x, y, z) < 0) g.set(x, y, z, drift[(x + y) % 3]);
  }
  for (let x = 0; x < W; x++) { const hgt = Math.floor(vnoise(x * .15, 5, s) * (snow ? 3 : 5)); for (let y = 0; y < hgt; y++) for (let z = fz + 1; z < fz + 1 + hgt - y; z++) if (g.get(x, y, z) < 0) g.set(x, y, z, drift[(x + z) % 3]); }
  ch.add(g, B, x0, 0, -6.4 - D * B, { seed: s });
}

// 컨테이너 (0.2m): 길이 6m × 높이 2.6m × 폭 2.4m, 주름 벽·문 잠금 막대
const CONT = { snow: [0x7a3a30, 0x3e5a58, 0x6a4a30, 0x4a4e58, 0x6e6a5a], desert: [0x7a4a32, 0x5a5448, 0x806a3a, 0x6a3a2e, 0x4e5a58] };
function container(ch, x, y, z, key, seed, len = 30) {
  const g = grid(len, 14, 12), base = pick(CONT[key]), dark = shadeC(base, .62), snow = key === 'snow';
  box(g, 0, 0, 0, len - 1, 12, 11, (xx, yy, zz) => {
    const edge = xx < 1 || xx >= len - 1 || yy < 1 || yy >= 12;
    let c = edge ? dark : (xx % 2 ? shadeC(base, .85) : base);
    if (vnoise(xx * .2, yy * .25 + zz * .1, seed) > .63) c = mixC(c, RUST[(xx + yy) % 4], .8);
    if (!edge && (zz === 11 || zz === 0) && xx % 2 === 1 && yy > 0 && yy < 12) return -2;
    return c;
  });
  for (let xx = 1; xx < len - 1; xx += 2) for (let yy = 1; yy < 12; yy++) { g.set(xx, yy, 11, -1); g.set(xx, yy, 10, shadeC(base, .8)); }   // 주름 골
  for (const zz of [2, 4, 7, 9]) for (let yy = 1; yy < 12; yy++) g.set(len - 1, yy, zz, yy % 4 === 0 ? 0x5a564e : 0x8a8478);   // 잠금 막대
  for (let xx = 3; xx < 12; xx++) if (h3(xx, 0, seed) < .55) g.set(xx, 9, 11, mixC(base, 0xc8c0b0, .6));                    // 바랜 글씨
  if (snow) for (let xx = 0; xx < len; xx++) for (let zz = 0; zz < 12; zz++) { if (vnoise(xx * .3, zz * .3, seed) > .2) g.set(xx, 13, zz, SNOW[(xx + zz) % 3]); }
  if (snow) for (let xx = 0; xx < len; xx++) if (h3(xx, 3, seed) < .3) for (let k = 1; k <= randi(1, 3); k++) g.set(xx, 13 - k, 11, 0xb0c2ca);
  if (key === 'desert') for (let xx = 0; xx < len; xx++) for (let zz = 0; zz < 12; zz++) if (vnoise(xx * .25, zz * .25, seed + 2) > .62) g.set(xx, 12, zz, SAND[(xx + zz) % 3]);
  ch.add(g, B, x, y, z, { seed });
}

// ================================================================ 소품 (0.1m)
// 철망 울타리 한 칸 (2.5m): 기둥 + 마름모 철망(얇게) + 사막은 윗단 가시철선. broken: 구멍 / 'gone': 철망 없음
function fencePanel(ch, x, z, key, seed, broken) {
  const W = 25, H = 21, post = grid(2, H + (key === 'desert' ? 6 : 1), 2), RC = key === 'snow' ? 0x5a5650 : 0x6a4a34;
  box(post, 0, 0, 0, 1, post.h - 1, 1, (xx, y) => y % 5 === 0 ? shadeC(RC, .8) : RC);
  if (key === 'desert') { for (let y = H; y < H + 6; y++) post.set(1, y, 0, 0x3a3632); }
  ch.add(post, F, x, 0, z - .1, { seed });
  if (broken === 'gone') return;
  const mesh = grid(W, H + (key === 'desert' ? 6 : 0), 1);
  const hole = (xx, y) => broken && ((xx - 12) ** 2 / 60 + (y - 6) ** 2 / 40) < 1 + vnoise(xx * .3, y * .3, seed) * .8;
  for (let xx = 2; xx < W; xx++) for (let y = 0; y < H; y++) {
    if (y === H - 1) { mesh.set(xx, y, 0, shadeC(RC, .9)); continue; }    // 윗 가로대
    if ((xx + y) % 4 && (xx - y + 400) % 4) continue;
    if (hole(xx, y)) continue;
    mesh.set(xx, y, 0, vnoise(xx * .2, y * .2, seed) > .6 ? RUST[(xx + y) % 4] : (key === 'snow' ? 0x7a7a76 : 0x7e7668));
  }
  if (key === 'desert') for (let xx = 0; xx < W; xx++) for (const y of [H + 1, H + 3, H + 5]) if ((xx + y) % 3 && !(h3(xx, y, seed) < .08)) mesh.set(xx, y, 0, (xx + y) % 5 === 0 ? 0x5a564e : 0x3a3632);
  if (key === 'plains') for (let xx = 2; xx < W; xx++) if (vnoise(xx * .2, 7, seed) > .55) { const t = randi(4, H - 1); for (let y = t; y > t - randi(3, 9) && y >= 0; y--) mesh.set(xx, y, 0, VINE[(xx + y) % 4]); }
  ch.add(mesh, F, x, 0, z, { seed, thin: true });
}
function fenceRun(ch, x0, x1, z, key, seed) {
  for (let x = x0; x + 2.5 <= x1 + .01; x += 2.5) {
    const r = h3(Math.floor(x * 4), 1, seed);
    fencePanel(ch, x, z, key, seed + Math.floor(x * 10), r < .12 ? 'gone' : r < .35);
  }
}

// 드럼통 하나 (지름 0.6m, 높이 0.9m), 가끔 넘어짐
function drum(ch, x, z, key, seed, tipped = false) {
  const g = tipped ? grid(9, 6, 6) : grid(6, 9, 6), base = pick([0x7a4a30, 0x56605c, 0x857246, 0x6a3a2a, 0x5a5a52, 0x4a5a4a, 0x8a3a2c]);
  const col = (t, a, b) => { let c = base; if (t === 2 || t === 6) c = shadeC(base, .7); if (vnoise(a * .5 + t * .3, b * .5 + t * .2, seed) > .58) c = mixC(c, RUST[(t + a) % 4], .85); if (t === 8 || t === 0) c = shadeC(base, .85); return c; };
  if (!tipped) cyl(g, 'y', 3, 3, 3, 0, 8, (xx, y, zz) => col(y, xx, zz));
  else cyl(g, 'x', 3, 3, 3, 0, 8, (xx, y, zz) => col(xx, y, zz));
  if (!tipped && key === 'snow') for (let xx = 0; xx < 6; xx++) for (let zz = 0; zz < 6; zz++) if (g.get(xx, 8, zz) >= 0) g.set(xx, 8, zz, SNOW[(xx + zz) % 3]);
  ch.add(g, F, x, 0, z, { seed });
}
function drumCluster(ch, x, z, key, seed) {
  const n = randi(3, 7);
  for (let i = 0; i < n; i++) drum(ch, x + (i % 3) * .62 + rand(-.03, .03), z - Math.floor(i / 3) * .64, key, seed + i, i === n - 1 && h3(seed, i, 2) < .5);
}
// 팔레트 더미
function pallets(ch, x, z, key, seed, n = randi(2, 7)) {
  const g = grid(12, n * 2 + 1, 10);
  for (let y = 0; y < n * 2; y++) for (let xx = 0; xx < 12; xx++) for (let zz = 0; zz < 10; zz++) {
    const c = WOOD[((y >> 1) + seed) % 4];
    if (y % 2) { if (zz % 3 !== 2) g.set(xx, y, zz, c); } else if (xx <= 1 || xx >= 10 || xx === 5 || xx === 6) g.set(xx, y, zz, shadeC(c, .8));
  }
  if (key === 'snow') for (let xx = 0; xx < 12; xx++) for (let zz = 0; zz < 10; zz++) if (vnoise(xx * .3, zz * .3, seed) > .25) g.set(xx, n * 2, zz, SNOW[(xx + zz) % 3]);
  ch.add(g, F, x, 0, z, { seed });
}
// 계류 말뚝 (녹, 눈 모자)
function bollard(ch, x, z, seed) {
  const g = grid(6, 8, 6);
  cyl(g, 'y', 3, 3, 2.2, 0, 5, (xx, y) => y === 4 ? shadeC(RUST[1], .8) : RUST[(xx + y) % 4]);
  cyl(g, 'y', 3, 3, 3, 5, 6, RUST[2]);
  cyl(g, 'y', 3, 3, 3, 7, 7, (xx, y, zz) => SNOW[(xx + zz) % 3]);
  ch.add(g, F, x - .3, 0, z - .3, { seed });
}
// 말뚝 사이 늘어진 사슬
function chainBetween(ch, xa, xb, z, y0, seed, col = 0x4a3e36) {
  const n = Math.round((xb - xa) / F), g = grid(n + 1, 8, 1);
  for (let i = 0; i <= n; i++) { const t = i / n, y = Math.round(7 - Math.sin(Math.PI * t) * 6); g.set(i, y, 0, i % 2 ? col : shadeC(col, 1.3)); if (i % 2) g.set(i, y - 1, 0, col); }
  ch.add(g, F, xa, y0 - .7, z, { seed });
}
// 타이어 (부두 벽에 매달림)
function tire(ch, x, y, z, seed) {
  const g = grid(8, 8, 3);
  for (let xx = 0; xx < 8; xx++) for (let yy = 0; yy < 8; yy++) { const d = Math.hypot(xx + .5 - 4, yy + .5 - 4); if (d < 4 && d > 2) for (let zz = 0; zz < 3; zz++) g.set(xx, yy, zz, (xx + yy) % 3 ? 0x242424 : 0x30302e); }
  for (let xx = 2; xx < 6; xx++) if (h3(xx, 1, seed) < .6) g.set(xx, 7, 1, SNOW[xx % 3]);
  ch.add(g, F, x, y, z, { seed });
}
// 마른 나무 (가지를 선으로)
function deadTree(ch, x, y, z, seed, vs = F) {
  const H = randi(32, 52), g = grid(36, H + 6, 20), C = [0x4e4034, 0x5a4a3c, 0x443830];
  const branch = (x0, y0, z0, len, ang, lvl) => {
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len, z1 = z0 + rand(-3, 3);
    line(g, x0, y0, z0, x1, y1, z1, C[lvl % 3], lvl < 1 ? 1 : 0);
    if (lvl < 3) for (let i = 0; i < 2 + (lvl < 2 ? 1 : 0); i++) branch(x1, y1, z1, len * rand(.45, .7), ang + rand(-.9, .9), lvl + 1);
  };
  line(g, 18, 0, 10, 18 + randi(-2, 2), H * .55, 10, C[0], 1);
  for (let i = 0; i < 3; i++) branch(18, H * (.4 + i * .1), 10, H * .35, Math.PI / 2 + rand(-1, 1), 1);
  ch.add(g, vs, x - 18 * vs, y, z - 10 * vs, { seed });
}
// 덤불 (올리브·카키 덩어리)
function bush(ch, x, y, z, seed, rr = rand(4, 8), vs = F) {
  const n = Math.ceil(rr * 2) + 2, g = grid(n, Math.ceil(rr * 1.3) + 1, n), C = [0x5e6040, 0x6a6a46, 0x50543a, 0x767250, 0x847a54];
  for (let xx = 0; xx < n; xx++) for (let yy = 0; yy < g.h; yy++) for (let zz = 0; zz < n; zz++) {
    const d = Math.hypot(xx + .5 - n / 2, (yy + .5) * 1.4, zz + .5 - n / 2) + vnoise(xx * .5, zz * .5 + yy * .3, seed) * 2.4;
    if (d < rr && h3(xx, yy, zz + seed) < .85) g.set(xx, yy, zz, C[(h3(xx, yy, zz) * 5) | 0]);
  }
  ch.add(g, vs, x - n * vs / 2, y, z - n * vs / 2, { seed });
}
// 마른 풀 무더기 (키 큰 것)
function grassClump(ch, x, y, z, seed, rr = 4, tall = 6, vs = F) {
  const n = rr * 2 + 1, g = grid(n, tall + 2, n);
  for (let xx = 0; xx < n; xx++) for (let zz = 0; zz < n; zz++) {
    if (Math.hypot(xx - rr, zz - rr) > rr || h3(xx, zz, seed) < .45) continue;
    const hgt = randi(2, tall), c = pick(DRY);
    for (let yy = 0; yy < hgt; yy++) g.set(xx, yy, zz, yy === hgt - 1 ? shadeC(c, 1.12) : c);
  }
  ch.add(g, vs, x - rr * vs, y, z - rr * vs, { seed });
}
// 녹슨 폐차 (풀숲에 묻힘)
function rustCar(ch, x, z, seed) {
  const g = grid(42, 15, 19), base = pick([0x7a4a34, 0x6a5a48, 0x5e4a3a]);
  const rc = (xx, yy) => vnoise(xx * .25, yy * .3, seed) > .45 ? RUST[(xx + yy) % 4] : base;
  box(g, 0, 2, 1, 41, 7, 17, (xx, yy) => rc(xx, yy));
  box(g, 10, 8, 2, 30, 12, 16, (xx, yy, zz) => (zz === 2 || zz === 16 || xx === 10 || xx === 30) && yy < 12 && xx % 10 > 1 ? 0x1a1816 : rc(xx, yy));
  box(g, 11, 8, 3, 29, 11, 15, -1);
  for (const wx of [7, 34]) for (const zz of [0, 1, 17, 18]) for (let xx = wx - 3; xx <= wx + 3; xx++) for (let yy = 0; yy < 5; yy++) if (Math.hypot(xx - wx, yy - 2.5) < 3.3) g.set(xx, yy, zz, 0x2a2622);
  box(g, 0, 4, 2, 0, 5, 16, 0x3a3430); box(g, 41, 4, 2, 41, 5, 16, 0x3a3430);
  for (let xx = 0; xx < 42; xx++) for (const zz of [0, 18]) if (h3(xx, zz, seed) < .5) { const hh = randi(1, 6); for (let yy = 0; yy < hh; yy++) g.set(xx, yy, zz, pick(DRY)); }
  ch.add(g, F, x, 0, z, { seed });
}
// 넘어진 광고판 철골 (비스듬히 기울어짐)
function billboard(ch, x, z, seed) {
  const W = 50, H = 28, g = grid(W + 4, 48, 14), lean = 10;
  const P = (u, v) => [2 + u, 10 + v, Math.round(12 - v * lean / H)];   // 판의 (u,v) → 그리드 좌표 (뒤로 기울어짐)
  for (let u = 0; u < W; u++) for (let v = 0; v < H; v++) {
    const [a, b, c] = P(u, v);
    const frame = u % 10 === 0 || v % 7 === 0 || u === W - 1 || v === H - 1;
    const torn = vnoise(u * .1, v * .12, seed) > .52;
    if (frame) g.set(a, b, c, RUST[(u + v) % 4]);
    else if (!torn) g.set(a, b, c, vnoise(u * .2, v * .2, seed + 1) > .5 ? 0xb0aa98 : 0x9a8a76);
  }
  for (const u of [12, 38]) { const [a, b, c] = P(u, 0); line(g, a, 0, c, a, b, c, RUST[0], 1); line(g, a, 0, c + 1, a + 4, b - 2, c - 3, RUST[2]); }
  for (let u = 0; u < W; u += 3) if (h3(u, 2, seed) < .4) { const [a, b, c] = P(u, H - 1 - randi(0, 6)); for (let k = 0; k < randi(4, 14); k++) g.set(a, b - k, c + 1, VINE[k % 4]); }
  ch.add(g, F, x, 0, z, { seed });
}
// 저지 방벽 (배경용, z 방향 1m 폭, x로 2m)
function jersey(ch, x, z, seed, stripes = true) {
  const g = grid(20, 8, 7);
  for (let xx = 0; xx < 20; xx++) for (let y = 0; y < 8; y++) for (let zz = 0; zz < 7; zz++) {
    const half = y < 2 ? 3.5 : 3.5 - (y - 1) * .4; if (Math.abs(zz + .5 - 3.5) > half) continue;
    let c = CONC[(vnoise(xx * .3, y * .3, seed) * 3.99) | 0];
    if (stripes && y >= 3 && (xx + y) % 10 < 5) c = mixC(c, 0x9a4a3a, .6);
    g.set(xx, y, zz, y < 2 ? shadeC(c, .8) : c);
  }
  ch.add(g, F, x, 0, z, { seed });
}

// 화면 맨 앞(z 5.5~6.5) 잔해: 깨진 콘크리트 덩어리 + 휘어진 철근 (길을 가리지 않게 0.9m 이하)
function frontRubble(ch, x, z, key, seed) {
  const w = randi(6, 12), d = randi(5, 8), hgt = randi(3, 6), g = grid(w + 4, 9, d + 2);
  for (let xx = 0; xx < w; xx++) for (let zz = 0; zz < d; zz++) {
    const top = Math.floor(hgt - Math.abs(xx - w / 2) * .3 - vnoise(xx * .5, zz * .5, seed) * 2.5);
    for (let y = 0; y < top; y++) g.set(xx + 2, y, zz + 1, y === top - 1 ? CONC[(xx + zz) % 4] : shadeC(CONC[(xx + y) % 4], .85));
  }
  if (key !== 'snow') for (let i = 0; i < randi(1, 3); i++) { const a = randi(2, w + 1); line(g, a, 1, randi(1, d), a + randi(-2, 2), 8, randi(0, d + 1), RUST[i % 4]); }
  if (key === 'snow') for (let xx = 0; xx < g.w; xx++) for (let zz = 0; zz < g.d; zz++) { let y = 8; while (y >= 0 && g.get(xx, y, zz) < 0) y--; if (y >= 0) g.set(xx, y, zz, SNOW[(xx + zz) % 3]); }
  if (key === 'desert') for (let xx = 0; xx < g.w; xx++) for (let zz = 0; zz < g.d; zz++) if (g.get(xx, 0, zz) < 0 && h3(xx, zz, seed) < .6) g.set(xx, 0, zz, SAND[(xx + zz) % 3]);
  ch.add(g, F, x, 0, z, { seed });
}
// 항구 앞 가장자리: 말뚝과 감긴 밧줄
function frontBollard(ch, x, z, seed) {
  bollard(ch, x, z, seed);
  const g = grid(10, 3, 8);
  for (let xx = 0; xx < 10; xx++) for (let zz = 0; zz < 8; zz++) { const d = Math.hypot(xx + .5 - 5, zz + .5 - 4); if (d < 4.2 && d > 1.6) for (let y = 0; y < (d < 3 ? 3 : 2); y++) g.set(xx, y, zz, (xx + y) % 3 ? 0xa08a62 : 0x8a7652); }
  ch.add(g, F, x + .25, 0, z - .2, { seed });
}

// ================================================================ 원경 (0.25~0.4m, 그림자 안 드리움)
// 철탑 (송전탑): 다리 4개 + 가로 버팀 + 전선
function pylon(ch, x, y, z, seed) {
  const H = 64, g = grid(24, H + 4, 24), C = 0x4a4844;
  for (let k = 0; k < H; k++) {
    const t = k / H, half = 11 * (1 - t) + 2 * t;
    const a = Math.round(12 - half), b = Math.round(12 + half - 1);
    for (const [px, pz] of [[a, a], [b, a], [a, b], [b, b]]) g.set(px, k, pz, C);
    if (k % 8 === 0) for (let i = a; i <= b; i++) { g.set(i, k, a, C); g.set(i, k, b, C); g.set(a, k, i, C); g.set(b, k, i, C); }
    if (k % 8 < 8) { const i = a + Math.round((b - a) * ((k % 8) / 8)); g.set(i, k, a, C); g.set(i, k, b, C); }
  }
  for (const arm of [44, 54]) for (let i = 0; i < 24; i++) g.set(i, arm, 12, C);
  ch.add(g, .25, x - 3, y, z - 3, { seed, jitter: .05 });
}
// 무너진 고가도로: 교각 + 상판 (한 칸은 꺾여 내려앉음)
function overpass(ch, x0, x1, y, z, seed) {
  const s = .4, n = Math.round((x1 - x0) / s), g = grid(n, 26, 14), drop = randi(Math.floor(n * .3), Math.floor(n * .6)), dw = randi(14, 22);
  for (let i = 0; i < n; i++) {
    let deck = 18;
    if (i >= drop && i < drop + dw) deck = Math.round(18 - (i - drop) * 18 / dw);   // 내려앉은 상판
    for (let zz = 1; zz < 13; zz++) for (let k = 0; k < 2; k++) g.set(i, deck + k, zz, k ? CONC[(i + zz) % 4] : shadeC(CONC[1], .7));
    g.set(i, deck + 2, 1, CONC[2]); g.set(i, deck + 2, 12, CONC[2]);
    if (i % 25 === 5 && !(i >= drop && i < drop + dw)) for (let yy = 0; yy < 18; yy++) for (let zz = 4; zz < 10; zz++) g.set(i, yy, zz, CONC[3]), g.set(i + 1, yy, zz, CONC[3]), g.set(i + 2, yy, zz, shadeC(CONC[3], .8));
  }
  ch.add(g, s, x0, y, z, { seed, jitter: .06 });
}
// 굴뚝·저장탑 (사막)
function smokestack(ch, x, y, z, seed, r = 4, H = 60, bands = true) {
  const g = grid(r * 2 + 2, H, r * 2 + 2);
  cyl(g, 'y', r + 1, r + 1, r, 0, H - 1, (xx, yy, zz) => {
    let c = bands && yy > H * .55 && (yy >> 3) % 2 ? 0xa86a52 : 0xb0a490;
    if (vnoise(xx * .3 + yy * .1, zz * .3, seed) > .55) c = mixC(c, RUST[(xx + yy) % 4], .7);
    if (yy % 10 === 0) c = shadeC(c, .75);
    return c;
  });
  ch.add(g, .3, x, y, z, { seed, jitter: .06 });
}
// 격자 크레인 (사막·항구): 탑 + 운전실 + 지브
function crane(ch, x, y, z, seed, key) {
  const g = grid(70, 72, 14), C = key === 'snow' ? 0x6a4030 : 0x7a5032, C2 = shadeC(C, .75);
  for (const [lx, lz] of [[2, 2], [11, 2], [2, 11], [11, 11]]) for (let k = 0; k < 52; k++) g.set(lx, k, lz, C);
  for (let k = 0; k < 52; k += 4) { for (let i = 2; i <= 11; i++) { g.set(i, k, 2, C2); g.set(i, k, 11, C2); g.set(2, k, i, C2); g.set(11, k, i, C2); } for (let i = 0; i < 4; i++) { g.set(2 + Math.round(i * 2.3), k + i, 2, C2); g.set(2 + Math.round(i * 2.3), k + i, 11, C2); } }
  box(g, 0, 52, 0, 13, 59, 13, (xx, yy) => yy === 56 && xx % 3 ? 0x2a2a28 : shadeC(C, 1.05));   // 운전실
  for (let i = 0; i < 56; i++) { const yy = 58 + Math.round(i * .18); g.set(13 + i, yy, 5, C); g.set(13 + i, yy, 8, C); if (i % 4 === 0) for (let zz = 5; zz <= 8; zz++) g.set(13 + i, yy - 1, zz, C2); }
  for (let yy = 30; yy < 66; yy++) g.set(60, yy, 6, 0x2e2a26);   // 늘어진 줄
  box(g, 58, 26, 5, 62, 29, 8, 0x4a3a2e);
  ch.add(g, .3, x, y, z, { seed, jitter: .06 });
}
// 반쯤 가라앉은 배 (항구): 기운 선체·선교·돛대, 녹과 고드름
function sunkenShip(ch, x, z, seed) {
  const s = .3, L = 80, g = grid(L, 40, 24), tilt = .22;
  for (let i = 0; i < L; i++) {
    const deck = Math.round(14 - i * tilt), w = i > L - 14 ? Math.round(10 * (L - i) / 14) + 1 : 10;
    for (let yy = 0; yy <= deck; yy++) for (let zz = 12 - w; zz < 12 + w; zz++) {
      const shell = zz === 12 - w || zz === 11 + w || yy === deck;
      if (!shell) continue;
      let c = yy === deck ? 0x4a4440 : RUST[(i + yy) % 4];
      if (vnoise(i * .2, yy * .3, seed) > .62) c = 0x3a3634;
      if (yy === deck && h3(i, zz, seed) < .5) c = SNOW[(i + zz) % 3];
      g.set(i, yy, zz, c);
    }
    if (h3(i, 7, seed) < .35) for (let k = 1; k <= randi(1, 3); k++) g.set(i, deck - k, 12 + w, 0xb0c2ca);   // 고드름
  }
  box(g, 10, 14 - 3, 6, 24, 14 + 8, 17, (xx, yy, zz) => yy % 4 === 2 && xx % 3 && (zz === 17 || zz === 6) ? 0x1e1e1e : yy >= 14 + 7 ? SNOW[xx % 3] : mixC(0x9a9690, RUST[1], vnoise(xx * .3, yy * .3, seed) > .55 ? .7 : .1));
  line(g, 18, 22, 12, 21, 38, 12, 0x4a3a30);
  line(g, 14, 32, 12, 26, 32, 12, 0x4a3a30);
  ch.add(g, s, x, -2.2, z, { seed, jitter: .06 });
}

// ================================================================ 바닥 무늬 (걷는 길, 표면 바로 위 얇은 판)
// 핏자국은 표면 바로 아래를 읽으므로 0.02m 이하로 얇게
function groundDecals(ch, plan, isPit) {
  const { key, L, seed } = plan, top = FACES[2];
  const q = (x, z, w, d, c, y = .006) => { if (isPit(x + w / 2, z + d / 2)) return; ch.mb(x, x + w, z).quad(top, x, y - 1, z, w, 1, d, rgb(c)); };
  const E = BIOME_ENV[key];
  // 1) 판 이음 줄 (콘크리트 판)
  for (let x = -12; x < L + 14; x += E.slab) for (let z = -4; z < 5; z += .25) if (h3(x * 7, z * 9, seed) < .85) q(x, z, .06, .25, E.joint);
  for (let x = -12; x < L + 14; x += .5) if (h3(x * 3, 0, seed) < .8) q(x, .45, .5, .05, E.joint);
  // 2) 바랜 차선
  if (E.lane) for (let x = -12; x < L + 14; x += 4) if (h3(x, 2, seed) < .8) q(x, 1.5, 2, .12, E.lane, .008);
  // 3) 얼룩·모래·눈 패치: 0.25m 격자, 노이즈로 덩어리지게
  const c = .125;   // 얼룩 격자 (작을수록 가장자리가 부드러움). 같은 색이 x로 이어지면 한 장으로 합침
  for (let z = -5; z < 7.5; z += c) {
    let run = null;
    const flush = () => { if (run) q(run.x0, z, run.x1 - run.x0, c, run.col, run.y); run = null; };
    for (let x = -12; x < L + 14; x += c) {
      const n = vnoise(x * E.patchF, z * E.patchF * 1.3, seed + 3) * .8 + vnoise(x * 1.6, z * 1.6, seed + 4) * .2 + (h3(x * 8, z * 8, seed) - .5) * .12;
      const edge = z < -4 ? E.edgeBoost * Math.min(1, -4 - z + .3) : z > 4.2 ? E.edgeBoost * Math.min(1, (z - 4.2) * .8) : 0;
      let col = null, y = .01;
      if (n + edge > E.patchT) col = E.patch[(vnoise(x * 3, z * 3, 5) * E.patch.length) | 0];
      else if (E.patch2 && vnoise(x * .3, z * .4, seed + 9) * .85 + vnoise(x * 2, z * 2, seed + 2) * .15 > E.patch2T) { col = E.patch2[(vnoise(x * 3, z * 3, 6) * E.patch2.length) | 0]; y = .009; }
      if (run && (col !== run.col || run.x1 - run.x0 >= 2 || isPit(x, z + c / 2))) flush();
      if (col !== null && !isPit(x + c / 2, z + c / 2)) { if (!run) run = { x0: x, x1: x + c, col, y }; else run.x1 = x + c; }
    }
    flush();
  }
  // 4) 균열 (지그재그)
  for (let n = 0; n < L * .3; n++) {
    let x = rand(-10, L + 12), z = rand(-4, 4.6);
    for (let i = 0; i < randi(5, 14); i++) { const nx = x + rand(.12, .35), nz = Math.max(-4.5, Math.min(5, z + rand(-.15, .15))); q(Math.min(x, nx), Math.min(z, nz), Math.abs(nx - x) + .04, .05, E.crack, .012); x = nx; z = nz; }
  }
}
// 길 위 작은 풀 포기 (균열 사이) / 모래 둔덕 / 눈 더미: 0.1m 복셀
function groundBits(ch, plan, isPit) {
  const { key, L } = plan;
  for (let n = 0; n < L * (key === 'plains' ? 2.6 : 1.2); n++) {
    const x = rand(-12, L + 14), edge = Math.random() < .55, z = edge ? (Math.random() < .5 ? rand(-5, -4.2) : rand(4.7, 7)) : rand(-4, 4.6);
    if (isPit(x, z)) continue;
    if (key === 'plains') grassClump(ch, x, 0, z, n, edge ? randi(2, 4) : 1, edge ? randi(4, 7) : randi(1, 3));
    else if (key === 'desert') {
      if (!edge) { if (Math.random() < .5) grassClump(ch, x, 0, z, n, 1, 3); continue; }
      const g = grid(randi(6, 14), 3, randi(4, 9)); for (let xx = 0; xx < g.w; xx++) for (let zz = 0; zz < g.d; zz++) { const d = Math.hypot((xx + .5) / g.w - .5, (zz + .5) / g.d - .5) * 2; const hgt = Math.floor((1 - d) * 3.4); for (let y = 0; y < hgt; y++) g.set(xx, y, zz, SAND[(xx + zz + y) % 3]); }
      ch.add(g, F, x, 0, z, { seed: n });
    } else {
      if (!edge) continue;
      const g = grid(randi(5, 12), 3, randi(4, 8)); for (let xx = 0; xx < g.w; xx++) for (let zz = 0; zz < g.d; zz++) { const d = Math.hypot((xx + .5) / g.w - .5, (zz + .5) / g.d - .5) * 2; const hgt = Math.floor((1 - d) * 3.2); for (let y = 0; y < hgt; y++) g.set(xx, y, zz, SNOW[(xx + zz + y) % 3]); }
      ch.add(g, F, x, 0, z, { seed: n });
    }
  }
}

// ================================================================ 구획별 배경 채우기
function fillPlains(near, far, plan) {
  const { lots, L, hillH } = plan, groundH = hillH;
  for (const lot of lots) {
    const s = lot.seed;
    if (lot.type === 'apt') apartment(near, lot, false);
    else if (lot.type === 'lowruin') apartment(near, lot, true);
    else {
      fenceRun(near, lot.x0, lot.x1, -6.6, 'plains', s);
      const r = h3(s, 0, 0);
      if (r < .35) rustCar(near, lot.x0 + rand(1, lot.x1 - lot.x0 - 5), rand(-9.5, -8), s);
      else if (r < .6) billboard(near, lot.x0 + rand(0, lot.x1 - lot.x0 - 6), rand(-11, -9.5), s);
      if (h3(s, 1, 0) < .55) jersey(near, lot.x0 + rand(.5, 3), -6.0 + rand(-.2, .2), s, true);
      for (let i = 0; i < 3; i++) bush(near, rand(lot.x0, lot.x1), 0, rand(-11, -7.5), s + i);
      if (h3(s, 2, 0) < .7) deadTree(near, rand(lot.x0 + 1, lot.x1 - 1), 0, rand(-12, -9), s);
      for (let i = 0; i < 8; i++) grassClump(near, rand(lot.x0, lot.x1), 0, rand(-11, -6.9), s + i, randi(3, 5), randi(5, 9));
    }
    for (let i = 0; i < 5; i++) grassClump(near, rand(lot.x0, lot.x1), 0, rand(-6.1, -5.1), s + 40 + i, randi(2, 4), randi(4, 8));
  }
  // 언덕: 덤불·마른 나무·작은 폐허
  for (let n = 0; n < L * .7; n++) { const x = rand(-14, L + 16), z = rand(-22, -11.5); grassClump(far, x, groundH(x, z), z, n, randi(2, 4), randi(3, 5), B); }
  for (let x = -14; x < L + 16; x += rand(2, 5)) { const z = rand(-24, -12), y = groundH(x, z); if (Math.random() < .2) deadTree(far, x, y, z, x | 0, B * .75); else bush(far, x, y, z, x | 0, rand(3, 6), B); }
  for (let x = rand(-10, 10); x < L + 16; x += rand(24, 36)) { const z = rand(-24, -19); pylon(far, x, groundH(x, z), z, x | 0); }
  for (let x = rand(0, 20); x < L + 10; x += rand(40, 60)) overpass(far, x, x + rand(24, 34), Math.max(0, groundH(x + 12, -26) - 1), -30, x | 0);
}
function fillDesert(near, far, plan) {
  const { lots, L } = plan;
  for (const lot of lots) {
    const s = lot.seed;
    if (lot.type === 'warehouse') { warehouse(near, lot, 'desert'); continue; }
    fenceRun(near, lot.x0, lot.x1, -6.7, 'desert', s);
    // 배관 선반: 굵은 관 2줄 + 받침 + 녹슨 통로
    if (h3(s, 3, 0) < .6) {
      const n = Math.round((lot.x1 - lot.x0) / B), g = grid(n, 24, 10);
      cyl(g, 'x', 3, 13, 2.6, 0, n - 1, (xx, y) => xx % 20 < 2 ? shadeC(RUST[2], .8) : vnoise(xx * .1, y * .3, s) > .5 ? RUST[(xx >> 2) % 4] : 0x7a6a52);
      cyl(g, 'x', 7, 15, 1.6, 0, n - 1, (xx) => RUST[(xx >> 3) % 4]);
      for (let xx = 2; xx < n; xx += 20) for (let y = 0; y < 18; y++) { g.set(xx, y, 0, 0x4a3e34); g.set(xx, y, 9, 0x4a3e34); if (y % 6 === 0) for (let zz = 0; zz < 10; zz++) g.set(xx, y, zz, 0x4a3e34); }
      for (let xx = 0; xx < n; xx++) for (let zz = 0; zz < 10; zz++) { g.set(xx, 18, zz, (xx + zz) % 2 ? 0x3a342e : 0x4e463c); if (zz === 0 || zz === 9) { g.set(xx, 22, zz, 0x8a7a44); if (xx % 5 === 0) for (let y = 19; y < 22; y++) g.set(xx, y, zz, 0x8a7a44); } }
      near.add(g, B, lot.x0, 0, -10.5, { seed: s });
    }
    if (h3(s, 4, 0) < .5) container(near, lot.x0 + rand(0, Math.max(0, lot.x1 - lot.x0 - 6)), 0, -12.6, 'desert', s);
    for (let i = 0; i < 2; i++) drumCluster(near, rand(lot.x0, lot.x1 - 2), rand(-8.2, -7.2), 'desert', s + i * 9);
    for (let i = 0; i < 4; i++) grassClump(near, rand(lot.x0, lot.x1), 0, rand(-9, -6), s + i, 2, 4);
  }
  for (let x = rand(-8, 6); x < L + 16; x += rand(14, 24)) smokestack(far, x, 0, rand(-21, -16), x | 0, randi(3, 5), randi(50, 70), Math.random() < .7);
  for (let x = rand(0, 14); x < L + 16; x += rand(30, 45)) smokestack(far, x, 0, rand(-17, -15), x | 0, 7, 26, false);   // 저장탑
  for (let x = rand(10, 30); x < L + 16; x += rand(45, 65)) crane(far, x, 0, rand(-22, -18), x | 0, 'desert');
  // 컨베이어: 땅에서 비스듬히 올라가는 철골 통로
  for (let x = rand(5, 25); x < L; x += rand(40, 60)) {
    const n = 60, g = grid(n, 34, 6);
    for (let i = 0; i < n; i++) { const y = Math.round(i * .5); for (let zz = 0; zz < 6; zz++) g.set(i, y + 2, zz, (i + zz) % 3 ? 0x5a4a3a : 0x3a3430); g.set(i, y + 4, 0, RUST[i % 4]); g.set(i, y + 4, 5, RUST[i % 4]); if (i % 10 === 0) for (let yy = 0; yy < y + 2; yy++) { g.set(i, yy, 1, 0x4a3e34); g.set(i, yy, 4, 0x4a3e34); } }
    far.add(g, .3, x, 0, -14, { seed: x | 0 });
  }
}
function fillSnow(near, far, plan) {
  const { lots, L } = plan;
  for (const lot of lots) {
    const s = lot.seed;
    if (lot.type === 'warehouse') {
      warehouse(near, lot, 'snow');
      for (let i = 0; i < 2; i++) pallets(near, lot.x0 + rand(.5, lot.x1 - lot.x0 - 2), -6.15 - rand(0, .3), 'snow', s + i);
    } else if (lot.type === 'containers') {
      // 컨테이너 더미: 1~3단, 층마다 조금씩 어긋나게
      for (let cx = lot.x0 + rand(0, 1); cx + 6 <= lot.x1; cx += 6.2) {
        const n = randi(1, 3);
        for (let k = 0; k < n; k++) container(near, cx + rand(-.3, .3) * (k > 0), k * 2.8, -6.6 - 2.4 - (k > 0 && h3(cx | 0, k, s) < .4 ? 2.6 : 0), 'snow', s + k + (cx | 0));
        if (h3(cx | 0, 9, s) < .6) container(near, cx + rand(-.5, .5), 0, -11.6, 'snow', s + 50 + (cx | 0));
      }
      pallets(near, lot.x0 + rand(0, 2), -6.2, 'snow', s); drumCluster(near, lot.x1 - rand(2, 3.5), -6.1, 'snow', s + 3);
    } else {
      // 열린 부두: 말뚝 + 사슬, 벽면 타이어
      const xs = []; for (let x = lot.x0 + rand(.5, 1.5); x < lot.x1 - .5; x += rand(2.4, 3.4)) { xs.push(x); bollard(near, x, -6.6, s + xs.length); }
      for (let i = 0; i + 1 < xs.length; i++) if (h3(i, 1, s) < .8) chainBetween(near, xs[i] + .2, xs[i + 1] - .2, -6.6, .45, s + i);
      for (let x = lot.x0 + 1; x < lot.x1 - 1; x += rand(2.5, 4)) tire(near, x, -.8, -7.25, s + (x | 0));
    }
  }
  // 물 (부두 뒤 전체: 블록이 없는 곳에 보임) + 떠다니는 얼음
  const top = FACES[2];
  for (let x = -14; x < L + 16; x += 4) {
    const mb = far.mb(x, x + 4, -40);
    mb.quad(top, x, BIOME_ENV.snow.waterY - 1, -40, 4, 1, 33, rgb(0x263234));
    for (let i = 0; i < 6; i++) { const w = rand(.4, 2.2), d = rand(.3, 1.4), px = x + rand(0, 4), pz = rand(-24, -7.6); for (const f of FACES) if (f.n[1] !== -1) mb.quad(f, px, BIOME_ENV.snow.waterY - .04, pz, w, .1, d, rgb(pick([0xa8b4b8, 0x98a6ac, 0xb8c2c4]))); }
  }
  const quays = lots.filter(l => l.type === 'quay');
  for (let i = 0; i < quays.length; i += 3) sunkenShip(far, quays[i].x0 - 4, -24, quays[i].seed);
  for (let x = rand(5, 20); x < L + 10; x += rand(35, 50)) crane(far, x, 0, rand(-17, -15), x | 0, 'snow');
}

// ================================================================ 원경 언덕 (0.5m 격자, 0.25m 높이 계단)
function hills(far, plan) {
  const { key, L, seed, hillH, hillZ } = plan, S2 = .5, top = FACES[2];
  const C = { plains: [0x8a8060, 0x7e7656, 0x948a66, 0x7a744e], desert: [0xb09a72, 0xa89268, 0xb8a27a, 0xa08a62], snow: [0xc4c8ca, 0xb4b8ba, 0xd0d4d5, 0x9ea2a4] }[key];
  const SIDE = { plains: 0x6e6648, desert: 0x9a845e, snow: 0x8e9294 }[key];
  for (let x = -14; x < L + 16; x += S2) for (let z = -44; z < hillZ; z += S2) {
    const h = hillH(x, z); if (h <= 0) continue;
    const mb = far.mb(x, x + S2, z);
    const n = vnoise(x * .4, z * .4, seed + 2), c = rgb(C[(n * 3.99) | 0]);
    mb.quad(top, x, h - 1, z, S2, 1, S2, c);
    const sc = rgb(shadeC(SIDE, .9 + n * .2));
    const hz = hillH(x, z + S2), hl = hillH(x - S2, z), hr = hillH(x + S2, z);
    if (hz < h) mb.quad(FACES[4], x, hz, z, S2, h - hz, S2, sc);
    if (hl < h) mb.quad(FACES[1], x, hl, z, S2, h - hl, S2, sc);
    if (hr < h) mb.quad(FACES[0], x, hr, z, S2, h - hr, S2, sc);
  }
}

// ================================================================ 안개막·입자
function fogCards(r, L, layers) {
  const out = [];
  for (const [z, ls] of layers) for (const [y0, h, a] of ls) {
    const mb = (new Chunks()).mb(0, 1, 0);
    mb.quad(FACES[4], -14, 0, z, L + 30, h, 0.001, [1, 1, 1]);
    out.push({ mesh: mb.build(r), y: y0, a });
  }
  return out;
}

// 진입점: 지형을 만든 뒤 호출. 반환: { near, far, ground (청크 목록), fogCards }
export function buildBiome(r, plan, isPit) {
  const near = new Chunks(10), far = new Chunks(16), ground = new Chunks(12);
  hills(far, plan);
  if (plan.key === 'plains') fillPlains(near, far, plan);
  else if (plan.key === 'desert') fillDesert(near, far, plan);
  else fillSnow(near, far, plan);
  for (let x = -12 + rand(0, 4); x < plan.L + 14; x += rand(3.5, 7)) {   // 화면 맨 앞 테두리
    const z = rand(5.5, 6.2);
    if (isPit(x, z) || isPit(x + 1, z)) continue;
    if (plan.key === 'snow' && Math.random() < .6) frontBollard(near, x, z + .3, x | 0); else frontRubble(near, x, z, plan.key, x | 0);
  }
  groundDecals(ground, plan, isPit);
  groundBits(ground, plan, isPit);
  const farList = far.build(r); for (const c of farList) c.mesh.noShadow = true;
  return { near: near.build(r), far: farList, ground: ground.build(r), fogCards: fogCards(r, plan.L, BIOME_ENV[plan.key].fog) };
}
