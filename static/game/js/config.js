// =============================================================
//  기획 수치 모음 — 밸런스/기획 실험은 대부분 이 파일만 고치면 됩니다.
// =============================================================

export const V = 0.09;            // 캐릭터 복셀 1칸 크기(미터). 블록 1칸 = 1m
export const GRAVITY = 24;
export const LANE = { zMin: -3.2, zMax: 2.6 }; // 걸어다닐 수 있는 깊이(앞뒤) 범위

// ---------------- 플레이어 ----------------
export const PLAYER = {
  hp: 100,
  speed: 4.2,      // 좌우 이동 속도
  zSpeed: 3.0,     // 앞뒤 라인 이동 속도
  jump: 8.2,
  invulnAfterGetup: 0.7,
};

// ---------------- 동료 로봇 '볼트' ----------------
export const BOT = {
  hp: 80,
  speed: 3.9,
  koTime: 9,             // 쓰러진 뒤 자가 수리까지 걸리는 시간
  koReviveRatio: 0.35,
  spinCooldown: 7,
  rescueHpRatio: 0.4,
  tactics: [
    { id: 'assault', name: '돌격', desc: '가장 가까운 적을 공격' },
    { id: 'guard',   name: '호위', desc: '플레이어 주변 적 우선, 곁을 지킴' },
    { id: 'pincer',  name: '협공', desc: '플레이어가 때린 적의 반대편에서 공격 (백어택)' },
  ],
};

// ---------------- 공격 정의 ----------------
// startup: 선딜 / active: 판정 / recovery: 후딜 (초)
// range: 앞쪽 판정 거리 [시작, 끝] / depth: 앞뒤(라인) 허용 거리
// zone: 노리는 부위 (high=머리·팔, mid=팔·몸, low=다리)
export const ATTACKS = {
  // 플레이어 맨손 콤보
  jab:     { startup: .05, active: .08, recovery: .14, range: [.1, 1.2], depth: .5,  dmg: 6,  knock: 1.0, zone: 'high', hitstop: .045, anim: 'punchF' },
  cross:   { startup: .06, active: .08, recovery: .16, range: [.1, 1.3], depth: .5,  dmg: 8,  knock: 1.4, zone: 'high', hitstop: .055, anim: 'punchB' },
  kick:    { startup: .10, active: .10, recovery: .30, range: [.1, 1.5], depth: .55, dmg: 14, knock: 5.5, zone: 'mid',  hitstop: .10, anim: 'kick', knockdown: true, finisher: true },
  flykick: { startup: .04, active: .40, recovery: .10, range: [0, 1.3],  depth: .55, dmg: 12, knock: 5,   zone: 'high', hitstop: .08, anim: 'flykick', knockdown: true },
  // 무기 (dmg는 무기 공격력에 곱하는 배율)
  swing:   { startup: .12, active: .10, recovery: .20, range: [.1, 1.0], depth: .6,  dmg: 1.0, knock: 2.5, zone: 'high', hitstop: .07, anim: 'swing', weapon: true },
  pThrow:  { startup: .10, active: .05, recovery: .22, anim: 'throw', projectile: 'weapon' },
  smash:   { startup: .18, active: .10, recovery: .34, range: [.1, 1.0], depth: .65, dmg: 1.5, knock: 6,   zone: 'high', hitstop: .12, anim: 'swing', weapon: true, knockdown: true, finisher: true },
  // 동료
  botJab:  { startup: .10, active: .08, recovery: .22, range: [.1, 1.2], depth: .5,  dmg: 5,  knock: 1.2, zone: 'high', hitstop: .04, anim: 'punchF' },
  botKick: { startup: .14, active: .10, recovery: .40, range: [.1, 1.4], depth: .55, dmg: 10, knock: 5,   zone: 'mid',  hitstop: .08, anim: 'kick', knockdown: true },
  botSpin: { startup: .15, active: .30, recovery: .35, range: [0, 1.8],  depth: .9,  dmg: 11, knock: 6,   zone: 'mid',  hitstop: .08, anim: 'spin', knockdown: true, aoe: true },
  // 적
  ePunch:  { startup: .38, active: .10, recovery: .45, range: [.1, 1.15], depth: .45, dmg: 7,  knock: 1.6, zone: 'high', hitstop: .06, anim: 'punchF', needArms: true },
  eKick:   { startup: .45, active: .10, recovery: .50, range: [.1, 1.3],  depth: .45, dmg: 8,  knock: 3,   zone: 'mid',  hitstop: .06, anim: 'kick' },
  eSlam:   { startup: .65, active: .12, recovery: .75, range: [-.2, 1.7], depth: .8,  dmg: 18, knock: 6,   zone: 'high', hitstop: .12, anim: 'slam', knockdown: true, telegraph: true, shake: .25, needArms: true },
  eCharge: { startup: .70, active: .85, recovery: .90, range: [-.2, .9],  depth: .55, dmg: 14, knock: 7,   zone: 'mid',  hitstop: .10, anim: 'charge', knockdown: true, telegraph: true, dash: 9.5, needLegs: true },
  eThrow:  { startup: .50, active: .05, recovery: .60, anim: 'throw', projectile: 'brick', dmg: 8, needArms: true },
  eFuse:   { startup: .80, active: .05, recovery: 0, anim: 'fuse', telegraph: true, explode: { radius: 1.9, dmg: 24 } },
};

