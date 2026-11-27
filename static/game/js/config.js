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
  // 맨주먹: 앞으로 내딛으며(lunge) 접었던 팔을 곧게 뻗음. 판정 거리·라인 허용 폭을 넉넉하게
  jab:     { startup: .05, active: .09, recovery: .10, range: [.1, 1.5], depth: .68, dmg: 6,  knock: 1.2, zone: 'high', hitstop: .05, anim: 'punchF', lunge: 2.6 },
  cross:   { startup: .06, active: .09, recovery: .12, range: [.1, 1.6], depth: .68, dmg: 8,  knock: 1.6, zone: 'high', hitstop: .06, anim: 'punchB', lunge: 3.2 },
  kick:    { startup: .09, active: .11, recovery: .22, range: [.1, 1.8], depth: .72, dmg: 14, knock: 6,   zone: 'mid',  hitstop: .10, anim: 'kick', knockdown: true, finisher: true, lunge: 3.4 },
  flykick: { startup: .04, active: .40, recovery: .10, range: [0, 1.3],  depth: .55, dmg: 13, knock: 8,   zone: 'high', hitstop: .09, anim: 'flykick', knockdown: true },
  // 대쉬 어택: 몸통 박치기. 맞은 적이 멀리 날아가 다른 적과 부딪힘
  // 숄더 태클: 몸을 낮추고 어깨로 들이받는 돌진기 (돌진 중 무적, 맞은 적은 날아가 다른 적과 충돌)
  dashAtk: { startup: .04, active: .26, recovery: .26, range: [0, 1.35], depth: .65, dmg: 17, knock: 13.5, zone: 'mid',  hitstop: .14, anim: 'dashAtk', knockdown: true, launch: 4.2, momentum: true, shake: .28, armor: true },
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
  // 화염 분사 (누르고 있기) / 샷건 사격
  flame:    { startup: .08, active: 999, recovery: .15, range: [.2, 1.0], depth: .75, dmg: 1.0, knock: .2, zone: 'all', hitstop: 0, anim: 'flame', weapon: true, hold: true, tick: .1, hitstun: .12, ignite: 3, flame: true },
  shotgun:  { startup: .10, active: .05, recovery: .48, range: [0, 1.0], depth: 1.0, dmg: 1.0, knock: 11, zone: 'all', hitstop: .12, anim: 'shoot', weapon: true, knockdown: true, shake: .38, shot: true },
  // 쌍절곤: 빠른 연타 → 회전 마무리
  nun1:     { startup: .05, active: .07, recovery: .09, range: [.1, 1.0], depth: .5,  dmg: 1.0, knock: .9, zone: 'high', hitstop: .035, anim: 'swing',  weapon: true },
  nun2:     { startup: .05, active: .07, recovery: .09, range: [.1, 1.0], depth: .55, dmg: 1.0, knock: .9, zone: 'mid',  hitstop: .035, anim: 'hslash', weapon: true },
  nunF:     { startup: .08, active: .26, recovery: .26, range: [0, 1.0],  depth: .9,  dmg: 1.5, knock: 6,  zone: 'high', hitstop: .08,  anim: 'wspin',  weapon: true, aoe: true, knockdown: true, finisher: true },
  // 채찍: 빠른 채찍질, 마무리는 적을 끌어당김 (knock 음수)
  lash:     { startup: .11, active: .08, recovery: .14, range: [.2, 1.0], depth: .45, dmg: 1.0, knock: .8, zone: 'arms', hitstop: .04, anim: 'swing', weapon: true },
  lashPull: { startup: .12, active: .10, recovery: .28, range: [.3, 1.0], depth: .5,  dmg: 1.3, knock: -11, zone: 'head', hitstop: .08, anim: 'hslash', weapon: true, hitstun: .5, finisher: true, pull: true },
  // 강철 체인 마무리: 제자리에서 돌며 주변을 휩쓸기
  chainSpin: { startup: .16, active: .42, recovery: .35, range: [0, 1.0], depth: 1.1, dmg: 1.4, knock: 8, zone: 'mid', hitstop: .1, anim: 'wspin', weapon: true, aoe: true, knockdown: true, finisher: true, shake: .2 },
  // 적이 무기를 휘두를 때 (예고 동작이 더 김)
  // 방패병·닌자
  eBash:     { startup: .40, active: .18, recovery: .55, range: [-.1, 1.1], depth: .55, dmg: 9, knock: 5.5, zone: 'mid', hitstop: .08, anim: 'dashAtk', knockdown: true, telegraph: true, dash: 6.5 },
  eSlash:    { startup: .18, active: .08, recovery: .28, range: [.1, 1.0], depth: .5, dmg: .75, knock: 2, zone: 'high', hitstop: .06, anim: 'hslash', weapon: true, needArms: true },
  eShuriken: { startup: .22, active: .05, recovery: .30, anim: 'throw', projectile: 'shuriken', dmg: 6, needArms: true },
  eWeapon:  { startup: .42, active: .10, recovery: .50, range: [.1, 1.0], depth: .5,  dmg: .7, knock: 2.5, zone: 'high', hitstop: .07, anim: 'swing',  weapon: true, needArms: true },
  eWeaponH: { startup: .42, active: .12, recovery: .50, range: [.1, 1.0], depth: .55, dmg: .7, knock: 3,   zone: 'mid',  hitstop: .07, anim: 'hswing', weapon: true, needArms: true },
  sledge:  { startup: .42, active: .10, recovery: .50, range: [.1, 1.0], depth: .7,  dmg: 1.0, knock: 5,   zone: 'high', hitstop: .15, anim: 'slam', weapon: true, knockdown: true, finisher: true, shake: .38,
             shock: { radius: 1.9, dmg: .35, zone: 'low' } },
  saw:     { startup: .12, active: 999, recovery: .15, range: [.1, .95], depth: .55, dmg: 1.0, knock: .3,  zone: 'all',  hitstop: 0, anim: 'saw', weapon: true, hold: true, tick: .09, hitstun: .22 },
  pThrow:  { startup: .10, active: .05, recovery: .22, anim: 'throw', projectile: 'weapon' },
  // 날아차기 해금 전의 약한 공중 공격
  airPunch: { startup: .04, active: .20, recovery: .10, range: [0, 1.05], depth: .5, dmg: 6, knock: 2, zone: 'high', hitstop: .05, anim: 'punchF' },
  // 4연타 콤보의 팔꿈치
  elbow:    { startup: .06, active: .09, recovery: .13, range: [.1, 1.35], depth: .68, dmg: 9, knock: 1.8, zone: 'high', hitstop: .065, anim: 'elbow', lunge: 2.8 },
  pThrowBarrel: { startup: .14, active: .05, recovery: .22, anim: 'throw', projectile: 'barrel' },
  // 잡기: 무릎 차기 / 던지기 (판정은 잡은 적에게만)
  grabKnee:  { startup: .09, active: .05, recovery: .2, anim: 'knee', grab: 'knee' },
  grabThrow: { startup: .16, active: .05, recovery: .34, anim: 'gthrow', grab: 'throw' },
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
  // 사이보그 폭주왕: 전기톱 팔
  eSawRush:  { startup: .60, active: 1.1, recovery: .75, range: [.1, 1.25], depth: .6, dmg: 4, knock: .6, zone: 'all', mode: 'saw', sever: 2.6, tick: .1, hitstun: .26, hitstop: 0, anim: 'saw', telegraph: true, rush: 3.4 },
  eSawSweep: { startup: .55, active: .14, recovery: .65, range: [-.3, 1.95], depth: .85, dmg: 20, knock: 6.5, zone: 'mid', mode: 'saw', sever: 2.2, anim: 'hslash', knockdown: true, telegraph: true, hitstop: .1, shake: .2 },
  eThrow:  { startup: .50, active: .05, recovery: .60, anim: 'throw', projectile: 'brick', dmg: 6, needArms: true },
  eFuse:   { startup: .80, active: .05, recovery: 0, anim: 'fuse', telegraph: true, explode: { radius: 1.9, dmg: 24 } },
};

