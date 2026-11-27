// 무기·손에 드는 소품 고밀도 복셀 모델 (복셀 4.5cm = 예전의 절반)
// 규칙은 예전과 똑같음: 무기는 +x로 뻗고 원점 = 손잡이(쥐는 곳), 전체 길이·크기(미터)도 예전과 같게
//   → 공격 거리·무기 끝 위치(weaponTip)가 그대로 맞음. 원점·격자 크기는 예전 값 × 2
import { VoxGrid, meshGrid, hash3 } from './voxel.js';
import { H, desat, shade, pick, tone, grime, ell, rbox, line, stamp } from './chars_hd.js';

const single = (r, w, h, d, origin, paint) => { const g = new VoxGrid(w, h, d); paint(g); return meshGrid(r, g, H, origin); };
const STEEL = 0x8a8e92, STEEL_D = 0x5a5e62, STEEL_L = 0xc4c8cc, RUST = 0x7a4a2c, WOOD = 0x8a5a32, BLADE = 0xc8ccd0, EDGE = 0xeef0f2;
const steelT = tone(STEEL, .26, .14, .82, 1.15), woodT = (c = WOOD) => (x, y, z) => pick(x, y, z, c, shade(c, .84), shade(c, 1.12), .3, .16);
const rusty = (f, p = .14) => (x, y, z) => grime(x, y, z, f(x, y, z), hash3(x, z, y) < .5 ? RUST : 0x5a3420, p, 31);
// x축 원기둥 (반지름 rr, 중심 cy,cz)
function rodX(g, x0, x1, cy, cz, rr, f) {
  for (let x = x0; x <= x1; x++) { const R = typeof rr === 'function' ? rr(x) : rr; for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++) if ((y + .5 - cy) ** 2 + (z + .5 - cz) ** 2 <= R * R) g.set(x, y, z, f(x, y, z)); }
}
// y축 원기둥
function rodY(g, y0, y1, cx, cz, rr, f) {
  for (let y = y0; y <= y1; y++) { const R = typeof rr === 'function' ? rr(y) : rr; for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++) if ((x + .5 - cx) ** 2 + (z + .5 - cz) ** 2 <= R * R) g.set(x, y, z, f(x, y, z)); }
}
// 손잡이 감은 테이프 (나선 줄무늬)
const tape = (c) => (x, y, z) => (x + y + z) % 3 === 0 ? shade(c, .7) : pick(x, y, z, c, shade(c, .88), shade(c, 1.1));

// 맨홀 뚜껑 원판: 회청색 주철, 격자 무늬 + 테두리 + 'NYC' 돋을새김. 원판 면 = (u,v), 두께 방향 = t
// 흙빛 배경·갈색 옷과 섞이지 않게 차가운 쇠색 + 닳아 반짝이는 테두리·격자·글자 (채도가 아니라 명도 대비로 눈에 띄게)
function manholeDisc(set, N = 20, T = 4) {
  const c = (N - 1) / 2, IRON = 0x4e5660, IRON_D = 0x3a4048, IRON_L = 0x646e78, WORN = 0xb4bcc0, WORN_D = 0x8e979e;
  const letters = ['#..#.#.#.###', '##.#.#.#.#..', '#.##..#..#..', '#..#..#..###'];
  for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) {
    const d = Math.hypot(u - c, v - c);
    if (d > N / 2) continue;
    const rim = d > N / 2 - 2, ring2 = Math.abs(d - (N / 2 - 4.5)) < .6;
    for (let t = 0; t < T; t++) {
      const front = t === T - 1;
      let col = pick(u, v, t, IRON, IRON_D, IRON_L, .3, .16);
      if (front && !rim) {
        const grid = (u % 3 === 0 || v % 3 === 0) && d < N / 2 - 5;           // 격자 홈
        col = grid ? shade(IRON, .55) : ring2 ? WORN_D : pick(u, v, 5, WORN_D, IRON_L, WORN, .3, .12);   // 홈은 어둡게, 돋은 칸은 닳아 밝게
      }
      if (rim) col = pick(u, v, t, 0x5a626a, 0x48505a, 0x6e7880);
      set(u, v, t, grime(u, v, t, col, 0x8a5a34, .08, 41));   // 녹은 조금만
    }
    if (rim && hash3(u, v, 9) < .8) set(u, v, T, hash3(u, v, 4) < .7 ? WORN : WORN_D);   // 두툼한 테두리 (앞으로 한 칸, 닳아 반짝임)
  }
  // 'NYC' 글자 띠: 가운데를 가로지르는 판 + 돋을새김 글자
  for (let u = 3; u <= N - 4; u++) for (let v = Math.round(c) - 3; v <= Math.round(c) + 2; v++) set(u, v, T - 1, 0x363c44);
  letters.forEach((row, rr) => [...row].forEach((ch, i) => { if (ch === '#') set(4 + i, Math.round(c) + 1 - rr, T, 0xccd2d4); }));   // 어두운 띠 위 밝은 글자
}

