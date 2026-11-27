// 뱀돌이 v2 고밀도 복셀 모델 — 기준: docs/art/hero_turnaround.webp
// 기존 인간형과 같은 부위 구조(머리·몸통·위팔/아래팔·허벅지/정강이)라 모든 모션이 그대로 동작한다.
// 복셀 1칸 = 기존(V)의 절반. 짜리몽땅한 보통 체형: 큰 머리, 넓은 어깨, 굵은 팔에 큰 주먹, 짧고 굵은 다리.
import { V } from './config.js';
import { VoxGrid, meshGrid, hash3 } from './voxel.js';

const H = V / 2;                       // 4.5cm
const WOUND = [0xc81e24, 0x9e1219, 0xe0382c, 0xb3161d];
const C = {
  skin: 0xe2a271, skinD: 0xc4875a, skinL: 0xf0b98a, stub: 0xbf8a63,
  hair: 0x4a2c18, hairD: 0x2e1a0e, hairL: 0x5e3a20,
  band: 0xc8262e, bandD: 0x941820,
  brow: 0x24140a, eyeW: 0xf2eee4, pupil: 0x16100c, mouth: 0x4a1a14, teeth: 0xf0ece0,
  denim: 0x4a6b9e, denimD: 0x3a5684, denimL: 0x6486ba, fray: 0xd9d2c2,
  tee: 0xe6e0d2, teeD: 0xc9c2b2,
  belt: 0x5a3a22, buckle: 0xb9b2a2,
  jean: 0x4f72aa, jeanD: 0x3e5d90, jeanL: 0x86a3cc, thread: 0xe2ddd0,
  wrap: 0xb8222a, wrapD: 0x8e1820,
  tattoo: 0x2a2a36, scar: 0xd99a78, patch: 0x9a978e,
  shoe: 0xc0282e, shoeD: 0x961e24, white: 0xeeeae2, sole: 0xd2cbbd,
};
// 데님·머리카락 등 재질에 얼룩(색 세 단계) — 위치 해시로 고정
const pick = (x, y, z, a, b, c, pb = .22, pc = .14) => { const h = hash3(x * 3 + 11, y * 5 + 7, z * 7 + 3); return h < pc ? c : h < pc + pb ? b : a; };

// 둥근 덩어리 채우기 (타원체) — f(x,y,z)가 색을 돌려줌
function ell(g, cx, cy, cz, rx, ry, rz, f, cond = null) {
  for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const d = ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 + ((z + .5 - cz) / rz) ** 2;
    if (d <= 1 && (!cond || cond(x, y, z))) g.set(x, y, z, f(x, y, z, d));
  }
}
// 모서리 깎은 상자
function rbox(g, x0, y0, z0, x1, y1, z1, f, cut = 1) {
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ex = x === x0 || x === x1, ez = z === z0 || z === z1, ey = y === y0 || y === y1;
    if (cut && ex && ez) continue;
    if (cut > 1 && ey && (ex || ez)) continue;
    g.set(x, y, z, f(x, y, z));
  }
}
const shade = (c, k) => { const r = Math.min(255, ((c >> 16) & 255) * k) | 0, gg = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0; return (r << 16) | (gg << 8) | b; };

