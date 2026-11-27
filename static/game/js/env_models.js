// 배경 소품 복셀 모델 (고해상도, 0.045m 복셀): 폐허 뉴욕 거리 장식과 주차된 차
// models.js 의 BUILDERS 에 덮어써서 등록됨 (Object.assign). 크기·원점은 예전 모델(0.09m)과 같게 맞춤
//  → 차의 판정 칸(4×2m, 높이 1.3), 쓰레기통 칸(2×1m), 가로등 기울기 등은 그대로
import { VoxGrid, MeshBuilder, hash3 } from './voxel.js';
import { box, cyl, line, vnoise, mixC, shadeC, rgb, emitGrid } from './env.js';

const S = 0.045;
const RUST = [0x6e4028, 0x7a4a2e, 0x5e3622, 0x865436];
// 모델 하나: w,h,d 칸, origin(칸 단위), paint(g). coarse: 파편용 복셀을 2칸씩 묶어 줄임 (차 폭발 파편 수 유지)
function model(r, w, h, d, origin, paint, coarse = 2) {
  const g = new VoxGrid(w, h, d);
  paint(g);
  // 메시: 카메라에서 안 보이는 뒷면·아랫면은 뺌 (env.js emitGrid)
  const mb = new MeshBuilder();
  emitGrid(mb, g, S, -origin[0] * S, -origin[1] * S, -origin[2] * S, { jitter: 0.12 });
  const out = { mesh: mb.build(r) };
  const v = [], k = coarse;
  for (let z = 0; z < d; z += k) for (let y = 0; y < h; y += k) for (let x = 0; x < w; x += k) {
    let c = -1;
    for (let i = 0; i < k * k * k && c < 0; i++) c = g.get(x + (i % k), y + ((i / k | 0) % k), z + (i / (k * k) | 0));
    if (c < 0) continue;
    const exposed = [[k, 0, 0], [-1, 0, 0], [0, k, 0], [0, -1, 0], [0, 0, k], [0, 0, -1]].some(([a, b, e]) => g.get(x + a, y + b, z + e) < 0);
    if (!exposed) continue;
    const [cr, cg, cb] = rgb(c);
    v.push((x + k / 2 - origin[0]) * S, (y + k / 2 - origin[1]) * S, (z + k / 2 - origin[2]) * S, cr, cg, cb);
  }
  out.voxels = new Float32Array(v);   // 파편용 복셀 (coarse칸씩 묶음)
  return out;
}
const n2 = (x, y, s) => vnoise(x, y, s);

