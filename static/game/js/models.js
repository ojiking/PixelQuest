// 절차적 복셀 모델 정의 (캐릭터는 부위별로 분리 → 부위 파괴 가능)
import { V } from './config.js';
import { VoxGrid, meshGrid } from './voxel.js';

const cache = new Map();
export function getModel(r, key) {
  if (!cache.has(key)) {
    const b = BUILDERS[key];
    if (!b) throw new Error('모델 없음: ' + key);
    cache.set(key, b(r));
  }
  return cache.get(key);
}

export const WOUND = [0xc81e24, 0x9e1219, 0xe0382c, 0xb3161d];
const darken = (c, f = 0.75) =>
  (Math.floor(((c >> 16) & 255) * f) << 16) | (Math.floor(((c >> 8) & 255) * f) << 8) | Math.floor((c & 255) * f);

// ---------------------------------------------------------------- 머리
function face(g, s, p, eyeY = 3) {
  g.set(s - 1, eyeY, 2, p.eye ?? 0x151515);
  g.set(s - 1, eyeY, s - 1, p.eye ?? 0x151515);
  g.fill(s - 1, 1, 3, s - 1, 1, s - 2, p.mouth ?? darken(p.skin, 0.7));
}
const HEADS = {
  hair(g, s, p) {
    g.fill(0, 0, 1, s - 1, s - 1, s, p.skin);
    g.fill(0, s - 1, 1, s - 1, s - 1, s, p.hair);
    g.fill(0, s - 3, 1, 1, s - 1, s, p.hair);
    g.fill(0, s - 2, 1, s - 2, s - 2, 1, p.hair);
    g.fill(0, s - 2, s, s - 2, s - 2, s, p.hair);
    face(g, s, p);
  },
  hairBand(g, s, p) {
    HEADS.hair(g, s, p);
    for (let x = 0; x < s; x += 2) for (let z = 1; z <= s; z += 2) if ((x + z) % 4 === 1) g.set(x, s, z, p.hair); // 삐죽 머리
    for (let x = 0; x < s; x++) { g.set(x, s - 2, 1, p.band); g.set(x, s - 2, s, p.band); }
    for (let z = 1; z <= s; z++) { g.set(0, s - 2, z, p.band); g.set(s - 1, s - 2, z, p.band); }
  },
  bald(g, s, p) {
    g.fill(0, 0, 1, s - 1, s - 1, s, p.skin);
    face(g, s, p);
    g.fill(s - 1, 4, 2, s - 1, 4, 3, 0x2a1a10);
    g.fill(s - 1, 4, s - 2, s - 1, 4, s - 1, 0x2a1a10);
    g.fill(s - 1, 0, 2, s - 1, 1, s - 1, darken(p.skin, 0.8)); // 수염 자국
  },
  // 모히칸: 옆머리는 짧게 밀고(수염 자국 색), 가운데만 높게 세운 머리
  mohawk(g, s, p) {
    HEADS.bald(g, s, p);
    const stub = darken(p.skin, 0.78);
    g.fill(0, s - 1, 1, s - 1, s - 1, s, stub);
    g.fill(0, s - 3, 1, 0, s - 1, s, stub);
    const cz = Math.floor((s + 2) / 2);
    for (let x = 0; x < s; x++) {
      const top = x === 0 || x === s - 1 ? s : x === 1 || x === s - 2 ? s + 1 : s + 2;
      g.fill(x, s - 1, cz - 1, x, top, cz, p.hair);
    }
  },
  // 닌자 두건: 눈만 드러나고 뒤로 빨간 띠
  ninja(g, s, p) {
    g.fill(0, 0, 1, s - 1, s - 1, s, p.cloth);
    g.fill(s - 1, 3, 2, s - 1, 3, s - 1, p.skin);
    g.set(s - 1, 3, 2, 0x111111); g.set(s - 1, 3, s - 1, 0x111111);
    for (let z = 1; z <= s; z++) { g.set(0, 4, z, p.band); g.set(s - 1, 4, z, p.band); }
    g.set(0, 3, 0, p.band); g.set(0, 2, 0, p.band); // 뒤로 늘어진 띠
  },
  cap(g, s, p) {
    HEADS.hair(g, s, p);
    g.fill(0, s - 1, 1, s - 1, s, s, p.cap);
    g.fill(s, s - 1, 1, s, s - 1, s, darken(p.cap, 0.85)); // 챙
  },
  helmet(g, s, p) {
    g.fill(0, 0, 1, s - 1, s - 1, s, p.skin);
    face(g, s, p);
    g.fill(0, s - 2, 1, s - 1, s - 1, s, p.metal);
    g.fill(0, 1, 1, 1, s - 1, s, p.metal);
    g.fill(0, 2, 1, s - 1, s - 1, 1, p.metal);
    g.fill(0, 2, s, s - 1, s - 1, s, p.metal);
    const horn = 0xe9e2c8;
    for (const z of [0, s + 1]) { g.set(2, s - 1, z, horn); g.set(2, s, z, horn); g.set(3, s + 1, z, horn); g.set(4, s + 2, z, horn); }
  },
  hardhat(g, s, p) {
    g.fill(0, 0, 1, s - 1, s - 1, s, p.skin);
    face(g, s, p);
    g.fill(s - 1, 1, 2, s - 1, 1, s - 1, 0x4a2a15); // 콧수염
    g.fill(0, s - 1, 1, s - 1, s, s, p.hat);
    g.fill(0, s - 2, 0, s, s - 2, s + 1, darken(p.hat, 0.9)); // 챙
  },
  robot(g, s, p) {
    g.fill(0, 0, 1, s - 1, s - 1, s, p.metal);
    g.fill(0, 0, 1, s - 1, 0, s, p.joint);
    g.fill(s - 1, 2, 2, s - 1, 3, s - 1, p.visor);
    g.fill(s - 1, 4, 1, s - 1, 4, s, p.accent);
    const cz = Math.floor((s + 2) / 2);
    g.set(2, s, cz, p.joint); g.set(2, s + 1, cz, p.joint); g.set(2, s + 2, cz, p.accent);
  },
  bomb(g, s, p) {
    g.fill(0, 0, 1, s - 1, s - 1, s, p.skin);
    face(g, s, p, 2);
    g.fill(0, 3, 1, s - 1, s - 1, s, p.helm);
    for (const [x, z] of [[0, 1], [0, s], [s - 1, 1], [s - 1, s]]) g.set(x, s - 1, z, -1);
    const cz = Math.floor((s + 2) / 2);
    g.set(2, s, cz, 0x5a5a5a); g.set(2, s + 1, cz, 0xff8a1f); g.set(2, s + 2, cz, 0xffe14a);
  },
};