// ---------------------------------------------------------------- 머리 (x19 × y17 × z18): 키의 약 35%, 머리보다 넓은 곱슬 덩어리
// 얼굴 블록 x7..17, y0..9, z3..14 / 앞면 x=17 / 머리띠 y7..8 / 머리카락 y9 이상
function head() {
  const g = new VoxGrid(19, 17, 18);
  for (let y = 0; y <= 9; y++) {
    const z0 = y === 0 ? 5 : y === 1 ? 4 : 3, z1 = 17 - z0, x0 = y <= 1 ? 9 : 7;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= 17; x++) g.set(x, y, z, shade(C.skin, z <= 4 || z >= 13 ? .9 : 1));
  }
  // 수염 자국: 턱과 아래 뺨
  for (let y = 0; y <= 2; y++) for (let z = 3; z <= 14; z++) for (let x = 9; x <= 17; x++) if (g.get(x, y, z) >= 0 && (x === 17 || z <= 4 || z >= 13)) g.set(x, y, z, C.stub);
  // 악문 이: 8칸, 위아래 어두운 테두리, 이 사이 선
  for (let z = 5; z <= 12; z++) { g.set(17, 1, z, C.mouth); g.set(17, 2, z, z % 2 ? C.teeth : 0xd6d0c2); g.set(17, 3, z, C.mouth); }
  g.set(17, 2, 5, C.mouth); g.set(17, 2, 12, C.mouth);
  // 코: 한 칸 튀어나옴 + 콧망울 그늘
  g.fill(18, 3, 8, 18, 4, 9, C.skin); g.set(18, 3, 8, C.skinD); g.set(18, 3, 9, C.skinD); g.set(17, 3, 7, C.skinD); g.set(17, 3, 10, C.skinD);
  // 눈: 흰자 3×2 + 안쪽 눈동자 (노려봄)
  for (const [z0, pz] of [[4, 6], [11, 11]]) { g.fill(17, 4, z0, 17, 5, z0 + 2, C.eyeW); g.fill(17, 4, pz, 17, 5, pz, C.pupil); }
  // 굵은 화난 눈썹: 바깥 높고 안쪽이 눈을 누름 (한 칸 도드라짐)
  for (let z = 3; z <= 7; z++) g.set(18, 6, z, C.brow);
  for (let z = 10; z <= 14; z++) g.set(18, 6, z, C.brow);
  g.set(18, 5, 7, C.brow); g.set(18, 5, 10, C.brow); g.set(17, 5, 7, C.brow); g.set(17, 5, 10, C.brow);
  // 미간 주름
  g.set(17, 6, 8, C.skinD); g.set(17, 6, 9, C.skinD);
  // 귀
  g.fill(11, 3, 2, 12, 5, 2, C.skin); g.fill(11, 3, 15, 12, 5, 15, C.skin); g.set(11, 4, 2, C.skinD); g.set(11, 4, 15, C.skinD);
  // 구레나룻·뒷머리
  for (const z of [3, 14]) g.fill(12, 4, z, 14, 6, z, C.hairD);
  for (let y = 2; y <= 6; y++) for (let z = 3; z <= 14; z++) g.set(7, y, z, pick(7, y, z, C.hair, C.hairD, C.hairL));
  // 머리띠 y7..8: 머리를 한 칸 도드라지게 둘러감 (위 줄 밝게)
  for (let y = 7; y <= 8; y++) {
    const c = y === 8 ? C.band : C.bandD;
    for (let z = 3; z <= 14; z++) { g.set(18, y, z, c); g.set(6, y, z, c); }
    for (let x = 6; x <= 18; x++) { g.set(x, y, 2, c); g.set(x, y, 15, c); }
  }
  // 곱슬머리: 머리보다 넓은 타원 덩어리 + 바깥으로 삐친 곱슬 (3톤)
  ell(g, 12, 9.2, 8.5, 7, 6.5, 8.2, (x, y, z) => pick(x, y, z, C.hair, C.hairD, C.hairL, .3, .22), (x, y, z) => y >= 9 && !(x >= 17 && y <= 9));
  for (let k = 0; k < 90; k++) {           // 표면에 돋은 곱슬 송이
    const a = hash3(k, 1, 7) * Math.PI * 2, b = hash3(k, 2, 9) * Math.PI * .55;
    const x = Math.round(12 + Math.cos(a) * Math.sin(b) * 7.4), z = Math.round(8.5 + Math.sin(a) * Math.sin(b) * 8.6), y = Math.round(9.4 + Math.cos(b) * 6.8);
    if (y >= 9 && y < 17 && x < 18) g.set(x, y, z, hash3(k, 3, 3) < .5 ? C.hairD : C.hairL);
  }
  // 뒤통수 매듭 + 뒤로 날리는 꼬리 두 가닥 (물결)
  g.fill(5, 7, 7, 5, 8, 10, C.bandD); g.set(5, 9, 8, C.band);
  const tail = (z0, y0, dy) => { for (let i = 0; i <= 5; i++) { const x = 4 - i, y = Math.round(y0 - i * dy + (i % 2 ? .6 : 0)), z = z0 + (i >= 3 ? 1 : 0); if (x < 0) break; g.set(x, y, z, C.band); g.set(x, y - 1, z, C.bandD); } };
  tail(7, 9, .35); tail(10, 8, .7);
  return { g, origin: [12.5, 0, 9], eyes: [[(18.7 - 12.5) * H, 5 * H, (5.5 - 9) * H], [(18.7 - 12.5) * H, 5 * H, (12.5 - 9) * H]] };
}