// ---------------- 적 ----------------
// 생김새 = 행동 원칙: 모델(외형)마다 고유 AI와 공격을 가집니다.
export const ENEMIES = {
  grunt:   { name: '골목 깡패',    model: 'grunt',   hp: 38,  speed: 2.3,  scale: 1,    ai: 'brawler', attacks: ['ePunch'],                    scrap: [1, 2], pickup: true, armed: { chance: .22, types: ['pipe', 'bat', 'machete', 'whip', 'nunchaku'] } },
  charger: { name: '돌격 헬멧',    model: 'charger', hp: 60,  speed: 1.7,  scale: 1.08, ai: 'charger', attacks: ['eCharge'],                   scrap: [2, 3] },
  thrower: { name: '벽돌 배달부',  model: 'thrower', hp: 32,  speed: 2.0,  scale: 1,    ai: 'kiter',   attacks: ['eThrow'],                    scrap: [1, 3] },
  brute:   { name: '철거 덩치',    model: 'brute',   hp: 130, speed: 1.35, scale: 1.3,  ai: 'brawler', attacks: ['eSlam', 'ePunch'],           scrap: [3, 5], poise: 14, pickup: true, armed: { chance: .35, types: ['sledge', 'pipe', 'axe', 'chain', 'flail'] } },
  shield:  { name: '맨홀 방패병',  model: 'shielder', hp: 70,  speed: 1.6,  scale: 1.05, ai: 'shield',  attacks: ['eBash', 'ePunch'],           scrap: [2, 4], shield: true },
  ninja:   { name: '그림자 닌자',  model: 'ninja',    hp: 26,  speed: 3.6,  scale: .95,  ai: 'ninja',   attacks: ['eSlash', 'eShuriken'],      scrap: [2, 3], katana: true },
  biker:   { name: '폭주족',       model: 'biker',    hp: 55,  speed: 2.4,  scale: 1,    ai: 'biker',   attacks: ['ePunch'],                    scrap: [2, 4], pickup: true, bike: true },
  bomber:  { name: '폭죽 꼬마',    model: 'bomber',  hp: 14,  speed: 3.7,  scale: .72,  ai: 'rusher',  attacks: ['eFuse'],                     scrap: [1, 1] },
  cyborg:  { name: '사이보그 폭주왕 쇠톱', model: 'cyborg', hp: 700, speed: 1.9, scale: 1.7, ai: 'cyborg', attacks: ['eSawRush', 'eSawSweep', 'eSlam', 'eCharge'], scrap: [45, 45], poise: 34, boss: true, bike: true, saw: true },
  boss:    { name: '철거반장 굴삭', model: 'boss',    hp: 520, speed: 1.6,  scale: 1.55, ai: 'boss',    attacks: ['eSlam', 'eCharge', 'eThrow'], scrap: [30, 30], poise: 30, boss: true },
};