// ---------------------------------------------------------------- 몸통
const TORSOS = {
  jacket(g, o, p) {
    const { bx, tw, th, td } = o;
    g.fill(bx, 0, 0, bx + tw - 1, th - 1, td - 1, p.shirt);
    g.fill(bx + tw - 1, 1, 2, bx + tw - 1, th - 1, td - 3, p.tee);
    g.fill(bx, 0, 0, bx + tw - 1, 0, td - 1, 0x2a2018);
  },
  hoodie(g, o, p) {
    const { bx, tw, th, td } = o;
    g.fill(bx, 0, 0, bx + tw - 1, th - 1, td - 1, p.shirt);
    g.fill(bx + tw - 1, 1, 2, bx + tw - 1, 2, td - 3, darken(p.shirt, 0.8));
    g.fill(bx, th - 2, 1, bx, th - 1, td - 2, darken(p.shirt, 0.7));
  },
  leather(g, o, p) {
    const { bx, tw, th, td } = o;
    g.fill(bx, 0, 0, bx + tw - 1, th - 1, td - 1, p.shirt);
    g.fill(bx, th - 1, 0, bx + tw - 1, th - 1, 1, p.metal);
    g.fill(bx, th - 1, td - 2, bx + tw - 1, th - 1, td - 1, p.metal);
    g.fill(bx, 0, 0, bx + tw - 1, 0, td - 1, 0x1a1a1a);
    g.fill(bx + tw - 1, 3, 3, bx + tw - 1, 4, td - 4, p.metal);
  },
  vest(g, o, p) {
    const { bx, tw, th, td } = o;
    g.fill(bx, 0, 0, bx + tw - 1, th - 1, td - 1, p.tee);
    g.fill(bx, 0, 0, bx + tw - 2, th - 1, 0, p.shirt);
    g.fill(bx, 0, td - 1, bx + tw - 2, th - 1, td - 1, p.shirt);
    g.fill(bx + tw - 1, 0, 0, bx + tw - 1, th - 1, 1, p.shirt);
    g.fill(bx + tw - 1, 0, td - 2, bx + tw - 1, th - 1, td - 1, p.shirt);
    g.fill(0, 1, 1, bx - 1, th - 2, td - 2, p.pack);           // 가방 → 투척형
    g.fill(0, th - 1, 2, bx - 1, th - 1, td - 3, 0xb5523b);     // 벽돌
  },
  tank(g, o, p) {
    const { bx, tw, th, td } = o;
    g.fill(bx, 0, 0, bx + tw - 1, th - 1, td - 1, p.shirt);
    g.fill(bx, th - 1, 0, bx + tw - 1, th - 1, 1, p.skin);
    g.fill(bx, th - 1, td - 2, bx + tw - 1, th - 1, td - 1, p.skin);
    g.fill(bx + tw, 1, 1, bx + tw, 4, td - 2, p.shirt);          // 배
    g.fill(bx, 0, 0, bx + tw - 1, 0, td - 1, 0x3a2a1a);
  },
  ninja(g, o, p) {
    const { bx, tw, th, td } = o;
    g.fill(bx, 0, 0, bx + tw - 1, th - 1, td - 1, p.shirt);
    g.fill(bx, 1, 0, bx + tw - 1, 1, td - 1, p.band); // 허리띠
    for (let y = 2; y < th; y++) g.set(bx + tw - 1, y, Math.min(td - 1, 1 + y - 2), 0x333338); // 앞 대각선 끈
  },
  stripe(g, o, p) {
    const { bx, tw, th, td } = o;
    for (let y = 0; y < th; y++) g.fill(bx, y, 0, bx + tw - 1, y, td - 1, y % 2 ? p.shirt : p.tee);
  },
  safety(g, o, p) {
    const { bx, tw, th, td } = o;
    g.fill(bx, 0, 0, bx + tw, th - 1, td - 1, p.shirt);
    g.fill(bx + tw, 0, 0, bx + tw, 0, td - 1, -1);
    g.fill(bx + tw, th - 1, 0, bx + tw, th - 1, td - 1, -1);
    for (const y of [2, 4]) g.fill(bx, y, 0, bx + tw, y, td - 1, 0xe8f04a);
  },
  robot(g, o, p) {
    const { bx, tw, th, td } = o;
    g.fill(bx, 0, 0, bx + tw - 1, th - 1, td - 1, p.metal);
    g.fill(bx + tw - 1, 2, 1, bx + tw - 1, th - 2, td - 2, p.accent);
    const cz = Math.floor(td / 2);
    g.fill(bx + tw - 1, 3, cz - 1, bx + tw - 1, 4, cz, p.visor);
    g.fill(bx, 0, 0, bx + tw - 1, 0, td - 1, p.joint);
    g.fill(0, 2, 1, bx - 1, th - 2, td - 2, p.joint);            // 등 배터리
  },
};