// ---------------------------------------------------------------- 몸통 (x11 × y11 × z18): 짧고 넓은 몸통, 목을 덮는 승모근
function torso() {
  const g = new VoxGrid(11, 11, 18);
  const vest = (x, y, z) => shade(pick(x, y, z, C.denim, C.denimD, C.denimL), y >= 6 ? 1.04 : .96);
  for (let y = 0; y <= 8; y++) {
    const z0 = y <= 1 ? 3 : y <= 4 ? 2 : 0, z1 = 17 - z0;
    for (let z = z0; z <= z1; z++) for (let x = 0; x <= 9; x++) {
      let c = vest(x, y, z);
      if (x === 9 && z >= 6 && z <= 11) c = (y === 5 && z !== 8 && z !== 9) ? C.teeD : C.tee;   // 열린 앞섶의 흰 티 (가슴 아래 그늘)
      if (y <= 1) c = C.belt;
      g.set(x, y, z, c);
    }
  }
  // 가슴 근육이 티를 밀어냄
  for (let y = 5; y <= 7; y++) for (let z = 6; z <= 11; z++) g.set(10, y, z, y === 5 ? C.teeD : C.tee);
  g.set(10, 6, 8, C.teeD); g.set(10, 6, 9, C.teeD); g.set(10, 7, 8, C.teeD); g.set(10, 7, 9, C.teeD);
  g.fill(9, 0, 8, 10, 1, 9, C.buckle); g.set(10, 0, 8, 0x8a8478);              // 버클
  for (const z of [2, 3, 14, 15]) { g.set(9, 6, z, C.denimD); g.set(9, 7, z, C.denimD); }   // 가슴 주머니
  g.set(9, 7, 2, C.buckle); g.set(9, 7, 15, C.buckle);
  // 승모근·조끼 어깨끈: 목 둘레로 솟아 머리를 감쌈 (구부정한 실루엣)
  for (let y = 9; y <= 10; y++) for (let z = 2; z <= 15; z++) for (let x = 2; x <= 8; x++) {
    if (z >= 6 && z <= 11 && x >= 4) continue;                                // 목 자리 (머리가 들어앉음)
    if (y === 10 && (z <= 3 || z >= 14)) continue;
    g.set(x, y, z, vest(x, y, z));
  }
  for (const z of [5, 12]) { g.set(9, 8, z, C.denimD); g.set(9, 9, z, C.denimD); g.set(8, 10, z, C.denimD); }   // 옷깃
  // 찢어낸 진동 둘레: 흰 실밥이 너덜너덜
  for (const z of [0, 17]) for (let y = 5; y <= 8; y++) for (let x = 0; x <= 9; x++) if ((y === 5 || x === 0 || x === 9 || y === 8) && hash3(x, y, z) < .6) g.set(x, y, z, C.fray);
  for (const z of [1, 16]) for (let x = 1; x <= 8; x += 2) if (hash3(x, 4, z) < .65) g.set(x, 4, z, C.fray);
  // 등: 바랜 패치 + 솔기
  for (let y = 3; y <= 7; y++) for (let z = 6; z <= 11; z++) g.set(0, y, z, (y === 3 || y === 7) && z % 2 ? 0x86837a : C.patch);
  for (let y = 2; y <= 8; y++) g.set(0, y, 9, C.denimD);
  return { g, origin: [5, 0, 9] };
}

