// =============================================================
//  기획 수치 모음 — 밸런스/기획 실험은 대부분 이 파일만 고치면 됩니다.
// =============================================================

export const V = 0.09;            // 캐릭터 복셀 1칸 크기(미터). 블록 1칸 = 1m
export const GRAVITY = 24;
export const LANE = { zMin: -3.2, zMax: 4.7 }; // 걸어다닐 수 있는 깊이(앞뒤) 범위 — 화면 아래쪽까지

// ---------------- 플레이어 ----------------
export const PLAYER = {
  hp: 100,
  speed: 5.0,      // 좌우 이동 속도
  zSpeed: 3.8,     // 앞뒤 라인 이동 속도
  jump: 8.7,
  dashSpeed: 12,     // 대쉬 속도
  dashTime: 0.26,
  dashCooldown: 0.35,
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
  bashCooldown: 6,
  // 볼트 클래스: 정비소에서 선택
  classes: {
    tank:   { name: '방패형', desc: '튼튼한 몸으로 적을 끌어당기고 플레이어를 지킴', model: 'bot_tank', hp: 130, power: 0.8, speed: 3.5, scale: 1.08 },
    attack: { name: '공격형', desc: '빠르고 강하게 적을 썰어버림',                   model: 'bot_atk',  hp: 70,  power: 1.3, speed: 4.3, scale: 1.0 },
  },
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
  jab:     { startup: .05, active: .08, recovery: .10, range: [.1, 1.2], depth: .5,  dmg: 6,  knock: 1.0, zone: 'high', hitstop: .045, anim: 'punchF' },
  cross:   { startup: .06, active: .08, recovery: .12, range: [.1, 1.3], depth: .5,  dmg: 8,  knock: 1.4, zone: 'high', hitstop: .055, anim: 'punchB' },
  kick:    { startup: .09, active: .10, recovery: .22, range: [.1, 1.5], depth: .55, dmg: 14, knock: 5.5, zone: 'mid',  hitstop: .10, anim: 'kick', knockdown: true, finisher: true },
  flykick: { startup: .04, active: .40, recovery: .10, range: [0, 1.3],  depth: .55, dmg: 13, knock: 8,   zone: 'high', hitstop: .09, anim: 'flykick', knockdown: true },
  // 대쉬 어택: 몸통 박치기. 맞은 적이 멀리 날아가 다른 적과 부딪힘
  dashAtk: { startup: .03, active: .22, recovery: .28, range: [0, 1.25], depth: .6,  dmg: 12, knock: 12,  zone: 'mid',  hitstop: .12, anim: 'dashAtk', knockdown: true, launch: 3.2, momentum: true, shake: .18 },
  // 공중 무기 휘두르기
  airSlash: { startup: .06, active: .14, recovery: .12, range: [.1, 1.0], depth: .6, dmg: 1.2, knock: 5,   zone: 'high', hitstop: .09, anim: 'swing', weapon: true, knockdown: true },
  // 내려찍기: 공중에서 아래+공격. 착지 충격으로 쓰러진 적까지 짓밟음
  stomp:   { startup: .04, active: 9,   recovery: .25, range: [0, 1.15], depth: .8,  dmg: 16, knock: 3,   zone: 'head', hitstop: .12, anim: 'stomp', aoe: true, otg: true, stomp: true, knockdown: true, mode: 'crush', shake: .25 },
  // 무기 (dmg는 무기 공격력에 곱하는 배율)
  swing:   { startup: .12, active: .10, recovery: .20, range: [.1, 1.0], depth: .6,  dmg: 1.0, knock: 2.5, zone: 'high', hitstop: .07, anim: 'swing', weapon: true },
  // 무기 모션: swing=내려찍기, hslash/hswing=몸을 비트는 가로 휘두르기, golf=올려치기, saw=누르고 있으면 계속 갈기
  slash:   { startup: .07, active: .08, recovery: .14, range: [.1, 1.0], depth: .55, dmg: .8,  knock: 1.2, zone: 'arms', hitstop: .05, anim: 'hslash', weapon: true },
  slashF:  { startup: .10, active: .10, recovery: .26, range: [.1, 1.0], depth: .6,  dmg: 1.4, knock: 4,   zone: 'head', hitstop: .09, anim: 'hslash', weapon: true, knockdown: true, finisher: true },
  chop:    { startup: .20, active: .10, recovery: .30, range: [.1, 1.0], depth: .6,  dmg: 1.0, knock: 2.5, zone: 'mid',  hitstop: .09, anim: 'swing', weapon: true },
  chopF:   { startup: .26, active: .10, recovery: .42, range: [.1, 1.0], depth: .65, dmg: 1.6, knock: 6,   zone: 'mid',  hitstop: .14, anim: 'swing', weapon: true, knockdown: true, finisher: true, shake: .22 },
  golf:    { startup: .24, active: .10, recovery: .34, range: [.1, 1.1], depth: .6,  dmg: 1.0, knock: 2.5, zone: 'head', hitstop: .13, anim: 'golf', weapon: true, knockdown: true, launch: 9.5, finisher: true, shake: .16 },
  bash:    { startup: .14, active: .10, recovery: .25, range: [.1, 1.0], depth: .65, dmg: 1.0, knock: 3,   zone: 'mid',  hitstop: .08, anim: 'hswing', weapon: true },
  bashF:   { startup: .20, active: .10, recovery: .36, range: [.1, 1.0], depth: .7,  dmg: 1.5, knock: 8,   zone: 'high', hitstop: .13, anim: 'hswing', weapon: true, knockdown: true, finisher: true, shake: .2 },
  whip:    { startup: .10, active: .12, recovery: .20, range: [.2, 1.0], depth: .85, dmg: 1.0, knock: 1.5, zone: 'low',  hitstop: .05, anim: 'hswing', weapon: true },
  whipF:   { startup: .14, active: .14, recovery: .30, range: [.2, 1.0], depth: .9,  dmg: 1.4, knock: 2.5, zone: 'low',  hitstop: .08, anim: 'hswing', weapon: true, knockdown: true, finisher: true },
  // 채찍: 빠른 채찍질, 마무리는 적을 끌어당김 (knock 음수)
  lash:     { startup: .08, active: .08, recovery: .15, range: [.2, 1.0], depth: .45, dmg: 1.0, knock: .8, zone: 'arms', hitstop: .04, anim: 'swing', weapon: true },
  lashPull: { startup: .12, active: .10, recovery: .28, range: [.3, 1.0], depth: .5,  dmg: 1.3, knock: -11, zone: 'head', hitstop: .08, anim: 'hslash', weapon: true, hitstun: .5, finisher: true, pull: true },
  // 강철 체인 마무리: 제자리에서 돌며 주변을 휩쓸기
  chainSpin: { startup: .16, active: .42, recovery: .35, range: [0, 1.0], depth: 1.1, dmg: 1.4, knock: 8, zone: 'mid', hitstop: .1, anim: 'wspin', weapon: true, aoe: true, knockdown: true, finisher: true, shake: .2 },
  // 적이 무기를 휘두를 때 (예고 동작이 더 김)
  eWeapon:  { startup: .42, active: .10, recovery: .50, range: [.1, 1.0], depth: .5,  dmg: .7, knock: 2.5, zone: 'high', hitstop: .07, anim: 'swing',  weapon: true, needArms: true },
  eWeaponH: { startup: .42, active: .12, recovery: .50, range: [.1, 1.0], depth: .55, dmg: .7, knock: 3,   zone: 'mid',  hitstop: .07, anim: 'hswing', weapon: true, needArms: true },
  sledge:  { startup: .42, active: .10, recovery: .50, range: [.1, 1.0], depth: .7,  dmg: 1.0, knock: 5,   zone: 'high', hitstop: .15, anim: 'slam', weapon: true, knockdown: true, finisher: true, shake: .38,
             shock: { radius: 1.9, dmg: .35, zone: 'low' } },
  saw:     { startup: .12, active: 999, recovery: .15, range: [.1, .95], depth: .55, dmg: 1.0, knock: .3,  zone: 'all',  hitstop: 0, anim: 'saw', weapon: true, hold: true, tick: .09, hitstun: .22 },
  pThrow:  { startup: .10, active: .05, recovery: .22, anim: 'throw', projectile: 'weapon' },
  // 날아차기 해금 전의 약한 공중 공격
  airPunch: { startup: .04, active: .20, recovery: .10, range: [0, 1.05], depth: .5, dmg: 6, knock: 2, zone: 'high', hitstop: .05, anim: 'punchF' },
  // 4연타 콤보의 팔꿈치
  elbow:    { startup: .06, active: .08, recovery: .13, range: [.1, 1.1], depth: .5, dmg: 9, knock: 1.6, zone: 'high', hitstop: .06, anim: 'punchB' },
  pThrowBarrel: { startup: .14, active: .05, recovery: .22, anim: 'throw', projectile: 'barrel' },
  pThrowGib: { startup: .10, active: .05, recovery: .20, anim: 'throw', projectile: 'gib' },
  smash:   { startup: .18, active: .10, recovery: .34, range: [.1, 1.0], depth: .65, dmg: 1.5, knock: 6,   zone: 'high', hitstop: .12, anim: 'swing', weapon: true, knockdown: true, finisher: true },
  // 동료
  botJab:  { startup: .10, active: .08, recovery: .22, range: [.1, 1.2], depth: .5,  dmg: 5,  knock: 1.2, zone: 'high', hitstop: .04, anim: 'punchF' },
  botKick: { startup: .14, active: .10, recovery: .40, range: [.1, 1.4], depth: .55, dmg: 10, knock: 5,   zone: 'mid',  hitstop: .08, anim: 'kick', knockdown: true },
  botBash: { startup: .28, active: .30, recovery: .45, range: [-.1, 1.0], depth: .6,  dmg: 10, knock: 10,  zone: 'mid',  hitstop: .10, anim: 'dashAtk', knockdown: true, telegraph: true, dash: 8.5, shake: .15 },
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
  grunt:   { name: '골목 깡패',    model: 'grunt',   hp: 38,  speed: 2.3,  scale: 1,    ai: 'brawler', attacks: ['ePunch'],                    scrap: [1, 2], pickup: true, armed: { chance: .22, types: ['pipe', 'bat', 'machete', 'whip'] } },
  charger: { name: '돌격 헬멧',    model: 'charger', hp: 60,  speed: 1.7,  scale: 1.08, ai: 'charger', attacks: ['eCharge'],                   scrap: [2, 3] },
  thrower: { name: '벽돌 배달부',  model: 'thrower', hp: 32,  speed: 2.0,  scale: 1,    ai: 'kiter',   attacks: ['eThrow'],                    scrap: [1, 3] },
  brute:   { name: '철거 덩치',    model: 'brute',   hp: 130, speed: 1.35, scale: 1.3,  ai: 'brawler', attacks: ['eSlam', 'ePunch'],           scrap: [3, 5], poise: 14, pickup: true, armed: { chance: .35, types: ['sledge', 'pipe', 'axe', 'chain'] } },
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
// mode: cut=잘려서 날아감 / knock=맞아서 멀리 튕겨 나감 / crush=그 자리에서 박살 / saw=갈아서 절단
// fling: 떨어진 부위가 날아가는 세기 / bisect: 마무리 시 몸통이 반으로 갈릴 확률 / zone: 노리는 부위(공격 기본값 덮어씀)
// weight: 상자에서 나올 확률 가중치 / combo: 연타 시 공격 순서
export const WEAPONS = {
  pipe:     { name: '쇠파이프',      dmg: 15, reach: .55, dur: 14, sever: .7,  knock: 1.2, throwDmg: 18, mode: 'knock', fling: 1.3, weight: 3,  combo: ['swing', 'swing', 'smash'] },
  machete:  { name: '마체테',        dmg: 11, reach: .45, dur: 16, sever: 2.6, knock: .8,  throwDmg: 16, mode: 'cut',   weight: 3,  combo: ['slash', 'slash', 'slashF'] },
  block:    { name: '콘크리트 블록', dmg: 24, reach: .15, dur: 5,  sever: 1.4, knock: 1.6, throwDmg: 30, mode: 'crush', slow: 1.4, weight: 2, combo: ['smash'] },
  golf:     { name: '골프채',        dmg: 16, reach: .8,  dur: 12, sever: 1.5, knock: 1,   throwDmg: 14, mode: 'knock', fling: 2.6, zone: 'head', weight: 2.5, combo: ['golf'] },
  chainsaw: { name: '전기톱',        dmg: 3.2, reach: .5, dur: 70, sever: 3.5, knock: 1,   throwDmg: 12, mode: 'saw',   bisect: .85, weight: 1, combo: ['saw'] },
  axe:      { name: '소방 도끼',     dmg: 18, reach: .55, dur: 12, sever: 2.8, knock: 1,   throwDmg: 24, mode: 'cut',   bisect: .5, slow: 1.15, weight: 2, combo: ['chop', 'chopF'] },
  bat:      { name: '못 박힌 배트',  dmg: 14, reach: .6,  dur: 14, sever: 1.1, knock: 1.3, throwDmg: 16, mode: 'knock', fling: 1.8, weight: 2.5, combo: ['bash', 'bashF'] },
  sledge:   { name: '오함마',        dmg: 30, reach: .5,  dur: 8,  sever: 1.6, knock: 1.2, throwDmg: 28, mode: 'crush', weight: 1.2, combo: ['sledge'] },
  chain:    { name: '강철 체인',     dmg: 13, reach: 1.35, dur: 16, sever: 1.0, knock: 1.2, throwDmg: 14, mode: 'knock', fling: 1.8, slow: 1.1, weight: 1.8, combo: ['whip', 'whip', 'chainSpin'] },
  whip:     { name: '채찍',          dmg: 7,  reach: 1.75, dur: 18, sever: 1.3, knock: .6,  throwDmg: 6,  mode: 'cut',   zone: 'arms', weight: 2, combo: ['lash', 'lash', 'lashPull'] },
  pickaxe:  { name: '곡괭이',        dmg: 17, reach: .55, dur: 12, sever: 2.2, knock: 1,   throwDmg: 20, mode: 'crush', zone: 'head', weight: 2, combo: ['swing', 'smash'] },
};
export const FIST_SEVER = .55;

// 집어 든 신체 부위를 무기로 휘두르기 (몸통/상·하반신은 던지기만)
export const LIMB_WEAPONS = {
  head: { name: '머리통', dmg: 9,  reach: .25, dur: 5, sever: 1.0, knock: 1.3, mode: 'knock', combo: ['swing', 'swing', 'smash'] },
  arm:  { name: '팔',     dmg: 9,  reach: .45, dur: 7, sever: .8,  knock: 1.1, mode: 'knock', combo: ['swing', 'swing', 'smash'] },
  leg:  { name: '다리',   dmg: 11, reach: .55, dur: 7, sever: .9,  knock: 1.3, mode: 'knock', combo: ['bash', 'bashF'] },
};
export function limbKind(part) {
  if (part === 'head') return 'head';
  if (/^(arm|hand)/.test(part)) return 'arm';
  if (/^(leg|shin)/.test(part)) return 'leg';
  return null;
}

// 떨어진 부위/시체 조각 던지기: 피해는 작지만 짧게 움찔하게 함
export const GIB_THROW = { dmg: 4, knock: 1.6, speed: 10, hitstun: .18 };

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
  { id: 'p_hp',    group: '주인공 · 기본', name: '체력 단련',       desc: '주인공 최대 체력 +15',       max: 15, cost: [15, 30, 50, 75, 105, 140, 180, 225, 275, 330, 390, 455, 525, 600, 680] },
  { id: 'p_pow',   group: '주인공 · 기본', name: '근력 단련',       desc: '주인공 공격력 +8%',          max: 15, cost: [20, 35, 55, 80, 110, 145, 185, 230, 280, 335, 395, 460, 530, 605, 685] },
  { id: 'p_speed', group: '주인공 · 기본', name: '민첩성',          desc: '주인공 이동·대쉬 속도 +5%',   max: 6, cost: [20, 35, 55, 80, 110, 150] },
  { id: 'p_regen', group: '주인공 · 기본', name: '응급 처치',       desc: '스테이지 클리어 시 체력 회복 +10%', max: 3, cost: [25, 50, 90] },
  { id: 'p_scrap', group: '주인공 · 기본', name: '고물 수집가',     desc: '부품 획득량 +10%',            max: 5, cost: [30, 55, 85, 120, 160] },
  { id: 'p_wpow',  group: '주인공 · 무기', name: '무기 숙련',       desc: '무기(신체 부위 포함) 위력 +10%', max: 10, cost: [15, 25, 40, 60, 85, 115, 150, 190, 235, 285] },
  { id: 'p_wspd',  group: '주인공 · 무기', name: '빠른 손놀림',     desc: '무기 휘두르는 속도 +6%',      max: 8, cost: [20, 35, 55, 80, 110, 145, 185, 230] },
  { id: 'p_dur',   group: '주인공 · 무기', name: '무기 관리',       desc: '주운 무기 내구도 +15%',       max: 5, cost: [15, 30, 50, 75, 105] },
  { id: 'p_throw', group: '주인공 · 무기', name: '투척 강화',       desc: '던지기 위력 +20% (무기·드럼통·신체)', max: 5, cost: [15, 30, 50, 75, 105] },
  { id: 'p_flykick', group: '주인공 · 기술', name: '날아차기',      desc: '점프 중 공격: 앞으로 뻗으며 적을 날려버림', max: 1, cost: [15] },
  { id: 'p_djump', group: '주인공 · 기술', name: '더블 점프',       desc: '공중에서 한 번 더 점프',      max: 1, cost: [40] },
  { id: 'p_stomp', group: '주인공 · 기술', name: '내려찍기',        desc: '점프 중 아래+공격: 착지 충격으로 짓밟기', max: 1, cost: [30] },
  { id: 'p_otg',   group: '주인공 · 기술', name: '쓰러진 적 공격',  desc: '모든 공격이 쓰러진 적에게도 맞음 (피해 60%)', max: 1, cost: [35] },
  { id: 'p_combo', group: '주인공 · 기술', name: '4연타 콤보',      desc: '맨손 콤보에 팔꿈치 치기 추가',  max: 1, cost: [25] },
  { id: 'p_dash',  group: '주인공 · 기술', name: '대쉬 숙련',       desc: '대쉬 대기시간 -20%, 무적시간 증가, 몸통 박치기 위력 +25%', max: 3, cost: [25, 50, 85] },
  { id: 'p_back',  group: '주인공 · 기술', name: '급소 공격',       desc: '백어택 피해 배율 +0.25 (기본 1.5배)', max: 4, cost: [20, 40, 65, 95] },
  { id: 'b_ai',    group: '볼트', name: '전술 칩',          desc: '볼트 전술 해금 — Lv1: 호위 / Lv2: 협공', max: 2, cost: [25, 60] },
  { id: 'b_rescue',group: '볼트', name: '구조 프로토콜',    desc: '런마다 1회, 볼트가 쓰러진 주인공을 체력 40%로 부활', max: 1, cost: [80] },
  // 방패형 전용
  { id: 't_hp',    group: '볼트', cls: 'tank',   name: '강화 장갑',       desc: '볼트 최대 체력 +30',                       max: 5, cost: [12, 25, 40, 60, 85] },
  { id: 't_taunt', group: '볼트', cls: 'tank',   name: '도발 모듈',       desc: '주변 적이 주인공 대신 볼트를 노림',  max: 1, cost: [35] },
  { id: 't_bash',  group: '볼트', cls: 'tank',   name: '방패 돌진',       desc: '볼트가 돌진해서 적을 날려버림 (날아간 적이 다른 적과 충돌)', max: 1, cost: [50] },
  { id: 't_guard', group: '볼트', cls: 'tank',   name: '방어 매트릭스',   desc: '볼트가 받는 피해 -12%',                       max: 3, cost: [20, 40, 65] },
  // 공격형 전용
  { id: 'a_pow',   group: '볼트', cls: 'attack', name: '전투 프로세서',   desc: '볼트 공격력 +15%',                         max: 5, cost: [15, 30, 45, 65, 90] },
  { id: 'a_speed', group: '볼트', cls: 'attack', name: '고속 구동기',     desc: '볼트 이동·공격 속도 +10%',                 max: 3, cost: [20, 40, 65] },
  { id: 'a_spin',  group: '볼트', cls: 'attack', name: '회전 차기 모듈',  desc: '볼트가 적 2명 이상 근접 시 광역 회전 차기',   max: 1, cost: [45] },
  { id: 'a_blade', group: '볼트', cls: 'attack', name: '절단 블레이드',   desc: '볼트의 공격도 적의 부위를 잘라냄',     max: 1, cost: [55] },
];