// ---------------------------------------------------------------- 인간형 조립
function humanoid(r, o) {
  const p = o.pal;
  const s = o.headS ?? 6;
  const tw = o.tw ?? 4, th = o.th ?? 7, td = o.td ?? 7, bx = o.bx ?? 0, fx = o.fx ?? 0;
  const lw = o.lw ?? 3, lh = o.lh ?? 7, ld = o.ld ?? 3;
  const aw = o.aw ?? 3, ah = o.ah ?? 7, ad = o.ad ?? 3;
  const robot = o.robot;

  const head = new VoxGrid(s + 1, s + 3, s + 2);
  HEADS[o.head](head, s, p);

  const torso = new VoxGrid(bx + tw + fx, th, td);
  TORSOS[o.torso](torso, { bx, tw, th, td }, p);

  const arm = new VoxGrid(aw, ah, ad);
  if (robot) {
    arm.fill(0, 0, 0, aw - 1, ah - 1, ad - 1, p.metal);
    arm.fill(0, ah - 2, 0, aw - 1, ah - 1, ad - 1, p.accent);
    arm.fill(0, 0, 0, aw - 1, 0, ad - 1, p.joint);
    arm.fill(0, Math.floor(ah / 2), 0, aw - 1, Math.floor(ah / 2), ad - 1, p.joint);
  } else {
    arm.fill(0, 0, 0, aw - 1, ah - 1, ad - 1, p.skin);
    const sl = o.sleeve ?? 3;
    if (sl > 0) arm.fill(0, ah - sl, 0, aw - 1, ah - 1, ad - 1, p.sleeve ?? p.shirt);
    if (p.glove) arm.fill(0, 0, 0, aw - 1, 1, ad - 1, p.glove);
  }

  const leg = new VoxGrid(lw, lh, ld);
  leg.fill(0, 0, 0, lw - 1, lh - 1, ld - 1, p.pants);
  leg.fill(0, 0, 0, lw - 1, 0, ld - 1, p.shoes);
  if (robot) leg.fill(0, Math.floor(lh / 2), 0, lw - 1, Math.floor(lh / 2), ld - 1, p.joint);

  const LH = lh * V, TH = th * V;
  // 부위 메시 + 붉은 단면 변형들
  //  cut: 붙어있던 쪽(관절) 면이 붉음 / cutTB: 양쪽 면이 붉음 / cutB: 반대쪽 면만 붉음 / stump: 몸에 남는 붉은 단면
  const mk = (grid, origin, joint, far = null) => {
    const paint = (g, y) => {
      for (let z = 0; z < grid.d; z++) for (let x = 0; x < grid.w; x++) {
        if (grid.get(x, y, z) >= 0) g.set(x, y, z, WOUND[(x * 7 + z * 3 + y) % WOUND.length]);
      }
    };
    const copy = () => { const g = new VoxGrid(grid.w, grid.h, grid.d); g.data.set(grid.data); return g; };
    const cut = copy(); paint(cut, joint);
    const stump = new VoxGrid(grid.w, grid.h, grid.d); paint(stump, joint);
    const out = { ...meshGrid(r, grid, V, origin), cut: meshGrid(r, cut, V, origin), stump: meshGrid(r, stump, V, origin).mesh };
    if (far != null) {
      const tb = copy(); paint(tb, joint); paint(tb, far);
      const b = copy(); paint(b, far);
      out.cutTB = meshGrid(r, tb, V, origin);
      out.cutB = meshGrid(r, b, V, origin);
    }
    return out;
  };
  const slice = (g, y0, y1) => {
    const o = new VoxGrid(g.w, y1 - y0 + 1, g.d);
    for (let z = 0; z < g.d; z++) for (let y = y0; y <= y1; y++) for (let x = 0; x < g.w; x++) o.set(x, y - y0, z, g.get(x, y, z));
    return o;
  };
  // 팔 = 위팔 + 아래팔, 다리 = 허벅지 + 정강이 (팔꿈치/무릎에서 따로 잘림)
  const ahU = Math.ceil(ah / 2), ahL = ah - ahU;
  const lhU = Math.ceil(lh / 2), lhL = lh - lhU;
  const headM = mk(head, [s / 2, 0, (s + 2) / 2], 0);
  const torsoM = mk(torso, [bx + tw / 2, 0, td / 2], th - 1, 0);
  const armUM = mk(slice(arm, ahL, ah - 1), [aw / 2, ahU, ad / 2], ahU - 1, 0);
  const armLM = mk(slice(arm, 0, ahL - 1), [aw / 2, ahL, ad / 2], ahL - 1);
  const legUM = mk(slice(leg, lhL, lh - 1), [lw / 2, lhU, ld / 2], lhU - 1, 0);
  const legLM = mk(slice(leg, 0, lhL - 1), [lw / 2, lhL, ld / 2], lhL - 1);
  const hipZ = (td / 2 - ld / 2) * V;
  const shZ = (td / 2 + ad / 2) * V;

  return {
    height: (lh + th + s) * V,
    armLen: ah * V,
    armULen: ahU * V,
    handLen: ahL * V,
    legLen: LH,
    legULen: lhU * V,
    parts: {
      legB:  { ...legUM, pivot: [0, LH, -hipZ] },
      shinB: { ...legLM, pivot: [0, -lhU * V, 0], parent: 'legB' },
      armB:  { ...armUM, pivot: [0, LH + TH, -shZ] },
      handB: { ...armLM, pivot: [0, -ahU * V, 0], parent: 'armB' },
      torso: { ...torsoM, pivot: [0, LH, 0] },
      head:  { ...headM, pivot: [0, LH + TH, 0] },
      legF:  { ...legUM, pivot: [0, LH, hipZ] },
      shinF: { ...legLM, pivot: [0, -lhU * V, 0], parent: 'legF' },
      armF:  { ...armUM, pivot: [0, LH + TH, shZ] },
      handF: { ...armLM, pivot: [0, -ahU * V, 0], parent: 'armF' },
    },
  };
}