// ---------------------------------------------------------------- 승용차 (길이 3.96 × 높이 1.35 × 폭 1.8m, 앞 = +x)
const CAR = [0xc8a030, 0xb8902a, 0x6a6660, 0x7a3a2c, 0x3a4652, 0x4a5240, 0x8a7a62];
function paintCar(g, i, wreck) {
  const W = 88, D = 40, base = wreck ? 0x2a2420 : CAR[i], seed = i * 7 + 3, taxi = !wreck && i <= 1;
  const GL = 0x1e2630, GL2 = 0x3a4a56;
  const wheels = [16, 71];
  const arch = (x, y) => wheels.some(c => Math.hypot(x + .5 - c, y + .5 - 7) < 9.2);
  const col = (x, y, z) => {
    let c = base;
    if (wreck) { if (n2(x * .15, y * .2 + z * .1, seed) > .55) c = 0x1a1614; else if (n2(x * .2, z * .2, seed + 2) > .7) c = 0x5a3a28; return c; }
    if (n2(x * .12, y * .18 + z * .05, seed) > .62) c = mixC(c, RUST[(x + y) % 4], .8);   // 녹
    if (y < 9) c = shadeC(c, .8);
    return c;
  };
  // 아래 몸통 (바퀴집 파냄)
  box(g, 1, 5, 2, 86, 17, 37, (x, y, z) => (z <= 3 || z >= 36) && arch(x, y) ? -2 : col(x, y, z));
  // 둥근 모서리
  for (const x of [1, 86]) for (const z of [2, 37]) for (let y = 5; y < 18; y++) g.set(x, y, z, -1);
  for (let x = 1; x < 87; x++) for (const z of [2, 37]) g.set(x, 17, z, -1);
  // 범퍼
  box(g, 0, 6, 3, 0, 9, 36, 0x3a3836); box(g, 87, 6, 3, 87, 9, 36, 0x3a3836);
  // 실내 (차체 위, 창 안쪽)
  const cabin = (x, y) => { const t = y - 18; return x >= 24 + t * .6 && x <= 60 - t * .75; };
  for (let y = 18; y < 30; y++) for (let x = 20; x < 64; x++) for (let z = 5; z <= 34; z++) {
    if (!cabin(x, y)) continue;
    const shell = z === 5 || z === 34 || y === 29 || !cabin(x - 1, y) || !cabin(x + 1, y);
    if (!shell) { if (y === 18) g.set(x, y, z, 0x1a1816); continue; }
    let c = col(x, y, z);
    const win = y >= 20 && y <= 27 && !(x >= 41 && x <= 42);
    if (win && (z === 5 || z === 34) && cabin(x - 2, y) && cabin(x + 2, y)) c = wreck ? -1 : (hash3(x, y, z + i) < .12 ? GL2 : GL);
    if (win && (z > 6 && z < 33) && y < 28 && (!cabin(x - 1, y) || !cabin(x + 1, y))) c = wreck ? -1 : (hash3(x, y, z) < .1 ? GL2 : GL);   // 앞·뒤 유리
    if (wreck && y === 29 && n2(x * .2, z * .2, seed + 5) > .5) c = -1;   // 내려앉은 지붕
    if (c !== -1) g.set(x, y, z, c); else g.set(x, y, z, -1);
  }
  // 문 이음·손잡이
  for (const x of [41, 61]) for (let y = 7; y < 17; y++) for (const z of [3, 36]) if (g.get(x, y, z) >= 0) g.set(x, y, z, shadeC(base, .6));
  for (const z of [3, 36]) { g.set(36, 14, z, 0x8a8478); g.set(56, 14, z, 0x8a8478); }
  // 등
  if (!wreck) { box(g, 87, 12, 4, 87, 14, 8, 0xd8c890); box(g, 87, 12, 31, 87, 14, 35, 0xd8c890); box(g, 0, 12, 4, 0, 14, 7, 0x8a2420); box(g, 0, 12, 32, 0, 14, 35, 0x8a2420); box(g, 87, 10, 12, 87, 11, 27, 0x2a2826); }
  // 바퀴: 타이어 + 휠
  for (const wx of wheels) for (const [z0, z1] of [[0, 5], [34, 39]]) for (let x = wx - 8; x <= wx + 8; x++) for (let y = 0; y < 15; y++) {
    const d = Math.hypot(x + .5 - wx, y + .5 - 7);
    if (d > 7.2) continue;
    for (let z = z0; z <= z1; z++) {
      const outer = z === z0 && z0 === 0 || z === z1 && z1 === 39;
      g.set(x, y, z, wreck ? (d < 5 ? 0x3a3430 : -1) : d < 3.6 && outer ? 0x8a8a84 : d < 4.2 && outer ? 0x3a3a38 : (x + y) % 5 ? 0x1c1c1c : 0x262626);
    }
  }
  if (taxi) {   // 택시: 체크 띠 + 지붕 표시등
    for (let x = 4; x < 84; x++) for (const z of [2, 37]) for (const y of [12, 13]) if (g.get(x, y, z) >= 0 || g.get(x, y, z === 2 ? 3 : 36) >= 0) g.set(x, y, z === 2 ? 3 : 36, ((x >> 1) + y) % 2 ? 0x1a1a1a : 0xd0c8b0);
    box(g, 38, 30, 16, 48, 32, 23, 0xd8c8a0); box(g, 39, 31, 15, 47, 31, 15, 0x2a2826);
  }
  if (wreck) for (let n = 0; n < 40; n++) { const x = 4 + (hash3(n, 1, 2) * 80 | 0), z = 4 + (hash3(n, 3, 4) * 32 | 0); if (g.get(x, 18, z) >= 0) g.set(x, 18, z, n % 3 ? 0x4a2210 : 0x6a3414); }   // 식은 불씨 자국
}