// 난이도 곡선: 런 진행도 t (0 = 첫 전투 구역, 1 = 보스 직전 구역)
//  from: 처음 등장하는 진행도 (등장하는 구역에서 반드시 1명 이상 소개됨)
//  w: [첫 등장 때 가중치, 막판 가중치] — 진행에 따라 선형 변화
export const ENEMY_CURVE = {
  grunt:   { from: 0,   w: [6, 2.2] },
  thrower: { from: 0,   w: [1.0, 1.5] },
  charger: { from: .15, w: [1.2, 1.8] },
  bomber:  { from: .3,  w: [1.0, 1.5] },
  shield:  { from: .45, w: [.9, 1.5] },
  brute:   { from: .6,  w: [.9, 1.7] },
  ninja:   { from: .75, w: [.8, 1.4] },
  biker:   { from: .9,  w: [1.0, 1.5], city: 1.8 },   // 도심에서는 더 자주
};
// 웨이브 크기 [초반, 막판], 구역당 웨이브 수 [초반, 막판]
export const WAVE_CURVE = { size: [3, 6.5], waves: [2, 3] };

// ---------------- 해금 전 기본 콘텐츠 ----------------
export const BASE_UNLOCKS = { weapons: ['pipe', 'machete', 'block', 'golf', 'bat', 'katana', 'manhole'], biomes: ['plains', 'city'], bosses: ['boss'] };
// 챕터: 스테이지 2개 + 보스. 보스를 잡으면 아지트를 거쳐 다음 챕터로 (챕터마다 강해짐)
export const CHAPTER = { enemyHp: .25, enemyPow: .12 };