// ---------------------------------------------------------------- 팔 (x9 × y16 × z9): 아래 9칸 = 큰 주먹·붕대·팔뚝, 위 7칸 = 이두·거대한 어깨
function arm(front) {
  const g = new VoxGrid(9, 16, 9);
  const sk = (x, y, z) => shade(C.skin, (y >= 12 ? 1.06 : 1) * (x <= 1 ? .9 : 1));
  // 주먹 y0..4: 9×9, 둥글게, 손가락 홈·마디·엄지
  rbox(g, 0, 0, 0, 8, 4, 8, sk, 2);
  for (const z of [2, 4, 6]) for (let y = 1; y <= 3; y++) g.set(8, y, z, C.skinD);
  g.fill(8, 4, 1, 8, 4, 7, C.skinL); g.fill(7, 4, 1, 7, 4, 7, C.skinL);
  g.fill(6, 1, front ? 0 : 8, 8, 2, front ? 0 : 8, C.skinD);                   // 엄지
  // 손목 붕대 y5..6
  for (let y = 5; y <= 6; y++) rbox(g, 1, y, 1, 7, y, 7, (x, yy, z) => (x + z + yy) % 3 ? C.wrap : C.wrapD);
  // 굵은 팔뚝 y7..8
  for (let y = 7; y <= 8; y++) rbox(g, 1, y, 1, 7, y, 7, sk);
  // 이두 y9..11 (+앞으로 볼록)
  for (let y = 9; y <= 11; y++) { rbox(g, 1, y, 1, 7, y, 7, sk); if (y >= 10) g.fill(8, y, 2, 8, y, 6, C.skin); }
  for (let z = 1; z <= 7; z++) g.set(1, 9, z, C.skinD);                       // 삼두 그늘
  // 거대한 어깨 y12..15 (둥근 덩어리)
  ell(g, 4.5, 12.6, 4.5, 4.6, 3.6, 4.6, (x, y, z) => shade(C.skin, y >= 14 ? 1.1 : 1.02), (x, y) => y >= 12);
  for (let z = 1; z <= 7; z++) g.set(4, 12, z, C.skinD);                      // 어깨·이두 경계
  if (front) {
    // 오른쪽 위팔 바깥면(z=8): 똬리 튼 뱀 문신 (머리가 위를 봄)
    const S = ['.##.', '#..#', '.##.', '...#', '###.'];
    S.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(2 + c, 13 - r, 8, C.tattoo); }));
    g.set(6, 14, 8, C.tattoo); g.set(6, 14, 7, C.tattoo);
  } else {
    // 왼팔 팔뚝 흉터 (바깥면 z=0)
    g.set(3, 8, 0, C.scar); g.set(4, 7, 0, C.scar); g.set(5, 8, 0, C.scar); g.set(3, 7, 1, C.scar);
  }
  return g;
}

// ---------------------------------------------------------------- 다리 (x13 × y18 × z9): 아래 10칸 = 투박한 하이탑+롤업, 위 8칸 = 찢어진 청바지
function leg() {
  const g = new VoxGrid(13, 18, 9);
  for (let y = 9; y <= 17; y++) for (let z = 0; z <= 8; z++) for (let x = 1; x <= 9; x++) {
    if ((x === 1 || x === 9) && (z === 0 || z === 8)) continue;
    g.set(x, y, z, shade(pick(x, y, z, C.jean, C.jeanD, C.jeanL, .25, .12), y >= 15 ? 1.03 : .97));
  }
  for (let y = 7; y <= 8; y++) rbox(g, 0, y, 0, 10, y, 8, () => (y === 8 ? C.jeanL : 0x9ab2d4));   // 걷어 올린 밑단
  // 무릎 찢어짐: 맨살 + 흰 실
  g.fill(9, 11, 2, 9, 13, 6, C.skin); for (const [y, z] of [[14, 3], [10, 2], [12, 7], [14, 5], [11, 1]]) g.set(9, y, z, C.thread);
  g.fill(1, 14, 0, 4, 14, 0, C.jeanL); g.fill(2, 15, 8, 5, 15, 8, C.jeanL);
  g.fill(1, 15, 2, 1, 17, 6, C.jeanD);                                         // 뒷주머니
  // 투박한 하이탑: 두꺼운 밑창 y0..1 (홈), 갑피 y2..6 (빨강), 흰 앞코·옆판·발목, 끈
  rbox(g, 0, 0, 0, 12, 1, 8, (x, y) => (y === 0 && x % 2 ? 0xb8b0a2 : C.sole), 1);
  rbox(g, 0, 2, 0, 11, 6, 8, (x, y, z) => C.shoe, 1);
  for (let y = 2; y <= 6; y++) for (let z = 0; z <= 8; z++) if (y >= 5 && 11 - y < 0) g.set(11, y, z, -1);
  g.fill(10, 5, 0, 11, 6, 8, -1); g.fill(11, 4, 0, 11, 4, 8, -1);             // 발등 경사
  rbox(g, 9, 2, 0, 12, 3, 8, () => C.white, 1);                                 // 흰 앞코
  for (const z of [0, 8]) { g.fill(3, 2, z, 7, 4, z, C.white); g.fill(4, 5, z, 6, 5, z, C.white); g.set(5, 3, z, C.shoeD); }   // 옆 흰 판 + 별
  g.fill(1, 6, 0, 8, 6, 8, C.white); g.fill(2, 6, 2, 7, 6, 6, C.shoe);          // 흰 발목 테두리
  for (let x = 6; x <= 9; x++) for (let z = 2; z <= 6; z++) if ((x + z) % 2 && g.get(x, x <= 8 ? 5 : 4, z) >= 0) g.set(x, x <= 8 ? 5 : 4, z, C.white);   // 끈
  g.fill(0, 2, 1, 0, 5, 7, C.shoeD);                                            // 뒤꿈치
  return g;
}