export const ENV_BUILDERS = {
  carwreck: r => model(r, 88, 33, 40, [0, 0, 0], g => paintCar(g, 0, true)),
  // ---------------- 폐허 뉴욕 거리 장식
  // 기울어진 가로등: 팔각 기둥, 굽은 팔, 꺼진 등 (높이 6.3m)
  streetlamp: r => model(r, 28, 142, 8, [4, 0, 4], g => {
    const C = 0x2e3430, C2 = 0x3a4236;
    box(g, 1, 0, 1, 6, 6, 6, C); box(g, 2, 7, 2, 5, 10, 5, C);
    for (let y = 11; y < 128; y++) box(g, 3, y, 3, 4, y, 4, (x, yy) => (yy % 24 === 0 ? C : n2(x, yy * .1, 3) > .7 ? RUST[1] : C2));
    for (let x = 4; x < 22; x++) { const y = 126 + Math.round(Math.sqrt(Math.max(0, x - 4)) * 2.2); g.set(x, y, 3, C2); g.set(x, y, 4, C2); g.set(x, y - 1, 4, C2); }
    box(g, 18, 132, 1, 27, 134, 6, C); box(g, 19, 130, 2, 26, 131, 5, 0x8a8470); box(g, 20, 129, 3, 25, 129, 4, 0x6a665a);
  }, 1),
  // 검은 쓰레기봉투 더미 (묶은 매듭, 번들거림)
  trashbags: r => model(r, 24, 15, 20, [12, 0, 10], g => {
    const bags = [[8, 8, 6.4, 0x1c1c1e], [16, 12, 6, 0x222224], [12, 4, 5.2, 0x2a2e26], [19, 4, 4.4, 0x1c1c1e]];
    for (const [cx, cz, rr, c] of bags) for (let x = 0; x < 24; x++) for (let y = 0; y < 15; y++) for (let z = 0; z < 20; z++) {
      const d = Math.hypot(x + .5 - cx, (y + .5) * 1.25, z + .5 - cz) + n2(x * .3, z * .3 + y * .2, cx) * 1.6;
      if (d < rr) g.set(x, y, z, hash3(x, y, z) < .08 ? 0x3e3e40 : (y > rr * .6 ? shadeC(c, 1.25) : c));
    }
    for (const [cx, cz, rr] of bags) { const ty = Math.min(14, Math.floor(rr * .8)); g.set(Math.round(cx), ty, Math.round(cz), 0x2e2e30); g.set(Math.round(cx), ty - 1, Math.round(cz), 0x2e2e30); }
  }, 1),
  // 벽돌·콘크리트 잔해 (철근 몇 가닥)
  rubble: r => model(r, 28, 11, 20, [14, 0, 10], g => {
    const C = [0x8a4a38, 0x7a7068, 0x6a3a2c, 0x9a9088, 0x5e5650];
    for (let x = 0; x < 28; x++) for (let z = 0; z < 20; z++) {
      const hgt = Math.floor((1 - Math.hypot((x - 14) / 14, (z - 10) / 10)) * 10 + n2(x * .3, z * .3, 5) * 3 - 1);
      for (let y = 0; y < hgt; y++) g.set(x, y, z, C[(((x >> 2) + (y >> 1) * 3 + (z >> 2) * 7) % 5)]);
    }
    line(g, 6, 3, 4, 2, 9, 2, RUST[1]); line(g, 20, 4, 14, 26, 8, 17, RUST[0]);
  }, 1),
  // 바닥에 날린 신문지
  newspaper: r => model(r, 16, 2, 12, [8, 0, 6], g => {
    box(g, 0, 0, 0, 15, 0, 11, 0xbab29a); box(g, 4, 0, 6, 15, 0, 11, 0xc8c0a8); g.set(15, 1, 11, 0xc8c0a8);
    for (const z of [2, 4, 8, 10]) for (let x = 1; x < 14; x++) if (hash3(x, z, 1) < .7) g.set(x, 0, z, 0x6a6a64);
    box(g, 1, 0, 6, 3, 0, 8, 0x5a5a56);
  }, 1),
  // 붉은·흰 플라스틱 물 바리케이드 (골 진 면)
  barrier: r => model(r, 44, 18, 12, [22, 0, 6], g => {
    for (let x = 0; x < 44; x++) for (let y = 0; y < 18; y++) for (let z = 0; z < 12; z++) {
      const half = y < 4 ? 6 : 6 - (y - 3) * .22; if (Math.abs(z + .5 - 6) > half) continue;
      if (y > 14 && (x < 3 || x > 40)) continue;
      let c = ((x + y) >> 3) % 2 ? 0xa8402e : 0xc8c0b0;
      if (y < 3) c = shadeC(c, .7);
      if (x % 6 === 0) c = shadeC(c, .85);
      if (n2(x * .2, y * .2, 4) > .7) c = mixC(c, 0x5a5048, .5);   // 때
      g.set(x, y, z, c);
    }
    box(g, 4, 17, 5, 6, 17, 6, 0x8a8478); box(g, 37, 17, 5, 39, 17, 6, 0x8a8478);
  }, 1),
  // 녹슨 소화전 (받침·몸통·옆 마개·지붕·윗 볼트)
  hydrant: r => model(r, 14, 21, 14, [7, 0, 7], g => {
    const C = 0x8a3428, D = 0x6a2a20;
    cyl(g, 'y', 7, 7, 6.2, 0, 1, D);
    cyl(g, 'y', 7, 7, 4.6, 2, 14, (x, y) => n2(x * .4, y * .3, 2) > .6 ? RUST[(x + y) % 4] : (y === 12 ? D : C));
    cyl(g, 'y', 7, 7, 5.4, 15, 15, D);
    for (let y = 16; y < 19; y++) cyl(g, 'y', 7, 7, 4.6 - (y - 16) * 1.3, y, y, C);
    box(g, 6, 19, 6, 7, 20, 7, D);
    cyl(g, 'x', 7, 9.5, 2.2, 0, 13, (x) => x === 0 || x === 13 ? D : C);
    cyl(g, 'z', 7, 9.5, 2.6, 11, 13, D);
  }, 1),
  // 옥상 나무 물탱크: 세로 나무판 + 쇠테 + 원뿔 지붕 + 철 다리·사다리
  watertower: r => model(r, 48, 68, 48, [24, 0, 24], g => {
    for (const [x, z] of [[6, 6], [40, 6], [6, 40], [40, 40]]) box(g, x, 0, z, x + 1, 24, z + 1, 0x3a2e26);
    for (let y = 4; y < 24; y += 8) { line(g, 6, y, 6, 41, y + 6, 6, 0x3a2e26); line(g, 6, y, 41, 41, y + 6, 41, 0x3a2e26); }
    box(g, 4, 24, 4, 43, 25, 43, (x, y, z) => (x + z) % 4 ? 0x4a3a2c : 0x3a2e26);
    for (let y = 26; y < 56; y++) for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) {
      const d = Math.hypot(x + .5 - 24, z + .5 - 24); if (d > 21 || d < 19) continue;
      const a = Math.atan2(z - 24, x - 24), stave = Math.floor((a + Math.PI) * 18);
      let c = stave % 2 ? 0x6a5038 : 0x5a4430;
      if (y % 9 === 0) c = 0x2a2420;
      if (n2(stave * .7, y * .12, 9) > .65) c = shadeC(c, .75);
      g.set(x, y, z, c);
    }
    for (let y = 56; y < 68; y++) for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) { const d = Math.hypot(x + .5 - 24, z + .5 - 24); if (d < 21.5 - (y - 56) * 1.8 && d > 19.5 - (y - 56) * 1.8 - 2) g.set(x, y, z, (x + y) % 3 ? 0x4a3a2c : 0x3e3024); }
    for (let y = 26; y < 58; y += 2) { g.set(24, y, 46, 0x2e2622); g.set(27, y, 46, 0x2e2622); } for (let y = 26; y < 58; y++) { g.set(23, y, 46, 0x2e2622); g.set(28, y, 46, 0x2e2622); }
  }, 1),
  // 녹슨 초록 대형 쓰레기통 (뚜껑이 들림, 봉투가 삐져나옴) — 칸 2×1m, 높이 1.15
  dumpster: r => model(r, 40, 26, 20, [0, 0, 0], g => {
    const C = 0x3e5a3e;
    box(g, 1, 2, 1, 38, 22, 18, (x, y, z) => {
      let c = (x % 6 === 0 && (z === 1 || z === 18)) ? shadeC(C, .75) : C;
      if (n2(x * .2, y * .2 + z * .1, 6) > .58) c = mixC(c, RUST[(x + y) % 4], .85);
      if (y < 5) c = shadeC(c, .8);
      return c;
    });
    box(g, 3, 6, 18, 36, 21, 18, -2);
    box(g, 3, 22, 2, 36, 22, 17, 0x1a1a18);
    for (let x = 1; x < 39; x++) for (let z = 1; z < 19; z++) { const y = 23 + Math.floor((19 - z) * .12); if (x < 21) g.set(x, y, z, 0x2a3a2a); }
    box(g, 22, 23, 4, 34, 25, 14, (x, y, z) => Math.hypot(x - 28, (y - 22) * 2, z - 9) < 7 ? 0x1c1c1e : -2);
    box(g, 0, 10, 4, 0, 12, 15, 0x2a2a28); box(g, 39, 10, 4, 39, 12, 15, 0x2a2a28);
    for (const [x, z] of [[3, 3], [35, 3], [3, 15], [35, 15]]) box(g, x, 0, z, x + 2, 1, z + 1, 0x1a1a1a);
    for (let x = 8; x < 30; x++) if (hash3(x, 1, 2) < .5) g.set(x, 13 + (x % 3), 19, [0x8a6a7a, 0xb8b0a0, 0x6a7a7a][x % 3]);   // 낙서
  }, 2),
  // 전봇대 (예전 한국 도심용)
  pole: r => model(r, 8, 144, 32, [4, 0, 16], g => {
    box(g, 2, 0, 14, 5, 143, 17, (x, y) => y % 40 === 0 ? 0x6a6a66 : 0x8a8a84);
    box(g, 3, 130, 0, 4, 132, 31, 0x5a5a58);
    box(g, 0, 108, 20, 7, 120, 26, 0x5a5e62);
    for (let y = 40; y < 100; y += 12) box(g, 2, y, 14, 5, y + 1, 17, 0x9a8a3a);
  }, 1),
};
for (let i = 0; i < 7; i++) ENV_BUILDERS['car' + i] = r => model(r, 88, 33, 40, [0, 0, 0], g => paintCar(g, i, false));