// 전리품 진열대: 조건을 달성하면 얻음. fx가 있는 것은 아지트에서 최대 3개까지 장착 (도움 또는 괴상한 효과)
//  kind: title(호칭, HUD 이름 옆에 표시 가능) / item(진열 물건)
export const TROPHY_SLOTS = 3;
export const TROPHIES = [
  { id: 'rookie',   kind: 'title', name: '신참 해결사',     model: 'medal',     cond: '첫 출동을 마침',                     test: s => s.runs >= 1 },
  { id: 'butcher',  kind: 'title', name: '정육점 주인',     model: 'w_machete', cond: '누적 부위 절단 150회',               test: s => (s.severs || 0) >= 150, fx: 'gore2', fxDesc: '피가 두 배로 튄다 (괴상)' },
  { id: 'homerun',  kind: 'item',  name: '황금 골프공',     model: 'goldball',  cond: '골프 헤드샷 5회',                    test: s => (s.golf || 0) >= 5, fx: 'golfLuck', fxDesc: '골프채가 세 배 자주 나온다' },
  { id: 'kneeking', kind: 'title', name: '니킥 장인',       model: 'medal',     cond: '세 번째 무릎(니킥) 30회',            test: s => (s.knee || 0) >= 30, fx: 'knee', fxDesc: '무릎 차기 피해 +40%' },
  { id: 'pyro',     kind: 'item',  name: '그을린 라이터',   model: 'lighter',   cond: '폭발로 적 30명 처치',                test: s => (s.blast || 0) >= 30, fx: 'pyro', fxDesc: '모든 폭발 범위 +25% (내 쪽도 위험)' },
  { id: 'biker',    kind: 'item',  name: '훔친 오토바이 열쇠', model: 'key',    cond: '오토바이 5대 던지기',                test: s => (s.moto || 0) >= 5, fx: 'bikers', fxDesc: '폭주족이 두 배로 몰려온다 (괴상)' },
  { id: 'manhole',  kind: 'item',  name: '맨홀 뚜껑',       model: 'manhole',   cond: '맨홀 뚜껑 3번 획득',                 test: s => (s.manhole || 0) >= 3, fx: 'startLid', fxDesc: '맨홀 뚜껑을 들고 시작' },
  { id: 'demo',     kind: 'item',  name: '철거반장의 안전모', model: 'hardhat', cond: '철거반장 처치',                      test: s => (s.boss_boss || 0) >= 1, fx: 'hp15', fxDesc: '최대 체력 +15' },
  { id: 'saw',      kind: 'item',  name: '쇠톱의 전기톱 팔', model: 'w_chainsaw', cond: '사이보그 폭주왕 처치',             test: s => (s.boss_cyborg || 0) >= 1, fx: 'startSaw', fxDesc: '전기톱을 들고 시작 (내구도 절반)' },
  { id: 'clutch',   kind: 'title', name: '구사일생',        model: 'medal',     cond: '체력 10 이하로 보스 처치',           test: s => (s.clutch || 0) >= 1, fx: 'clutch', fxDesc: '체력 25% 이하일 때 공격력 +35%' },
  { id: 'bath',     kind: 'title', name: '피범벅',          model: 'medal',     cond: '온몸이 피로 물듦',                   test: s => (s.bath || 0) >= 1, fx: 'bloodrush', fxDesc: '피에 젖을수록 빨라짐 (최대 +15%)' },
  { id: 'faller',   kind: 'title', name: '추락 전문가',     model: 'medal',     cond: '낭떠러지에 5번 떨어짐',              test: s => (s.fall || 0) >= 5, fx: 'parachute', fxDesc: '판마다 한 번, 떨어져도 살아남음 (체력 -30)' },
];