// ---------------------------------------------------------------- 조립
export function buildHeroV2(r) {
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
  const hd = head(), to = torso(), armF = arm(true), armB = arm(false), lg = leg();
  const AH = 16, AU = 7, AL = 9;          // 팔: 위 7칸(이두·어깨), 아래 9칸(팔뚝·붕대·주먹)
  const LHn = 18, LU = 8, LL = 10;        // 다리: 위 8칸(청바지), 아래 10칸(롤업·하이탑)
  const THn = 9;                          // 몸통 9칸 (승모근은 그 위로 2칸 솟음)
  const LH = LHn * H, TH = THn * H;
  const headM = mk(hd.g, hd.origin, 0);
  const torsoM = mk(to.g, to.origin, THn - 1, 0);
  const armUF = mk(slice(armF, AL, AH - 1), [4.5, AU, 4.5], AU - 1, 0), armLF = mk(slice(armF, 0, AL - 1), [4.5, AL, 4.5], AL - 1);
  const armUB = mk(slice(armB, AL, AH - 1), [4.5, AU, 4.5], AU - 1, 0), armLB = mk(slice(armB, 0, AL - 1), [4.5, AL, 4.5], AL - 1);
  const legUM = mk(slice(lg, LL, LHn - 1), [5.5, LU, 4.5], LU - 1, 0), legLM = mk(slice(lg, 0, LL - 1), [5.5, LL, 4.5], LL - 1);
  // 어깨는 턱보다 높이(몸통 위 3칸) 솟고, 머리는 그 사이에 들어앉음 → 원화의 구부정한 덩치 실루엣
  const hipZ = 0.21, shZ = 11.5 * H, shY = LH + TH + 3 * H;
  return {
    height: (LHn + THn + 16) * H,
    armLen: AH * H, armULen: AU * H, handLen: AL * H,
    legLen: LH, legULen: LU * H,
    eyes: hd.eyes,                        // 광폭화 눈빛 위치 (머리 부위 로컬, 미터)
    lowGuard: true,                       // 맨손 대기 자세를 낮게 (큰 주먹이 얼굴을 가리지 않게)
    armSpread: .32, legSpread: .12,       // 기본으로 팔·다리를 바깥으로 벌림 (A자 실루엣)
    parts: {
      legB:  { ...legUM, pivot: [0, LH, -hipZ] },
      shinB: { ...legLM, pivot: [0, -LU * H, 0], parent: 'legB' },
      armB:  { ...armUB, pivot: [0, shY, -shZ] },
      handB: { ...armLB, pivot: [0, -AU * H, 0], parent: 'armB' },
      torso: { ...torsoM, pivot: [0, LH, 0] },
      head:  { ...headM, pivot: [0, LH + TH, 0] },
      legF:  { ...legUM, pivot: [0, LH, hipZ] },
      shinF: { ...legLM, pivot: [0, -LU * H, 0], parent: 'legF' },
      armF:  { ...armUF, pivot: [0, shY, shZ] },
      handF: { ...armLF, pivot: [0, -AU * H, 0], parent: 'armF' },
    },
  };
}