// ---------------------------------------------------------------- 단일 오브젝트
function single(r, w, h, d, origin, paint) {
  const g = new VoxGrid(w, h, d);
  paint(g);
  return meshGrid(r, g, V, origin);
}

const BUILDERS = {
  player: r => humanoid(r, {
    head: 'hairBand', torso: 'jacket', sleeve: 6,
    pal: { skin: 0xf1c27d, hair: 0x3b2a1a, band: 0xd23b3b, shirt: 0x2f6fd6, tee: 0xf0f0f0, pants: 0x2a2f3a, shoes: 0xe8e8e8 },
  }),
  bot: r => humanoid(r, {
    head: 'robot', torso: 'robot', robot: true, tw: 5, bx: 1, lh: 6,
    pal: { metal: 0x9aa3ad, accent: 0xff8a1f, visor: 0x22e0ff, joint: 0x4a4f57, pants: 0x6a727c, shoes: 0xff8a1f },
  }),
  bot_tank: r => humanoid(r, {
    head: 'robot', headS: 7, torso: 'robot', robot: true, tw: 6, td: 9, bx: 1, lh: 6, lw: 4, ld: 4, aw: 4, ad: 4, ah: 7,
    pal: { metal: 0x4f6178, accent: 0xf2c20f, visor: 0x7dff6a, joint: 0x2a313b, pants: 0x3c4a5c, shoes: 0xf2c20f },
  }),
  bot_atk: r => humanoid(r, {
    head: 'robot', torso: 'robot', robot: true, tw: 4, bx: 1, lh: 7,
    pal: { metal: 0xbcc3cc, accent: 0xe8402a, visor: 0xff3a3a, joint: 0x3a3f47, pants: 0x8a929c, shoes: 0xe8402a },
  }),
  grunt: r => humanoid(r, {
    head: 'hair', torso: 'hoodie', sleeve: 5,
    pal: { skin: 0xe0ac69, hair: 0x1a1a1a, shirt: 0x7a7f86, pants: 0x3a4a6a, shoes: 0x222222 },
  }),
  charger: r => humanoid(r, {
    head: 'helmet', torso: 'leather', sleeve: 2, tw: 5, aw: 3,
    pal: { skin: 0xd09060, metal: 0xb6bcc4, shirt: 0x7d2a2a, pants: 0x2b2b2b, shoes: 0x151515, glove: 0x3a2a1a },
  }),
  thrower: r => humanoid(r, {
    head: 'cap', torso: 'vest', bx: 2, sleeve: 2,
    pal: { skin: 0xf0c08a, hair: 0x6a3a1a, cap: 0xf2c230, shirt: 0x3f8a4a, tee: 0xe8e8e8, sleeve: 0xe8e8e8, pack: 0x8a5a2b, pants: 0x5a4a3a, shoes: 0x3a2a1a },
  }),
  brute: r => humanoid(r, {
    head: 'mohawk', torso: 'tank', tw: 5, td: 9, fx: 1, th: 8, lw: 4, ld: 4, aw: 4, ad: 4, ah: 8, sleeve: 0,
    pal: { skin: 0xc68642, hair: 0x1c1410, shirt: 0xdedede, pants: 0x2f3f5f, shoes: 0x1a1a1a },
  }),
  shielder: r => humanoid(r, {
    head: 'cap', torso: 'leather', tw: 5, sleeve: 4,
    pal: { skin: 0xd8a070, hair: 0x2a1a10, cap: 0x2f4a6a, shirt: 0x3a5a3a, metal: 0x8a8f96, pants: 0x2a2f3a, shoes: 0x151515, glove: 0x6a4a2a },
  }),
  ninja: r => humanoid(r, {
    head: 'ninja', torso: 'ninja', sleeve: 7, tw: 3, td: 7,
    pal: { skin: 0xe0b080, cloth: 0x16161c, band: 0xb3161d, shirt: 0x16161c, sleeve: 0x16161c, pants: 0x16161c, shoes: 0x0a0a0c, glove: 0x16161c },
  }),
  bomber: r => humanoid(r, {
    head: 'bomb', torso: 'stripe', sleeve: 3,
    pal: { skin: 0xf6d0a0, helm: 0x2a2a2a, shirt: 0xd94a2a, tee: 0xf2f2f2, pants: 0x3a3a5a, shoes: 0xd94a2a },
  }),
  boss: r => humanoid(r, {
    head: 'hardhat', headS: 7, torso: 'safety', tw: 5, td: 9, fx: 1, th: 8, lw: 4, ld: 4, aw: 4, ad: 4, ah: 8, sleeve: 3,
    pal: { skin: 0xd7a070, hat: 0xf2c20f, shirt: 0xf07a1a, sleeve: 0x3a5a8a, pants: 0x3a5a8a, shoes: 0x2a1a0a, glove: 0xe8d040 },
  }),

  // 무기 (+x 방향으로 뻗음, 원점 = 손)
  w_pipe: r => single(r, 14, 2, 2, [2, 1, 1], g => {
    g.fill(0, 0, 0, 13, 1, 1, 0x8a9099);
    g.fill(0, 0, 0, 0, 1, 1, 0x5e646c); g.fill(13, 0, 0, 13, 1, 1, 0x5e646c);
  }),
  w_machete: r => single(r, 13, 4, 1, [1.5, 2, 0.5], g => {
    g.fill(0, 1, 0, 3, 2, 0, 0x5a3a22);
    g.fill(4, 0, 0, 4, 3, 0, 0x333333);
    g.fill(5, 1, 0, 11, 3, 0, 0xd8dde3);
    g.fill(5, 1, 0, 11, 1, 0, 0xf4f6f8);
    g.fill(12, 2, 0, 12, 3, 0, 0xd8dde3);
  }),
  w_block: r => single(r, 6, 6, 6, [-0.5, 3, 3], g => {
    g.fill(0, 0, 0, 5, 5, 5, 0xa3a3a0);
    g.fill(1, 1, 0, 4, 4, 0, 0x6a6a68);
    g.fill(1, 1, 5, 4, 4, 5, 0x6a6a68);
  }),
  w_golf: r => single(r, 18, 4, 1, [2, 3.5, 0.5], g => {
    g.fill(0, 3, 0, 15, 3, 0, 0xc8ccd2);
    g.fill(0, 3, 0, 3, 3, 0, 0x222222);
    g.fill(15, 0, 0, 17, 2, 0, 0x3a3f46);
    g.fill(17, 0, 0, 17, 1, 0, 0x8a9099);
  }),
  w_chainsaw: r => single(r, 18, 5, 4, [2, 2, 2], g => {
    g.fill(0, 0, 0, 5, 4, 3, 0xe8731a);
    g.fill(1, 4, 1, 4, 4, 2, 0x1a1a1a);
    g.fill(2, 1, 0, 3, 2, 0, 0x3a3a3a); g.fill(2, 1, 3, 3, 2, 3, 0x3a3a3a);
    g.fill(6, 1, 1, 16, 2, 2, 0x9aa0a8);
    for (let x = 6; x <= 17; x += 2) { g.fill(x, 0, 1, x, 0, 2, 0x55595e); g.fill(x, 3, 1, x, 3, 2, 0x55595e); }
    g.fill(17, 1, 1, 17, 2, 2, 0x55595e);
  }),
  w_axe: r => single(r, 16, 8, 1, [1.5, 4.5, 0.5], g => {
    g.fill(0, 4, 0, 14, 4, 0, 0xb52a22);
    g.fill(0, 4, 0, 2, 4, 0, 0x1a1a1a);
    g.fill(11, 5, 0, 14, 6, 0, 0x8d939a);
    g.fill(10, 7, 0, 15, 7, 0, 0xe6eaee);
    g.fill(12, 1, 0, 13, 3, 0, 0x6f757c);
  }),
  w_bat: r => single(r, 15, 5, 5, [2, 2.5, 2.5], g => {
    g.fill(0, 2, 2, 5, 2, 2, 0x9a6a3a);
    g.fill(6, 1, 1, 14, 3, 3, 0xb07a45);
    g.fill(0, 2, 2, 1, 2, 2, 0x2a1a10);
    for (const [x, y, z] of [[8, 4, 2], [10, 0, 2], [11, 2, 4], [12, 2, 0], [13, 4, 1], [9, 2, 4], [14, 0, 3], [7, 2, 0], [12, 4, 3], [9, 0, 1]]) g.set(x, y, z, 0xd8d8d8);
  }),
  w_sledge: r => single(r, 15, 6, 3, [1.5, 2.5, 1.5], g => {
    g.fill(0, 2, 1, 12, 3, 1, 0x7a5232);
    g.fill(11, 0, 0, 14, 5, 2, 0x4a4e55);
    g.fill(11, 0, 0, 14, 0, 2, 0x6a6f77); g.fill(11, 5, 0, 14, 5, 2, 0x6a6f77);
  }),
  w_chain: r => single(r, 24, 3, 3, [1.5, 1.5, 1.5], g => { // 강철 체인: 굵은 고리 + 끝 쇳덩이
    g.fill(0, 1, 1, 2, 1, 1, 0x2a2a2a);
    for (let x = 3; x < 21; x++) {
      const c = Math.floor(x / 2) % 2 ? 0x9aa2ab : 0x5d636b;
      if (x % 4 < 2) { g.set(x, 1, 0, c); g.set(x, 1, 2, c); g.set(x, 0, 1, c); g.set(x, 2, 1, c); }
      else g.set(x, 1, 1, c);
    }
    g.fill(21, 0, 0, 23, 2, 2, 0x3e4349);
  }),
  w_shotgun: r => single(r, 16, 3, 2, [3.5, 1.5, 1], g => { // 개머리판 + 몸통 + 이중 총열 + 펌프
    g.fill(0, 0, 0, 3, 2, 1, 0x7a4a24); g.fill(0, 0, 0, 0, 2, 1, 0x4a2a14);
    g.fill(4, 1, 0, 6, 2, 1, 0x2a2a2e);
    g.fill(7, 2, 0, 15, 2, 1, 0x8a9099); g.fill(15, 2, 0, 15, 2, 1, 0x3a3e44);
    g.fill(8, 1, 0, 11, 1, 1, 0x7a4a24);
  }),
  w_flamer: r => single(r, 14, 5, 4, [3, 2, 2], g => { // 붉은 연료통 + 노즐 + 점화 불씨
    g.fill(0, 0, 0, 3, 4, 3, 0xc0392b); g.fill(0, 4, 1, 3, 4, 2, 0xe8e8e8);
    g.fill(1, 1, 0, 2, 3, 0, 0xf2d21a);
    g.fill(4, 2, 1, 11, 2, 2, 0x5d636b); g.fill(4, 1, 1, 5, 1, 2, 0x2a2a2a);
    g.fill(12, 2, 1, 13, 3, 2, 0x2a2a2a); g.set(13, 3, 1, 0xff8a1f);
  }),
  manhole: r => single(r, 2, 10, 10, [1, 5, 5], g => { // 맨홀 뚜껑 방패 (앞을 향한 원판)
    for (let y = 0; y < 10; y++) for (let z = 0; z < 10; z++) {
      const d = Math.hypot(y - 4.5, z - 4.5);
      if (d > 5) continue;
      const c = d > 4 ? 0x2c3035 : (y + z) % 3 === 0 ? 0x5d636b : 0x3e4349;
      g.set(0, y, z, c); g.set(1, y, z, d > 4 ? 0x2c3035 : 0x34383d);
    }
  }),
  w_manhole: r => single(r, 10, 2, 10, [0, 1, 5], g => { // 들고 휘두를 때: 원판을 앞으로
    for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) {
      const d = Math.hypot(x - 4.5, z - 4.5);
      if (d > 5) continue;
      g.set(x, 0, z, d > 4 ? 0x2c3035 : (x + z) % 3 === 0 ? 0x5d636b : 0x3e4349); g.set(x, 1, z, 0x34383d);
    }
  }),
  w_katana: r => single(r, 17, 2, 1, [1.5, 1, 0.5], g => {
    for (let x = 0; x < 4; x++) g.fill(x, 0, 0, x, 1, 0, x % 2 ? 0x1a1a1a : 0x8a1a1a);
    g.fill(4, 0, 0, 4, 1, 0, 0xc9a20f);
    g.fill(5, 1, 0, 16, 1, 0, 0xd8dde3); g.fill(5, 0, 0, 15, 0, 0, 0xf4f6f8);
  }),
  shuriken: r => single(r, 5, 1, 5, [2.5, 0.5, 2.5], g => {
    g.fill(2, 0, 0, 2, 0, 4, 0xb8bcc2); g.fill(0, 0, 2, 4, 0, 2, 0xb8bcc2); g.set(2, 0, 2, 0x4a4e55);
  }),
  dumpster: r => single(r, 20, 13, 10, [0, 0, 0], g => {
    g.fill(0, 1, 0, 19, 11, 9, 0x2e6b3a); g.fill(0, 12, 0, 19, 12, 9, 0x1f4a28);
    g.fill(1, 0, 1, 2, 0, 2, 0x1a1a1a); g.fill(17, 0, 7, 18, 0, 8, 0x1a1a1a);
    g.fill(3, 6, 9, 16, 7, 9, 0xd8d8d8);
  }),
  pole: r => single(r, 4, 72, 16, [2, 0, 8], g => {
    g.fill(0, 0, 6, 3, 71, 9, 0x9a9a96);
    g.fill(1, 65, 0, 2, 66, 15, 0x6a6a68);
    g.fill(0, 54, 10, 3, 60, 13, 0x6a6f74);
    for (let y = 20; y < 50; y += 6) g.fill(0, y, 6, 3, y, 9, 0xf2d21a); // 노란 경고 띠
  }),
  w_nunchaku_handle: r => single(r, 4, 2, 2, [0, 1, 1], g => { g.fill(0, 0, 0, 3, 1, 1, 0x8a5a2b); g.fill(0, 0, 0, 0, 1, 1, 0x1a1a1a); g.fill(3, 0, 0, 3, 1, 1, 0x1a1a1a); }),
  w_nunchaku: r => single(r, 10, 2, 5, [0, 1, 1], g => { // 쌍절곤: 막대 두 개 + 짧은 사슬
    g.fill(0, 0, 0, 3, 1, 1, 0x8a5a2b); g.fill(0, 0, 3, 3, 1, 4, 0x8a5a2b);
    g.fill(3, 0, 0, 3, 1, 1, 0x1a1a1a); g.fill(3, 0, 3, 3, 1, 4, 0x1a1a1a);
    g.set(4, 1, 1, 0x9aa2ab); g.set(5, 1, 2, 0x5d636b); g.set(4, 1, 3, 0x9aa2ab);
  }),
  w_flail_handle: r => single(r, 5, 2, 2, [1.5, 1, 1], g => { g.fill(0, 0, 0, 4, 1, 1, 0x6b4a2b); g.fill(4, 0, 0, 4, 1, 1, 0x4a4e55); }),
  w_flail: r => single(r, 17, 5, 5, [1.5, 2.5, 2.5], g => { // 철퇴: 손잡이 + 짧은 사슬 + 가시 쇠공
    g.fill(0, 2, 2, 4, 2, 2, 0x6b4a2b);
    for (let x = 5; x < 12; x++) g.set(x, 2, 2, x % 2 ? 0x9aa2ab : 0x5d636b);
    g.fill(12, 1, 1, 15, 3, 3, 0x3a3e44);
    for (const [x, y, z] of [[16, 2, 2], [13, 0, 2], [13, 4, 2], [13, 2, 0], [13, 2, 4], [14, 0, 2], [14, 4, 2]]) g.set(x, y, z, 0xc8cdd2);
  }),
  w_whip_handle: r => single(r, 4, 2, 1, [1.5, 1, 0.5], g => g.fill(0, 0, 0, 3, 1, 0, 0x3a2414)),
  w_chain_handle: r => single(r, 3, 2, 2, [1.5, 1, 1], g => g.fill(0, 0, 0, 2, 1, 1, 0x2a2a2a)),
  w_whip: r => single(r, 27, 2, 1, [1.5, 1, 0.5], g => { // 채찍: 가는 가죽 끈
    g.fill(0, 0, 0, 3, 1, 0, 0x3a2414);
    for (let x = 4; x < 27; x++) g.set(x, x < 16 ? 1 : 0, 0, x > 23 ? 0xb07a48 : x % 3 ? 0x6b4226 : 0x5a361e);
  }),
  w_pickaxe: r => single(r, 14, 9, 1, [1.5, 4.5, 0.5], g => {
    g.fill(0, 4, 0, 11, 4, 0, 0x7a5232);
    g.fill(11, 1, 0, 12, 7, 0, 0x8d939a);
    g.set(10, 0, 0, 0xc8cdd2); g.set(11, 0, 0, 0xc8cdd2); g.set(10, 8, 0, 0xc8cdd2); g.set(11, 8, 0, 0xc8cdd2);
  }),
  brick: r => single(r, 4, 2, 2, [2, 1, 1], g => g.fill(0, 0, 0, 3, 1, 1, 0xb5523b)),
  food: r => single(r, 3, 4, 3, [1.5, 0, 1.5], g => {
    g.fill(0, 0, 0, 2, 3, 2, 0xd9442b);
    g.fill(0, 3, 0, 2, 3, 2, 0xc8c8c8); g.fill(0, 0, 0, 2, 0, 2, 0xc8c8c8);
  }),
  scrap: r => single(r, 3, 3, 3, [1.5, 0, 1.5], g => {
    g.fill(1, 0, 0, 1, 2, 2, 0xd8b04a); g.fill(0, 1, 0, 2, 1, 2, 0xd8b04a); g.fill(0, 0, 1, 2, 2, 1, 0xb88a2a);
  }),
  crate: r => single(r, 9, 9, 9, [4.5, 0, 4.5], g => {
    g.fill(0, 0, 0, 8, 8, 8, 0xa77b4b);
    for (let i = 0; i < 9; i++) {
      for (const [a, b] of [[0, 0], [0, 8], [8, 0], [8, 8]]) { g.set(i, a, b, 0x6e4f2e); g.set(a, i, b, 0x6e4f2e); g.set(a, b, i, 0x6e4f2e); }
    }
    for (let y = 2; y < 8; y += 3) g.fill(0, y, 0, 8, y, 8, 0x8e6438);
  }),
  barrel: r => single(r, 8, 10, 8, [4, 0, 4], g => {
    g.fill(0, 0, 1, 7, 9, 6, 0xc0392b); g.fill(1, 0, 0, 6, 9, 7, 0xc0392b);
    for (const y of [1, 8]) { g.fill(0, y, 1, 7, y, 6, 0x5a1a14); g.fill(1, y, 0, 6, y, 7, 0x5a1a14); }
    g.fill(7, 4, 3, 7, 5, 4, 0xf2d21a); g.fill(3, 4, 7, 4, 5, 7, 0xf2d21a);
  }),
  spikePlate: r => single(r, 22, 1, 22, [11, 0, 11], g => {
    g.fill(0, 0, 0, 21, 0, 21, 0x4a4a4e);
    for (let x = 1; x < 22; x += 4) for (let z = 1; z < 22; z += 4) g.set(x, 0, z, 0x1a1a1a);
    for (let i = 0; i < 22; i++) { g.set(i, 0, 0, 0xc9a20f); g.set(i, 0, 21, 0xc9a20f); g.set(0, 0, i, 0xc9a20f); g.set(21, 0, i, 0xc9a20f); }
  }),
  spikes: r => single(r, 22, 6, 22, [11, 0, 11], g => {
    for (let x = 1; x < 22; x += 4) for (let z = 1; z < 22; z += 4) { g.fill(x, 0, z, x, 4, z, 0xb8bcc2); g.set(x, 5, z, 0xf0f0f0); }
  }),
};