// 난이도(클리어할 때마다 한 단계씩 열림, 최대 5): 단계당 효과
// 주변 폭발(드럼통·차·오토바이·폭죽 꼬마)이 뱀돌이·볼트에게 주는 피해 배율 (자기가 터뜨린 폭발에 너무 쉽게 죽지 않게)
export const HERO_BLAST = .55;
// 회복: 스테이지 클리어 시 최대 체력의 20% 자동 회복 (+ 응급 처치 업그레이드). 구역 정리 회복은 없음(0)
export const STAGE_HEAL = .2;
// 고어 보너스: 뱀돌이가 직접 잔혹한 짓을 하면 부품(돈)을 줌 (작은 글씨 + 반짝이는 동전)
export const GORE_BONUS = {
  head:   { label: '머리 절단', v: 3 }, arm: { label: '팔 절단', v: 1 }, hand: { label: '손목 절단', v: 1 }, leg: { label: '다리 절단', v: 1 }, shin: { label: '정강이 절단', v: 1 },
  crushHead: { label: '머리 분쇄', v: 3 }, crush: { label: '분쇄', v: 1 },
  homerun: { label: '홈런', v: 4 }, golf: { label: '헤드샷', v: 3 }, shatter: { label: '산산조각', v: 4 }, bisect: { label: '두 동강', v: 4 },
  blast: { label: '폭사', v: 2 }, knee: { label: '니킥', v: 1 },
};
export const ZONE_HEAL = 0;
// 초반(첫 스테이지)에 동시에 나올 수 있는 돌격 헬멧 수
export const EARLY_CHARGER_MAX = 1;
export const HEAT = { max: 5, enemyHp: .2, enemyPow: .12, scrap: .25 };

// ---------------- 핏자국 (과장 연출) ----------------
// 실제 튀는 양보다 훨씬 크게 묻음. 숫자를 키울수록 더 피범벅
export const BLOOD = {
  floorSize: 2.4,       // 바닥 얼룩 크기 배율 (입자 크기 대비)
  satellites: [2, 5],   // 바닥 얼룩 주변에 흩뿌려지는 작은 방울 수
  satRadius: .32,       // 방울이 퍼지는 반경
  streak: 4,            // 빠르게 떨어진 피가 번지는 최대 길이(칸)
  wallSize: 2.2,        // 벽 자국 크기 배율
  drip: [2, 5],         // 벽 자국 아래로 흘러내리는 줄기 길이
  heroAmt: .2,          // 주인공·볼트에 한 방울당 묻는 양 (1 = 부위 전체)
  enemyAmt: .06,        // 적에게 묻는 양 (적이 누군지 알아볼 수 있도록 적게)
  enemyMax: .28,        // 살아 있는 적은 부위당 이 이상 물들지 않음 (시체는 제한 없음)
  enemySpread: .15,     // 적의 옆 부위 번짐 비율
  spread: .45,          // 맞은 부위 옆 부위(몸통↔팔, 허벅지↔정강이)에 번지는 비율
  passThrough: .5,      // 캐릭터에 묻고도 계속 날아가는 확률
  heroFade: .1,         // 주인공·볼트가 원래 색으로 돌아오는 속도(초당)
  enemyFade: .05,       // 살아 있는 적의 얼룩이 옅어지는 속도
};

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
  // 화염 스프레이: J를 누르는 동안 불길 분사 (연료 = 내구도, 분사하는 동안 줄어듦)
  flamer:   { name: '화염 스프레이', dmg: 3,  reach: 1.6, dur: 45, sever: .2,  knock: 1,   throwDmg: 10, mode: 'burn',  weight: 1, combo: ['flame'], fuel: true, noPickup: true },
  // 샷건: 6발. 한 방에 넓게 산탄, 처치한 적은 산산조각
  shotgun:  { name: '샷건',          dmg: 65, reach: 4.2, dur: 6,  sever: 3.5, knock: 1,   throwDmg: 12, mode: 'blast', fling: 3, weight: .9, combo: ['shotgun'], ammo: true, noPickup: true },
  // 적에게서만 얻는 무기 (상자에서 안 나옴: weight 0)
  katana:   { name: '닌자도',        dmg: 14, reach: .6,  dur: 14, sever: 2.8, knock: .8,  throwDmg: 16, mode: 'cut',   weight: 0, combo: ['slash', 'slash', 'slashF'] },
  manhole:  { name: '맨홀 뚜껑',     dmg: 16, reach: .25, dur: 10, sever: .6,  knock: 1.6, throwDmg: 28, mode: 'knock', weight: 0, combo: ['swing', 'smash'], guard: .4 },
  nunchaku: { name: '쌍절곤',        dmg: 8,  reach: .6,  dur: 22, sever: .8,  knock: 1,   throwDmg: 10, mode: 'knock', weight: 2, combo: ['nun1', 'nun2', 'nun1', 'nunF'] },
  flail:    { name: '철퇴',          dmg: 21, reach: .95, dur: 12, sever: 1.8, knock: 1.3, throwDmg: 22, mode: 'crush', slow: 1.2, weight: 1.5, combo: ['swing', 'swing', 'smash'] },
  whip:     { name: '채찍',          dmg: 7,  reach: 1.75, dur: 18, sever: 1.3, knock: .6,  throwDmg: 6,  mode: 'cut',   zone: 'arms', weight: 2, combo: ['lash', 'lash', 'lashPull'] },
  pickaxe:  { name: '곡괭이',        dmg: 17, reach: .55, dur: 12, sever: 2.2, knock: 1,   throwDmg: 20, mode: 'crush', zone: 'head', weight: 2, combo: ['swing', 'smash'] },
};
export const FIST_SEVER = .55;