export const ITEM_BUILDERS = {
  // ---------------- 쇠파이프: 둥근 단면 + 검은 테이프 손잡이 + 끝 이음쇠 + 녹
  w_pipe: r => single(r, 28, 6, 6, [4, 3, 3], g => {
    rodX(g, 0, 27, 3, 3, 1.6, rusty(steelT, .18));
    rodX(g, 0, 8, 3, 3, 1.9, tape(0x2a2a2c));
    rodX(g, 23, 26, 3, 3, 2.6, rusty(tone(STEEL_D), .2));                          // 이음쇠
    for (let y = 0; y < 6; y++) for (let z = 0; z < 6; z++) if (g.get(27, y, z) >= 0) g.set(27, y, z, 0x2a2a2c);   // 뚫린 끝
  }),
  // ---------------- 마체테: 나무 손잡이(리벳) + 손잡이 테 + 넓고 끝이 휜 칼날(밝은 날·어두운 등)
  w_machete: r => single(r, 26, 8, 2, [3, 4, 1], g => {
    rbox(g, 0, 2, 0, 7, 5, 1, woodT(0x5a3a22), 1);
    for (const x of [2, 5]) { g.set(x, 4, 0, STEEL_L); g.set(x, 4, 1, STEEL_L); }
    g.fill(8, 1, 0, 9, 6, 1, 0x2e2e30);
    for (let x = 10; x <= 25; x++) {
      const top = x >= 22 ? 7 - (x - 22) : 7, bot = x <= 12 ? 2 : x >= 21 ? 1 + Math.round((x - 21) * .9) : 1;
      for (let y = bot; y <= top; y++) for (let z = 0; z <= 1; z++) {
        if (x >= 23 && y < bot + 1 && z === 0) continue;
        const c = y === bot ? EDGE : y === bot + 1 ? 0xdce0e4 : y === top ? 0x8a8e94 : pick(x, y, z, BLADE, 0xb4b8bc, 0xd4d8dc);
        g.set(x, y, z, grime(x, y, z, c, 0x6a6058, y > bot + 1 ? .08 : 0, 3));
      }
    }
  }),
  // ---------------- 콘크리트 블록: 구멍 두 개 + 깨진 모서리 + 삐져나온 철근
  w_block: r => single(r, 14, 12, 12, [-1, 6, 6], g => {
    const C = (x, y, z) => pick(x, y, z, 0xa09e98, 0x8a8882, 0xb4b2ac, .3, .18);
    rbox(g, 0, 0, 0, 11, 11, 11, C, 1);
    for (const y0 of [2, 7]) g.fill(2, y0, 0, 9, y0 + 2, 11, -1);                  // 관통 구멍
    for (const [x, y, z] of [[11, 11, 0], [11, 10, 0], [10, 11, 0], [0, 0, 11], [1, 0, 11], [11, 0, 5], [11, 0, 6]]) g.set(x, y, z, -1);
    line(g, 6, 11, 3, 13, 11, 3, 0x6a4030); line(g, 9, 11, 8, 13, 10, 9, 0x7a4a34);
  }),
  // ---------------- 골프채: 고무 손잡이 + 크롬 샤프트 + 홈 파인 헤드
  w_golf: r => single(r, 36, 8, 2, [4, 7, 1], g => {
    for (let x = 0; x <= 7; x++) for (let y = 6; y <= 7; y++) for (let z = 0; z <= 1; z++) g.set(x, y, z, x % 2 ? 0x1e1e20 : 0x2e2e32);
    for (let x = 8; x <= 30; x++) g.set(x, 7, 0, x % 4 ? 0xc8ccd2 : 0xe0e4e8), g.set(x, 7, 1, 0xa8acb2);
    rbox(g, 29, 0, 0, 35, 6, 1, (x, y, z) => y === 0 ? 0x6a6e74 : pick(x, y, z, 0x8a9098, 0x7a8088, 0xa8aeb6), 1);
    for (let y = 1; y <= 5; y += 2) g.fill(35, y, 0, 35, y, 1, 0x4a4e54);
  }),
  // ---------------- 전기톱: 주황 본체(냉각 핀·손잡이 고리·시동줄) + 긴 날 + 톱니 체인
  w_chainsaw: r => single(r, 37, 11, 8, [4, 4, 4], g => {
    const OR = desat(0xb06a32, .4), ORT = rusty(tone(OR, .26, .12), .08);
    rbox(g, 0, 0, 0, 11, 8, 7, ORT, 2);
    for (let x = 1; x <= 9; x += 2) for (let y = 2; y <= 6; y++) { g.set(x, y, 0, 0x2a2a2c); g.set(x, y, 7, 0x2a2a2c); }   // 냉각 핀
    for (let x = 1; x <= 9; x++) { g.set(x, 10, 3, 0x2a2a2c); g.set(x, 10, 4, 0x2a2a2c); } g.fill(1, 9, 3, 1, 9, 4, 0x2a2a2c); g.fill(9, 9, 3, 9, 9, 4, 0x2a2a2c);   // 손잡이 고리
    g.fill(0, 6, 3, 0, 7, 4, 0x1a1a1a); g.set(-0, 7, 3, 0xd8d0c0);
    g.fill(11, 6, 2, 12, 9, 5, 0x2a2a2c);                                         // 앞 손잡이
    for (let x = 12; x <= 35; x++) for (let y = 2; y <= 6; y++) for (let z = 3; z <= 4; z++) {
      if (x >= 34 && (y === 2 || y === 6)) continue;
      g.set(x, y, z, y === 2 || y === 6 ? 0x3a3a3c : pick(x, y, z, 0xa0a6ac, 0x8a9096, 0xb8bec4));
    }
    for (let x = 13; x <= 35; x += 2) { g.set(x, 7, 3, 0x6a6e74); g.set(x, 7, 4, 0xc0c4c8); g.set(x + 1, 1, 3, 0xc0c4c8); g.set(x + 1, 1, 4, 0x6a6e74); }   // 톱니
    g.fill(36, 3, 3, 36, 5, 4, 0x3a3a3c);
    for (let x = 16; x <= 30; x += 7) { g.set(x, 4, 2, 0x5a5e62); g.set(x, 4, 5, 0x5a5e62); }
  }),
  // ---------------- 소방 도끼: 붉은 손잡이(닳은 칠) + 검은 손잡이 끝 + 넓은 날 + 뒤쪽 뾰족 송곳
  w_axe: r => single(r, 32, 16, 2, [3, 9, 1], g => {
    for (let x = 0; x <= 29; x++) for (let y = 8; y <= 9; y++) for (let z = 0; z <= 1; z++) g.set(x, y, z, x <= 5 ? (x % 2 ? 0x1a1a1a : 0x2a2a2a) : hash3(x, y, z) < .12 ? 0x8a6a4a : pick(x, y, z, 0xa8261e, 0x8a1e18, 0xc03228));
    for (let x = 22; x <= 29; x++) for (let y = 6; y <= 11; y++) for (let z = 0; z <= 1; z++) if (g.get(x, y, z) < 0 || y < 8 || y > 9) g.set(x, y, z, steelT(x, y, z));
    for (let y = 10; y <= 15; y++) { const half = 2 + Math.round((y - 10) * .7); for (let x = 25 - half; x <= 27 + half && x <= 31; x++) for (let z = 0; z <= 1; z++) g.set(x, y, z, y === 15 ? EDGE : y === 14 ? 0xd4d8dc : rusty(steelT, .1)(x, y, z)); }
    for (let y = 2; y <= 7; y++) { const w = Math.max(0, Math.round((y - 2) * .5)); for (let x = 26 - w; x <= 27 + w; x++) for (let z = 0; z <= 1; z++) g.set(x, y, z, y <= 3 ? STEEL_L : steelT(x, y, z)); }
  }),
  // ---------------- 못 박힌 야구 방망이: 손잡이(테이프·손잡이 끝) → 굵은 몸통, 못이 사방으로
  w_bat: r => single(r, 30, 10, 10, [4, 5, 5], g => {
    rodX(g, 0, 29, 5, 5, x => x <= 10 ? 1.6 : Math.min(4.4, 1.6 + (x - 10) * .22), woodT(0xa8763e));
    rodX(g, 0, 8, 5, 5, 1.9, tape(0x3a2a20));
    rodX(g, 0, 0, 5, 5, 2.6, () => 0x2a1a10);
    for (let x = 0; x <= 29; x++) for (let y = 0; y < 10; y++) for (let z = 0; z < 10; z++) if (x >= 12 && g.get(x, y, z) >= 0 && hash3(x, y, z) < .05) g.set(x, y, z, 0x6a4a2a);
    for (const [x, y, z] of [[16, 9, 5], [19, 0, 4], [22, 5, 9], [24, 5, 0], [26, 9, 3], [21, 9, 6], [28, 0, 6], [18, 5, 9], [25, 1, 8], [27, 8, 1], [14, 8, 5], [23, 0, 5]]) { g.set(x, y, z, 0xb8bcc0); }
  }),
  // ---------------- 오함마: 나무 자루 + 무거운 강철 머리(모서리 깎음, 맞는 면 밝게)
  w_sledge: r => single(r, 30, 12, 6, [3, 5, 3], g => {
    for (let x = 0; x <= 23; x++) for (let y = 4; y <= 5; y++) for (let z = 2; z <= 3; z++) g.set(x, y, z, x <= 5 ? tape(0x2a2a2a)(x, y, z) : woodT(0x8a5a32)(x, y, z));
    rbox(g, 22, 0, 0, 29, 11, 5, (x, y, z) => y === 0 || y === 11 ? 0x9aa0a6 : rusty(tone(0x4a4e55, .3, .14), .12)(x, y, z), 2);
    g.fill(23, 4, 0, 28, 7, 0, 0x3a3e44); g.fill(23, 4, 5, 28, 7, 5, 0x3a3e44);
  }),
  // ---------------- 강철 체인 (바닥에 놓였을 때·파편): 엇갈린 고리 + 끝 쇳덩이
  w_chain: r => single(r, 48, 6, 6, [3, 3, 3], g => {
    rbox(g, 0, 1, 1, 5, 4, 4, () => 0x2a2a2a, 1);
    for (let i = 0; i < 9; i++) {
      const x0 = 6 + i * 4, flat = i % 2, c = i % 3 ? 0x9aa2ab : 0x6d737b;
      for (let x = x0; x <= x0 + 4; x++) for (let a = 1; a <= 4; a++) {
        const edge = x === x0 || x === x0 + 4 || a === 1 || a === 4;
        if (!edge) continue;
        if (flat) g.set(x, a, 3, c); else g.set(x, 3, a, c);
      }
    }
    rbox(g, 42, 0, 0, 47, 5, 5, rusty(tone(0x3e4349), .2), 2);
  }),
  // ---------------- 산탄총: 나무 개머리판 + 검은 기관부 + 쌍열 총신 + 펌프
  w_shotgun: r => single(r, 32, 7, 4, [7, 3, 2], g => {
    for (let x = 0; x <= 9; x++) for (let y = 0; y <= 4; y++) for (let z = 0; z <= 3; z++) { if (y < 4 - Math.round(x * .35) - 1 && x < 6) continue; if ((z === 0 || z === 3) && (y === 0 || y === 4)) continue; g.set(x, y, z, x === 0 ? 0x2a1a10 : woodT(0x7a4a24)(x, y, z)); }
    rbox(g, 9, 1, 0, 14, 5, 3, tone(0x2a2a2e), 1);
    for (let x = 10; x <= 12; x++) g.set(x, 0, 1, 0x1a1a1a), g.set(x, 0, 2, 0x1a1a1a); g.set(10, 1, 1, 0x1a1a1a);
    for (let x = 14; x <= 31; x++) for (const z of [0, 2]) { g.set(x, 5, z, STEEL); g.set(x, 5, z + 1, STEEL_D); g.set(x, 6, z, x % 3 ? STEEL_L : STEEL); g.set(x, 6, z + 1, STEEL); }
    for (const z of [0, 2]) { g.set(31, 5, z, 0x1a1a1a); g.set(31, 6, z, 0x1a1a1a); }
    rbox(g, 17, 3, 0, 24, 4, 3, (x, y, z) => (x % 2 ? woodT(0x7a4a24)(x, y, z) : 0x5a3418), 1);
  }),
  // ---------------- 화염방사기: 붉은 연료통(경고 띠·계기) + 호스 + 긴 노즐 + 점화 불씨
  w_flamer: r => single(r, 28, 10, 8, [6, 4, 4], g => {
    rodX(g, 0, 7, 4.5, 4, 3.6, rusty(tone(0xa8281e, .22, .12), .1));
    for (let y = 0; y < 10; y++) for (let z = 0; z < 8; z++) { if (g.get(0, y, z) >= 0) g.set(0, y, z, 0x5a1610); if (g.get(7, y, z) >= 0) g.set(7, y, z, 0x5a1610); }
    for (let x = 2; x <= 5; x++) for (let y = 2; y <= 6; y++) if (g.get(x, y, 7) >= 0) g.set(x, y, 7, ((x + y) >> 1) % 2 ? 0xb09a40 : 0x2a2a2a);
    g.fill(3, 8, 3, 4, 9, 4, 0xc8c8c0); g.set(4, 9, 4, 0x2a2a2a);
    rodX(g, 8, 23, 4.5, 4, 1.2, (x, y, z) => x % 3 ? 0x5d636b : 0x7d838b);
    g.fill(9, 1, 3, 11, 3, 4, 0x2a2a2a);
    rodX(g, 24, 27, 4.5, 4, 1.9, () => 0x2a2a2c);
    g.set(27, 6, 4, 0xff8a1f); g.set(27, 7, 4, 0xffd040);
  }),
  // ---------------- 맨홀 방패 (몸 앞에 세워 듦: 원판이 y-z면, 바깥 = +x)
  manhole: r => single(r, 5, 22, 22, [2, 11, 11], g => manholeDisc((u, v, t, c) => g.set(t, v, 21 - u, c), 22, 4)),   // 턱~무릎을 가리는 큰 원판 (지름 약 1m)
  // ---------------- 맨홀 휘두를 때: 원판이 x-z면, 손에서 +x로
  w_manhole: r => single(r, 20, 5, 20, [0, 2, 10], g => paintManhole(g, (u, v, t, c) => g.set(u, t, v, c))),
  // ---------------- 카타나: 붉은·검은 마름모 손잡이 + 금색 코등이 + 긴 칼날(날 끝선·물결 무늬)
  w_katana: r => single(r, 34, 6, 3, [3, 3, 1.5], g => {
    for (let x = 0; x <= 7; x++) for (let y = 2; y <= 3; y++) for (let z = 0; z <= 2; z++) g.set(x, y, z, (x + y + z) % 2 ? 0x1a1414 : 0x8a1a1a);
    g.fill(0, 2, 0, 0, 3, 2, 0xa88a2a);
    rbox(g, 8, 0, 0, 8, 5, 2, () => 0xa88a2a, 1); g.set(8, 2, 1, 0x6a5418);
    for (let x = 9; x <= 33; x++) {
      const tip = x >= 31; if (tip && x === 33) { g.set(x, 3, 1, EDGE); continue; }
      g.set(x, 3, 1, x % 5 === 0 ? 0xd8dce0 : 0xb8bcc2); g.set(x, 2, 1, tip ? EDGE : (x + 1) % 4 < 2 ? 0xe8ecf0 : EDGE);
      if (x <= 30) g.set(x, 4, 1, 0x8a8e94);
    }
  }),
  // ---------------- 표창: 네 갈래 별 + 가운데 구멍
  shuriken: r => single(r, 10, 2, 10, [5, 1, 5], g => {
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
      const u = i - 4.5, v = j - 4.5, a = Math.abs(u), b = Math.abs(v);
      if ((a < 1.2 && b < 5) || (b < 1.2 && a < 5) || (a + b < 3.2)) { g.set(i, 0, j, a + b > 3.6 ? 0xd8dce0 : 0x9a9ea4); if (a + b < 3) g.set(i, 1, j, 0x7a7e84); }
    }
    g.fill(4, 0, 4, 5, 1, 5, -1);
  }),
  w_nunchaku_handle: r => single(r, 8, 4, 4, [0, 2, 2], g => { rodX(g, 0, 7, 2, 2, 1.7, woodT(0x7a4a22)); rodX(g, 0, 0, 2, 2, 1.9, () => 0x1a1a1a); rodX(g, 7, 7, 2, 2, 1.9, () => 0x1a1a1a); }),
  w_nunchaku: r => single(r, 20, 4, 10, [0, 2, 2], g => {
    rodX(g, 0, 7, 2, 2, 1.7, woodT(0x7a4a22)); rodX(g, 0, 7, 2, 7.5, 1.7, woodT(0x7a4a22));
    for (const z of [2, 7.5]) { rodX(g, 7, 7, 2, z, 1.9, () => 0x1a1a1a); }
    for (const [x, z] of [[8, 2], [9, 3], [10, 4], [10, 5], [9, 6], [8, 7]]) g.set(x, 2, z, z % 2 ? 0x9aa2ab : 0x5d636b);
  }),
  w_flail_handle: r => single(r, 10, 4, 4, [3, 2, 2], g => { rodX(g, 0, 8, 2, 2, 1.6, tape(0x5a3a22)); rodX(g, 9, 9, 2, 2, 1.9, () => 0x4a4e55); }),
  w_flail: r => single(r, 34, 10, 10, [3, 5, 5], g => {
    rodX(g, 0, 8, 5, 5, 1.6, tape(0x5a3a22)); rodX(g, 9, 9, 5, 5, 1.9, () => 0x4a4e55);
    for (let x = 10; x < 23; x++) g.set(x, 5, 5, (x >> 1) % 2 ? 0x9aa2ab : 0x5d636b), x % 2 && g.set(x, 4, 5, 0x6d737b);
    ell(g, 27.5, 5, 5, 4, 4, 4, rusty(tone(0x3a3e44, .3, .14), .14));
    for (const [x, y, z] of [[32, 5, 5], [33, 5, 5], [27, 0, 5], [27, 9, 5], [27, 5, 0], [27, 5, 9], [24, 1, 3], [30, 8, 7], [30, 1, 7], [24, 8, 3], [25, 5, 9], [30, 5, 0]]) g.set(x, y, z, 0xc8cdd2);
  }),
  w_whip_handle: r => single(r, 8, 4, 2, [3, 2, 1], g => { for (let x = 0; x <= 7; x++) for (let y = 1; y <= 2; y++) for (let z = 0; z <= 1; z++) g.set(x, y, z, (x + y) % 3 ? 0x3a2414 : 0x5a3a22); g.fill(0, 0, 0, 0, 3, 1, 0x2a1a10); }),
  w_chain_handle: r => single(r, 6, 4, 4, [3, 2, 2], g => { rbox(g, 0, 0, 0, 5, 3, 3, tape(0x2a2a2a), 1); }),
  w_whip: r => single(r, 54, 4, 2, [3, 2, 1], g => {
    for (let x = 0; x <= 7; x++) for (let y = 1; y <= 2; y++) for (let z = 0; z <= 1; z++) g.set(x, y, z, (x + y) % 3 ? 0x3a2414 : 0x5a3a22);
    for (let x = 8; x < 54; x++) { const y = x < 30 ? 2 : x < 44 ? 1 : 0; g.set(x, y, x < 24 ? 0 : 1, x > 48 ? 0xb07a48 : (x >> 1) % 2 ? 0x6b4226 : 0x5a361e); if (x < 20) g.set(x, y, 1, 0x5a361e); }
  }),
  // ---------------- 곡괭이: 나무 자루 + 휘어진 양날 쇠머리
  w_pickaxe: r => single(r, 28, 18, 2, [3, 9, 1], g => {
    for (let x = 0; x <= 23; x++) for (let y = 8; y <= 9; y++) for (let z = 0; z <= 1; z++) g.set(x, y, z, x <= 4 ? tape(0x2a2a2a)(x, y, z) : woodT(0x7a5232)(x, y, z));
    for (let y = 1; y <= 16; y++) { const bend = Math.round(((y - 8.5) / 7.5) ** 2 * 3); for (let x = 22 - bend; x <= 24 - bend; x++) for (let z = 0; z <= 1; z++) g.set(x, y, z, y <= 2 || y >= 15 ? STEEL_L : rusty(steelT, .12)(x, y, z)); }
    g.fill(21, 7, 0, 25, 10, 1, 0x4a4e55);
  }),
  // ---------------- 벽돌 (던지는 것): 구멍 세 개 뚫린 붉은 벽돌
  brick: r => single(r, 8, 4, 4, [4, 2, 2], g => {
    rbox(g, 0, 0, 0, 7, 3, 3, (x, y, z) => pick(x, y, z, 0xa8442e, 0x8a3624, 0xc0583e, .3, .16), 1);
    for (const x of [1, 3, 5]) g.fill(x, 3, 1, x + 1, 3, 2, 0x4a1a12);
  }),
  // ---------------- 통조림 (회복): 붉은 캔 + 흰 띠 + 은색 뚜껑
  food: r => single(r, 6, 8, 6, [3, 0, 3], g => {
    rodY(g, 0, 7, 3, 3, 3.1, (x, y, z) => y === 0 || y === 7 ? 0xc8ccd0 : y === 1 || y === 6 ? 0x9a9ea4 : y >= 3 && y <= 4 ? 0xe8e2d4 : pick(x, y, z, 0xd03a26, 0xb02e1e, 0xe0503a));
    g.fill(2, 3, 5, 3, 4, 5, 0xd03a26); g.set(3, 7, 3, 0x6a6e74);
  }),
  // ---------------- 동전(부품): 채도 높은 노란 동전 + 진한 금색 테두리 + 톱니바퀴 무늬
  scrap: r => single(r, 10, 10, 2, [5, 0, 1], g => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d > 5) continue;
      const rim = d > 3.9, gear = d < 2.9 && d > 1.4 && Math.round(Math.atan2(y - 4.5, x - 4.5) / (Math.PI / 4)) % 2 === 0;
      const c = rim ? 0xe09a00 : gear ? 0xe8b400 : (x === 3 && y >= 6) || (x === 2 && y === 5) ? 0xfff58a : 0xffd400;
      g.set(x, y, 0, c); g.set(x, y, 1, rim ? 0xc88800 : 0xffd400);
    }
  }),
  // ---------------- 나무 상자: 판자 + 틀 + 대각 버팀대 + 못
  crate: r => single(r, 18, 18, 18, [9, 0, 9], g => {
    const P = (x, y, z) => { const plank = Math.floor(y / 4.5); return shade(pick(x, y, z, 0xa07444, 0x8a6238, 0xb0844e, .3, .16), plank % 2 ? .92 : 1.02); };
    rbox(g, 0, 0, 0, 17, 17, 17, (x, y, z) => (y % 4.5 < 1 && y > 0) ? 0x5a3e22 : P(x, y, z), 0);
    const F = 0x6e4f2e;
    for (let i = 0; i < 18; i++) for (const a of [0, 1, 16, 17]) for (const b of [0, 1, 16, 17]) { const c = (a + b) % 2 ? F : shade(F, 1.1); g.set(i, a, b, c); g.set(a, i, b, c); g.set(a, b, i, c); }
    for (let i = 2; i <= 15; i++) for (const s of [0, 17]) { g.set(i, i, s, F); g.set(i, i + 1 > 15 ? 15 : i + 1, s, shade(F, .9)); g.set(s, i, i, F); g.set(s, i, i + 1 > 15 ? 15 : i + 1, shade(F, .9)); }
    for (const a of [1, 16]) for (const b of [1, 16]) for (const s of [0, 17]) { g.set(a, b, s, 0x8a8e92); g.set(s, a, b, 0x8a8e92); }
  }),
  // ---------------- 드럼통: 붉은 원통 + 테 두 줄 + 경고 표시 + 뚜껑 마개 + 녹·움푹
  barrel: r => single(r, 16, 20, 16, [8, 0, 8], g => {
    rodY(g, 0, 19, 8, 8, y => (y === 0 || y === 19) ? 7.4 : 7.9, rusty((x, y, z) => (y === 1 || y === 18 || y === 6 || y === 13) ? 0x5a1a14 : pick(x, y, z, 0x962c1e, 0x7a2418, 0xa83a28, .26, .12), .1));
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (g.get(x, 19, z) >= 0) g.set(x, 19, z, Math.hypot(x - 7.5, z - 7.5) > 6.5 ? 0x6a1e16 : pick(x, 19, z, 0x8a2618, 0x7a2014, 0x9a2c1c));
    g.fill(10, 19, 4, 11, 19, 5, 0x3a3a3c);
    stamp(g, ['..#..', '.#.#.', '#.#.#', '#####'], 15, 11, 6, 'x', 0xb09a40);
    stamp(g, ['..#..', '.#.#.', '#.#.#', '#####'], 5, 11, 15, 'z', 0xb09a40);
  }),
  // ---------------- 오토바이 (앞 = +x): 바큇살 바퀴 + 엔진 + 붉은 연료통(불꽃) + 안장 + 핸들 + 배기관 + 전조등
  moto: r => single(r, 44, 22, 12, [22, 0, 6], g => {
    for (const cx of [7.5, 35.5]) for (let x = 0; x < 44; x++) for (let y = 0; y < 15; y++) {
      const d = Math.hypot(x + .5 - cx, y + .5 - 7);
      if (d > 7) continue;
      for (let z = 4; z <= 7; z++) {
        const tire = d > 5.2, rim = d > 4.4 && !tire, hub = d < 1.6, spoke = !tire && !rim && (Math.abs((x + .5 - cx)) < .7 || Math.abs(y + .5 - 7) < .7 || Math.abs(Math.abs(x + .5 - cx) - Math.abs(y + .5 - 7)) < .8);
        if (tire) g.set(x, y, z, (Math.round(Math.atan2(y - 7, x - cx) * 6) + z) % 2 ? 0x1a1a1a : 0x262626);
        else if (rim) g.set(x, y, z, z === 4 || z === 7 ? 0x9aa0a6 : 0x6a6e74);
        else if (hub) g.set(x, y, z, 0xb8bcc2);
        else if (spoke && (z === 5 || z === 6)) g.set(x, y, z, 0x8a9096);
      }
    }
    for (let x = 10; x <= 32; x++) for (let y = 8; y <= 9; y++) for (let z = 5; z <= 6; z++) g.set(x, y, z, 0x2a2a2e);   // 뼈대
    rbox(g, 15, 4, 3, 24, 11, 8, (x, y, z) => (y + x) % 3 === 0 ? 0x8a9096 : pick(x, y, z, 0x4a4e54, 0x3a3e44, 0x6a6e74), 1);   // 엔진
    for (let y = 5; y <= 10; y += 2) for (let z = 3; z <= 8; z += 5) g.fill(16, y, z, 23, y, z, 0xa8acb2);
    rbox(g, 20, 12, 2, 31, 16, 9, (x, y, z) => { const fl = z <= 2 || z >= 9 ? (((x + y * 1.3) % 5) < 1.6 && x < 30 ? 0xe0a030 : ((x + y * 1.3) % 5) < 2.6 && x < 30 ? 0xd0661c : 0) : 0; return fl || (y === 16 && x > 22 ? 0xd04a36 : pick(x, y, z, 0xa8281e, 0x8a2018, 0xc03a2a, .2, .1)); }, 2);   // 연료통
    rbox(g, 6, 13, 3, 20, 15, 8, (x, y, z) => y === 15 ? (x % 3 ? 0x2a2626 : 0x3a3434) : 0x1a1818, 1);   // 안장
    rbox(g, 2, 12, 3, 9, 13, 8, (x, y, z) => pick(x, y, z, 0xa8281e, 0x8a2018, 0xc03a2a), 1);           // 뒤 흙받이
    for (let i = 0; i <= 9; i++) { g.set(32 + Math.round(i * .35), 8 + i, 4, 0x8a9096); g.set(32 + Math.round(i * .35), 8 + i, 7, 0x8a9096); }   // 앞 포크
    for (let z = 0; z <= 11; z++) g.set(36, 18, z, z <= 1 || z >= 10 ? 0x1a1a1a : 0xc8ccd2);                // 핸들
    g.fill(35, 17, 5, 36, 17, 6, 0x8a9096);
    rbox(g, 37, 13, 4, 39, 16, 7, () => 0x2a2a2e, 1); g.fill(40, 14, 5, 40, 15, 6, 0xfff3a0); g.fill(40, 14, 4, 40, 15, 4, 0xd8d0a0); g.fill(40, 14, 7, 40, 15, 7, 0xd8d0a0);   // 전조등
    for (let x = 2; x <= 18; x++) { g.set(x, 5 + (x < 8 ? 1 : 0), 10, 0xc0c4c8); g.set(x, 4 + (x < 8 ? 1 : 0), 10, 0x9aa0a6); } g.fill(1, 5, 10, 2, 6, 10, 0x2a2a2a);   // 배기관
    g.fill(0, 11, 4, 1, 12, 7, 0xa01810);                                                                  // 미등
    rbox(g, 30, 13, 3, 36, 14, 8, (x, y, z) => pick(x, y, z, 0xa8281e, 0x8a2018, 0xc03a2a), 1);           // 앞 흙받이
  }),
  // ---------------- 가시 함정: 바닥 철판(테두리 노랑·검정 경고, 리벳) / 솟은 강철 가시
  spikePlate: r => single(r, 44, 2, 44, [22, 0, 22], g => {
    for (let x = 0; x < 44; x++) for (let z = 0; z < 44; z++) {
      const edge = x < 2 || z < 2 || x > 41 || z > 41;
      g.set(x, 0, z, edge ? (((x + z) >> 2) % 2 ? 0xa89040 : 0x1e1e1e) : rusty((a, b, c) => pick(a, b, c, 0x4a4a4e, 0x3e3e42, 0x5a5a5e), .1)(x, 0, z));
    }
    for (let x = 3; x < 44; x += 8) for (let z = 3; z < 44; z += 8) { g.fill(x, 0, z, x + 1, 0, z + 1, 0x141414); }
    for (const [x, z] of [[1, 1], [42, 1], [1, 42], [42, 42], [21, 1], [21, 42], [1, 21], [42, 21]]) g.set(x, 1, z, 0x8a8e92);
  }),
  spikes: r => single(r, 44, 12, 44, [22, 0, 22], g => {
    for (let x = 3; x < 44; x += 8) for (let z = 3; z < 44; z += 8) {
      for (let y = 0; y <= 11; y++) { const w = y < 5 ? 1 : 0; for (let a = 0; a <= w; a++) for (let b = 0; b <= w; b++) g.set(x + a, y, z + b, y >= 10 ? 0xe8ecf0 : y >= 8 ? 0xc8ccd0 : hash3(x, y, z) < .2 ? RUST : 0xa0a4aa); }
    }
  }),
};

// 맨홀 그리기 공통: set(u, v, t, c) — u,v = 원판 면, t = 두께(바깥으로 갈수록 큼)
function paintManhole(g, set) { manholeDisc((u, v, t, c) => set(u, v, t, c), 20, 4); }