// 주차된 승용차 (색만 다름)
for (let i = 0; i < 7; i++) {
  BUILDERS['car' + i] = r => {
    const col = [0xf2f2f2, 0x1c1c1e, 0xb8bcc2, 0xc0392b, 0x1f5aa8, 0x2e6b3a, 0xd8c8a0][i];
    const glass = 0x22334a;
    return single(r, 44, 15, 20, [0, 0, 0], g => {
      for (const wx of [8, 35]) for (const z0 of [0, 17]) g.fill(wx - 3, 0, z0, wx + 3, 5, z0 + 2, 0x1a1a1a);
      g.fill(0, 3, 1, 43, 8, 18, col);
      g.fill(11, 9, 2, 33, 14, 17, col);
      g.fill(12, 10, 2, 32, 13, 2, glass); g.fill(12, 10, 17, 32, 13, 17, glass);
      g.fill(33, 10, 3, 33, 13, 16, glass); g.fill(11, 10, 3, 11, 13, 16, glass);
      g.fill(43, 5, 2, 43, 6, 5, 0xfff3a0); g.fill(43, 5, 14, 43, 6, 17, 0xfff3a0);
      g.fill(0, 5, 2, 0, 6, 5, 0xd02020); g.fill(0, 5, 14, 0, 6, 17, 0xd02020);
      g.fill(0, 3, 1, 0, 3, 18, 0x333333); g.fill(43, 3, 1, 43, 3, 18, 0x333333);
    });
  };
}

export const WEAPON_MODEL = {
  pipe: 'w_pipe', machete: 'w_machete', block: 'w_block', golf: 'w_golf', chainsaw: 'w_chainsaw',
  axe: 'w_axe', bat: 'w_bat', sledge: 'w_sledge', chain: 'w_chain', pickaxe: 'w_pickaxe', whip: 'w_whip', flail: 'w_flail', nunchaku: 'w_nunchaku', shotgun: 'w_shotgun', flamer: 'w_flamer', katana: 'w_katana', manhole: 'w_manhole',
};