// 휘어지는 무기(채찍·체인): 마디 수, 마디 길이, 평소/공격 중 펴짐 정도, 무게
export const FLEX = {
  whip:  { handleModel: 'w_whip_handle',  handle: .30, segs: 14, seg: .13,  stiffIdle: .03, stiffAtk: .5, grav: 16, damp: .90,
           colors: [0x7a4a28, 0x5a361e], tip: 0xc08a50, size: [.09, .05], crack: true },
  // 쌍절곤: 마디별 길이 지정 (사슬 2마디 + 단단한 막대 1마디)
  nunchaku: { handleModel: 'w_nunchaku_handle', handle: .36, segs: 3, segLens: [.05, .05, .38], stiffIdle: .02, stiffAtk: .45, grav: 20, damp: .9,
           colors: [0x9aa2ab, 0x5d636b], tip: 0x8a5a2b, size: [.05, .05], stick: { from: 2, color: 0x9a6a35, band: 0x1a1a1a, size: .1 } },
  flail: { handleModel: 'w_flail_handle', handle: .34, segs: 5,  seg: .14,  stiffIdle: .02, stiffAtk: .38, grav: 24, damp: .88,
           colors: [0x9aa2ab, 0x5d636b], tip: 0x3a3e44, size: [.08, .08], ball: .3, spikes: 0xc8cdd2 },
  chain: { handleModel: 'w_chain_handle', handle: .22, segs: 9,  seg: .155, stiffIdle: .015, stiffAtk: .26, grav: 22, damp: .88,
           colors: [0x9aa2ab, 0x5d636b], tip: 0x3e4349, size: [.095, .095], ball: .24 },
};

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
  barrel: { radius: 2.3, dmg: 30, fuse: .45 },
  car:    { hp: 70, radius: 3.2, dmg: 42, fuse: .7 },    // 주차된 차 폭발
  moto:   { hp: 28, radius: 2.6, dmg: 34, fuse: .35, throwRadius: 3.0, throwDmg: 45 }, // 오토바이
};