// ---------------- 적 ----------------
// 생김새 = 행동 원칙: 모델(외형)마다 고유 AI와 공격을 가집니다.
export const ENEMIES = {
  grunt:   { name: '골목 깡패',    model: 'grunt',   hp: 38,  speed: 2.3,  scale: 1,    ai: 'brawler', attacks: ['ePunch'],                    scrap: [1, 2] },
  charger: { name: '돌격 헬멧',    model: 'charger', hp: 60,  speed: 1.7,  scale: 1.08, ai: 'charger', attacks: ['eCharge'],                   scrap: [2, 3] },
  thrower: { name: '벽돌 배달부',  model: 'thrower', hp: 32,  speed: 2.0,  scale: 1,    ai: 'kiter',   attacks: ['eThrow'],                    scrap: [1, 3] },
  brute:   { name: '철거 덩치',    model: 'brute',   hp: 130, speed: 1.35, scale: 1.3,  ai: 'brawler', attacks: ['eSlam', 'ePunch'],           scrap: [3, 5], poise: 14 },
  bomber:  { name: '폭죽 꼬마',    model: 'bomber',  hp: 14,  speed: 3.7,  scale: .72,  ai: 'rusher',  attacks: ['eFuse'],                     scrap: [1, 1] },
  boss:    { name: '철거반장 굴삭', model: 'boss',    hp: 520, speed: 1.6,  scale: 1.55, ai: 'boss',    attacks: ['eSlam', 'eCharge', 'eThrow'], scrap: [30, 30], poise: 30, boss: true },
};

// 스테이지별 적 등장 가중치
export const SPAWN_POOLS = [
  { grunt: 5, thrower: 2, bomber: 1.2, charger: 1 },
  { grunt: 4, thrower: 2, bomber: 1.5, charger: 2, brute: 1.5 },
];

// ---------------- 무기 ----------------
// sever: 부위 파괴 배율 (날붙이는 높게, 둔기는 낮게)
export const WEAPONS = {
  pipe:    { name: '쇠파이프',      dmg: 15, reach: .55, dur: 14, sever: .7,  knock: 1.2, throwDmg: 18 },
  machete: { name: '마체테',        dmg: 12, reach: .45, dur: 12, sever: 2.4, knock: .8,  throwDmg: 16 },
  block:   { name: '콘크리트 블록', dmg: 24, reach: .15, dur: 5,  sever: 1.2, knock: 1.6, throwDmg: 30, slow: 1.4 },
};
export const FIST_SEVER = .55;

// ---------------- 함정/오브젝트 ----------------
export const TRAPS = {
  spike: { cycle: 3.2, warnAt: 2.0, upAt: 2.5, dmg: 15 },
  barrel: { radius: 2.3, dmg: 30, fuse: .25 },
};

// ---------------- 바이옴 ----------------
// 블록 색만 바꿔도 분위기가 크게 달라지는지 검증하기 위한 3종
export const BIOMES = {
  plains: {
    name: '폐허 초원', sky: [0.56, 0.76, 0.96], fog: [0.66, 0.80, 0.95],
    grass: 0x5da130, dirt: 0x7a5532, lane: 0x9c8d73, stone: 0x7d7d7d,
    wall: 0x9a9a96, wall2: 0x6f6f6c, glass: 0x2b3b55, wood: 0x6b4a2b, leaves: 0x3c8a2a, flora: 'tree',
  },
  desert: {
    name: '모래 공업지대', sky: [0.98, 0.84, 0.62], fog: [0.97, 0.86, 0.70],
    grass: 0xdcc581, dirt: 0xcfb172, lane: 0xb39a68, stone: 0xc2a46b,
    wall: 0xb5654a, wall2: 0x8f4b37, glass: 0x3a2a22, wood: 0x5a8c3a, leaves: 0x4f9a3f, flora: 'cactus',
  },
  snow: {
    name: '얼어붙은 항구', sky: [0.74, 0.82, 0.92], fog: [0.82, 0.87, 0.94],
    grass: 0xf2f6f8, dirt: 0x6e5038, lane: 0xa5b0ba, stone: 0x7f8c99,
    wall: 0x7c8a97, wall2: 0x56626e, glass: 0x9cc8e8, wood: 0x4b3420, leaves: 0x2f5a40, flora: 'spruce',
  },
};

// ---------------- 런(한 판) 안의 특성 ----------------
export const PERKS = [
  { id: 'finisher', name: '마무리 강화',   desc: '콤보 마지막 타 피해 +40%' },
  { id: 'durable',  name: '튼튼한 손잡이', desc: '무기 내구도 +60%' },
  { id: 'ration',   name: '전투 식량',     desc: '적 처치 시 체력 +3' },
  { id: 'sever',    name: '해체 전문가',   desc: '부위 파괴 피해 +60%' },
  { id: 'overclock',name: '볼트 오버클럭', desc: '볼트 이동·공격 속도 +25%' },
  { id: 'botpower', name: '볼트 강화 펀치', desc: '볼트 공격력 +35%' },
  { id: 'blast',    name: '방폭 조끼',     desc: '폭발 피해 -60%' },
  { id: 'thrower',  name: '투척의 달인',   desc: '던지기 피해 +80%' },
  { id: 'scrapper', name: '고물상',        desc: '부품 획득량 +50%' },
  { id: 'tough',    name: '강인함',        desc: '최대 체력 +25 (즉시 회복)' },
];

// ---------------- 영구 업그레이드 (정비소) ----------------
export const UPGRADES = [
  { id: 'p_hp',    group: '청소반원', name: '체력 단련',        desc: '최대 체력 +15',              max: 5, cost: [15, 30, 50, 75, 105] },
  { id: 'p_pow',   group: '청소반원', name: '근력 단련',        desc: '공격력 +8%',                 max: 5, cost: [20, 35, 55, 80, 110] },
  { id: 'b_hp',    group: '볼트',     name: '장갑판 보강',      desc: '볼트 최대 체력 +20',         max: 5, cost: [12, 25, 40, 60, 85] },
  { id: 'b_pow',   group: '볼트',     name: '강화 주먹',        desc: '볼트 공격력 +15%',           max: 5, cost: [15, 30, 45, 65, 90] },
  { id: 'b_ai',    group: '볼트',     name: '전술 칩',          desc: 'Lv1: 호위 전술 / Lv2: 협공 전술 해금', max: 2, cost: [25, 60] },
  { id: 'b_spin',  group: '볼트',     name: '회전 차기 모듈',   desc: '적 2명 이상 근접 시 광역 회전 차기', max: 1, cost: [45] },
  { id: 'b_rescue',group: '볼트',     name: '구조 프로토콜',    desc: '런마다 1회, 쓰러진 플레이어를 체력 40%로 부활', max: 1, cost: [80] },
];