// ---------------- 바이옴 ----------------
// 블록 색만 바꿔도 분위기가 크게 달라지는지 검증하기 위한 3종
export const BIOMES = {
  city: {
    name: '뒷골목 도심', sky: [0.62, 0.66, 0.74], fog: [0.6, 0.63, 0.7], city: true,
    grass: 0xa8a8a2, dirt: 0x6e6e70, lane: 0x3a3a3e, stone: 0x5a5a5e,
    wall: 0x8a5040, wall2: 0x5e3a30, glass: 0x2a3a50, wood: 0x5a4030, leaves: 0x3f7a35, flora: 'none',
    trim: 0x4a4a50, far: 0x6a7280, build: [0xc8beb0, 0x9aa0a6, 0xb5654a, 0xd8d0c0, 0x8a8070, 0x6f7a86, 0xa89a7a],
  },
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
  // 해금: 세지는 대신 런에 새로운 것이 등장 (한 번 사면 영구)
  { id: 'u_flex',   group: '해금 · 무기고', name: '사슬 무기',  desc: '강철 체인·채찍·쌍절곤·철퇴가 나오기 시작', max: 1, cost: [40],  unlock: { weapons: ['chain', 'whip', 'nunchaku', 'flail'] } },
  { id: 'u_heavy',  group: '해금 · 무기고', name: '중장비',     desc: '전기톱·소방 도끼·오함마·곡괭이가 나오기 시작', max: 1, cost: [60], unlock: { weapons: ['chainsaw', 'axe', 'sledge', 'pickaxe'] } },
  { id: 'u_guns',   group: '해금 · 무기고', name: '화기',       desc: '샷건·화염 스프레이가 나오기 시작',        max: 1, cost: [90],  unlock: { weapons: ['shotgun', 'flamer'] } },
  { id: 'u_desert', group: '해금 · 지역·적', name: '모래 공업지대', desc: '새 지역이 런에 나오기 시작',            max: 1, cost: [50],  unlock: { biome: 'desert' } },
  { id: 'u_snow',   group: '해금 · 지역·적', name: '얼어붙은 항구', desc: '새 지역이 런에 나오기 시작',            max: 1, cost: [70],  unlock: { biome: 'snow' } },
  { id: 'u_cyborg', group: '해금 · 지역·적', name: '현상수배: 사이보그 폭주왕', desc: '최종 보스 후보에 추가 (보상 부품이 더 많음)', max: 1, cost: [100], unlock: { boss: 'cyborg' } },
  { id: 'p_hp',    group: '뱀돌이 · 기본', name: '체력 단련',       desc: '뱀돌이 최대 체력 +15',       max: 6, cost: [15, 30, 50, 75, 105, 140, 180, 225, 275, 330, 390, 455, 525, 600, 680] },
  { id: 'p_pow',   group: '뱀돌이 · 기본', name: '근력 단련',       desc: '뱀돌이 공격력 +8%',          max: 6, cost: [20, 35, 55, 80, 110, 145, 185, 230, 280, 335, 395, 460, 530, 605, 685] },
  { id: 'p_speed', group: '뱀돌이 · 기본', name: '민첩성',          desc: '뱀돌이 이동·대쉬 속도 +5%',   max: 6, cost: [20, 35, 55, 80, 110, 150] },
  { id: 'p_regen', group: '뱀돌이 · 기본', name: '응급 처치',       desc: '스테이지 클리어 시 체력 회복 +10%', max: 3, cost: [25, 50, 90] },
  { id: 'p_scrap', group: '뱀돌이 · 기본', name: '고물 수집가',     desc: '부품 획득량 +10%',            max: 5, cost: [30, 55, 85, 120, 160] },
  { id: 'p_wpow',  group: '뱀돌이 · 무기', name: '무기 숙련',       desc: '무기(신체 부위 포함) 위력 +10%', max: 5, cost: [15, 25, 40, 60, 85, 115, 150, 190, 235, 285] },
  { id: 'p_wspd',  group: '뱀돌이 · 무기', name: '빠른 손놀림',     desc: '무기 휘두르는 속도 +6%',      max: 4, cost: [20, 35, 55, 80, 110, 145, 185, 230] },
  { id: 'p_dur',   group: '뱀돌이 · 무기', name: '무기 관리',       desc: '주운 무기 내구도 +15%',       max: 5, cost: [15, 30, 50, 75, 105] },
  { id: 'p_throw', group: '뱀돌이 · 무기', name: '투척 강화',       desc: '던지기 위력 +20% (무기·드럼통·신체)', max: 5, cost: [15, 30, 50, 75, 105] },
  { id: 'p_flykick', group: '뱀돌이 · 기술', name: '날아차기',      desc: '점프 중 공격: 앞으로 뻗으며 적을 날려버림', max: 1, cost: [15] },
  { id: 'p_djump', group: '뱀돌이 · 기술', name: '더블 점프',       desc: '공중에서 한 번 더 점프',      max: 1, cost: [40] },
  { id: 'p_stomp', group: '뱀돌이 · 기술', name: '내려찍기',        desc: '점프 중 아래+공격: 착지 충격으로 짓밟기', max: 1, cost: [30] },
  { id: 'p_otg',   group: '뱀돌이 · 기술', name: '쓰러진 적 공격',  desc: '모든 공격이 쓰러진 적에게도 맞음 (피해 60%)', max: 1, cost: [35] },
  { id: 'p_combo', group: '뱀돌이 · 기술', name: '4연타 콤보',      desc: '맨손 콤보에 팔꿈치 치기 추가',  max: 1, cost: [25] },
  { id: 'p_dash',  group: '뱀돌이 · 기술', name: '대쉬 숙련',       desc: '대쉬 대기시간 -20%, 무적시간 증가, 몸통 박치기 위력 +25%', max: 3, cost: [25, 50, 85] },
  { id: 'p_back',  group: '뱀돌이 · 기술', name: '급소 공격',       desc: '백어택 피해 배율 +0.25 (기본 1.5배)', max: 4, cost: [20, 40, 65, 95] },
  { id: 'b_ai',    group: '볼트', name: '전술 칩',          desc: '볼트 전술 해금 — Lv1: 호위 / Lv2: 협공', max: 2, cost: [25, 60] },
  { id: 'b_rescue',group: '볼트', name: '구조 프로토콜',    desc: '런마다 1회, 볼트가 쓰러진 뱀돌이를 체력 40%로 부활', max: 1, cost: [80] },
  // 방패형 전용
  { id: 't_hp',    group: '볼트', cls: 'tank',   name: '강화 장갑',       desc: '볼트 최대 체력 +30',                       max: 5, cost: [12, 25, 40, 60, 85] },
  { id: 't_taunt', group: '볼트', cls: 'tank',   name: '도발 모듈',       desc: '주변 적이 뱀돌이 대신 볼트를 노림',  max: 1, cost: [35] },
  { id: 't_bash',  group: '볼트', cls: 'tank',   name: '방패 돌진',       desc: '볼트가 돌진해서 적을 날려버림 (날아간 적이 다른 적과 충돌)', max: 1, cost: [50] },
  { id: 't_guard', group: '볼트', cls: 'tank',   name: '방어 매트릭스',   desc: '볼트가 받는 피해 -12%',                       max: 3, cost: [20, 40, 65] },
  // 공격형 전용
  { id: 'a_pow',   group: '볼트', cls: 'attack', name: '전투 프로세서',   desc: '볼트 공격력 +15%',                         max: 5, cost: [15, 30, 45, 65, 90] },
  { id: 'a_speed', group: '볼트', cls: 'attack', name: '고속 구동기',     desc: '볼트 이동·공격 속도 +10%',                 max: 3, cost: [20, 40, 65] },
  { id: 'a_spin',  group: '볼트', cls: 'attack', name: '회전 차기 모듈',  desc: '볼트가 적 2명 이상 근접 시 광역 회전 차기',   max: 1, cost: [45] },
  { id: 'a_blade', group: '볼트', cls: 'attack', name: '절단 블레이드',   desc: '볼트의 공격도 적의 부위를 잘라냄',     max: 1, cost: [55] },
];
