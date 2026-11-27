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
  // 배트: 어깨 뒤로 크게 들어 올림(예비 동작) → 앞발 내딛고 허리를 돌려 수평으로 후려침 → 반대 어깨 위로 감기는 마무리
  bash:    { startup: .16, active: .09, recovery: .28, range: [.1, 1.05], depth: .7, dmg: 1.0, knock: 4.5, zone: 'mid',  hitstop: .10, anim: 'batswing', weapon: true, shake: .1, lunge: 1.6 },
  bashF:   { startup: .24, active: .10, recovery: .40, range: [.1, 1.1], depth: .75, dmg: 1.6, knock: 10,  zone: 'high', hitstop: .16, anim: 'batswing', weapon: true, knockdown: true, finisher: true, shake: .3, lunge: 2.4, big: true },
  whip:    { startup: .10, active: .12, recovery: .20, range: [.2, 1.0], depth: .85, dmg: 1.0, knock: 1.5, zone: 'low',  hitstop: .05, anim: 'hswing', weapon: true },
  whipF:   { startup: .14, active: .14, recovery: .30, range: [.2, 1.0], depth: .9,  dmg: 1.4, knock: 2.5, zone: 'low',  hitstop: .08, anim: 'hswing', weapon: true, knockdown: true, finisher: true },
  // 화염 분사 (누르고 있기) / 샷건 사격
  flame:    { startup: .08, active: 999, recovery: .15, range: [.2, 1.0], depth: .75, dmg: 1.0, knock: .2, zone: 'all', hitstop: 0, anim: 'flame', weapon: true, hold: true, tick: .1, hitstun: .12, ignite: 3, flame: true },
  // 샷건: 어깨에 붙여 조준 → 발사(큰 반동: 상체가 젖혀지고 총구가 튀고 뒤로 밀림) → 펌프 장전(탄피 배출)
  shotgun:  { startup: .12, active: .05, recovery: .52, range: [0, 1.0], depth: 1.0, dmg: 1.0, knock: 11, zone: 'all', hitstop: .14, anim: 'shoot', weapon: true, knockdown: true, shake: .5, shot: true, recoil: 4.2 },
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

// ---------------- 떨어진 부위가 튀는 정도 (막장 과장 연출) ----------------
//  times: 최소 튀는 횟수 / speed: 첫 튐 속도(높이 ≈ speed²/44 m) / drop: 튈 때마다 줄어드는 속도 / roll: 튈 때마다 옆으로 차이는 힘
export const GIB_BOUNCE = {
  // 머리: 축구공처럼. 첫 튐을 speed로 차올린 뒤 탄성(bounce)으로 점점 낮아지고, 다 튀면 바닥을 데굴데굴 굴러가다 멈춤
  //  bounce: 탄성(1이면 영원히 튐) / kick: 첫 튐 때 최소 수평 속도 / rollFric: 구를 때 1초에 남는 속도 비율
  head: { speed: 10, bounce: 0.8, keep: 0.88, roll: 0.5, kick: 2.6, rollFric: 0.1 },
  limb: { times: 3, speed: 3.6, drop: 0.85, keep: 0.72, roll: 0.6, spin: 0.75 },  // 팔·다리
};

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
  heroShowMax: .7,      // 주인공 몸에 '보이는' 피의 상한 (파란 옷 윤곽이 남게). 실제 묻은 양은 따로 1까지 쌓임
  heroHeadMax: .4,      // 주인공 얼굴·머리띠는 더 적게 (누군지 알아보게)
  backsplash: 10,       // 뱀돌이가 가까이서 베거나 세게 때릴 때 공격자 쪽으로 되튀는 핏방울 수 (절단 시 2배)
  ringFrom: .35,        // 주인공 평균 피가 이 이상이면 발밑에 흰 고리 표시 (피범벅일 때 위치 놓치지 않게)
  enemyFade: .05,       // 살아 있는 적의 얼룩이 옅어지는 속도
};

// ---------------- 카메라·화면 ----------------
// zoom: 1이면 예전 거리, 클수록 캐릭터가 크게 보임(대신 한 화면에 보이는 폭이 1/zoom로 좁아짐)
// pixelScale: 화면을 몇 배 큰 픽셀로 그리는지 (1 = 원래 해상도, 클수록 도트 느낌·가벼움). P 키로 바꿔 볼 수 있음
export const CAMERA = {
  zoom: 1,
  eye: [8.6, 15.5],       // 예전 카메라 높이·거리 (zoom 1 기준)
  look: [1.0, -0.6],      // 바라보는 점 높이·깊이 (zoom을 키우면 앞쪽 끝이 잘리므로 1.7쯤으로 앞당길 것)
  fov: 35,
  pixelScale: 1,          // 고품질 개편: 원래 해상도로 선명하게 (예전 도트 느낌은 3)
};

// ---------------- 고품질 렌더링 ----------------
// 해 그림자(그림자 맵) · 다중 표본 계단 제거 · 윤곽선 · 빛 번짐 · 색 보정. 무기방 8번으로 켜고 끔
export const RENDER = {
  dprMax: 2,              // 기기 픽셀 비율 상한 (2 = 고해상도 화면에서 2배로 선명하게)
  msaa: 4,                // 다중 표본 수 (계단 현상 제거)
  shadowSize: 4096,       // 그림자 맵 한 변 픽셀 (클수록 그림자 가장자리가 또렷)
  shadowRange: 22,        // 그림자 맵이 덮는 범위(중심에서 ±m)
  shadowStrength: .78,    // 그림자 진하기 (0 = 없음, 1 = 해 빛을 완전히 가림)
  outline: { k: .42, px: 1.2, rel: .045, fade: 60 },   // 윤곽선: 세기, 두께(CSS px), 경계로 볼 상대 깊이 차, 이 거리(m)부터 사라짐
  bloom: .9,              // 빛 번짐 세기 (불·동전·눈빛처럼 아주 밝은 곳만)
  bloomThreshold: .9,     // 이 밝기 이상만 번짐 (피부·밝은 모래는 번지지 않게)
  grade: { contrast: 1.07, saturation: 1.02, vignette: .32, lift: [.012, .006, 0] },   // 대비·채도·가장자리 어둡게·그늘 색
  mobile: { dprMax: 1.5, shadowSize: 2048, msaa: 4 },   // 휴대폰·태블릿 설정 (사양 좋은 폰 기준)
};

// ---------------- 조명 ----------------
// 흐린 낮: 위를 향한 면은 잿빛 하늘색, 아래를 향한 면은 흙빛 반사광, 해 쪽은 따뜻하게
// 광원은 불만 — 불타는 차·폭발·총구 섬광·화염·불붙은 캐릭터가 주변을 주황빛으로 물들임 (최대 8개)
export const LIGHT = {
  sky: [.46, .5, .58],         // 하늘 쪽 환경광 (위를 향한 면, 살짝 차가운 잿빛)
  ground: [.3, .25, .2],       // 땅 반사광 (아래를 향한 면, 어두운 흙빛)
  sun: [.74, .62, .46],        // 해(방향광) 색·세기 (따뜻하게 → 해 쪽과 그늘 쪽 대비)
  rim: .32,                    // 캐릭터 가장자리 빛 세기 (배경에서 윤곽이 읽히게)
  fire: [1.6, .75, .25],       // 불빛 색 (세기 포함)
  car: { r: 6, k: .9 },        // 불타는 차: 반경(m)·세기
  blast: { r: 9, k: 2.2, life: .45 },   // 폭발 순간 번쩍
  muzzle: { r: 5, k: 1.6, life: .08 },  // 총구 섬광
  flame: { r: 4.5, k: 1.0 },   // 화염 스프레이
  burn: { r: 3, k: .7 },       // 불붙은 캐릭터
  hero: { r: 6.5, k: .6, up: 3.6, front: 2.4, c: [1, .95, .86] },   // 너무 가까우면 주먹·얼굴이 하얗게 타서 더 높고 멀리 둠 (고품질 개편)   // 주인공 주변을 은은하게 밝히는 빛 (머리 위·앞쪽에서 따라다님)
};

// ---------------- 가라앉는 시체·조각 ----------------
// 시체와 떨어진 부위가 튀기를 멈추면 서서히 어두워지며 바닥 핏자국 색에 반쯤 섞임 (배경처럼 가라앉아 살아 있는 적과 구분)
// 집거나 치거나 차서 다시 움직이면 즉시 원래 색으로 돌아옴
export const SETTLE = {
  delay: .25,                 // 멈춘 뒤 어두워지기 시작할 때까지(초)
  time: 1.2,                  // 다 어두워지는 데 걸리는 시간(초)
  rgb: [.26, .025, .03],      // 섞이는 색 (바닥 핏자국의 검붉은 색)
  amount: .5,                 // 섞이는 정도 (0~1, .5 = 반쯤)
};

// ---------------- 피 발자국 ----------------
// 바닥의 진한 핏자국을 밟으면 발바닥에 피가 묻고, 몇 걸음 동안 점점 옅어지는 발자국이 바닥 핏자국 맵에 찍힘
export const FOOTPRINT = {
  step: .42,        // 발자국 간격(m, 걸은 거리 기준)
  steps: 12,        // 한 번 밟은 뒤 찍히는 발자국 수 (점점 옅어짐)
  pickup: 120,      // 바닥 핏자국 진하기(0~255)가 이 이상인 곳을 밟으면 발에 피가 묻음
  amt: 95,          // 첫 발자국 진하기 (pickup보다 낮게 → 자기 발자국을 다시 밟아도 무한히 이어지지 않음)
  minAmt: 25,       // 마지막 발자국 진하기
  gap: .17,         // 왼발·오른발 좌우 간격(m)
};

// ---------------- 피칠갑 광폭화 ----------------
// 뱀돌이 몸에 피가 묻을 때마다 광폭 게이지가 오름 (화면에 보이는 피와 별도로 천천히 쌓임 — 피가 워낙 많이 나와서 그대로 쓰면 상시 광폭)
// 게이지가 다 차면 광폭화. 시간이 다 되면 끝나고 잠깐 재충전 대기. 광폭 신호는 빨강이 아니라 하얀 눈빛·하얀 김
export const BERSERK = {
  gain: .035,       // 몸에 묻는 피 1(부위 하나를 가득 채우는 양)당 게이지 증가량. 한 방울은 BLOOD.heroAmt(.2) → .007
  decay: .012,      // 싸우지 않을 때 게이지가 줄어드는 속도(초당)
  duration: 8,      // 광폭 지속 시간(초)
  feedTime: .4,     // 광폭 중 적을 하나 죽일 때마다 늘어나는 시간(초)
  maxTime: 12,      // 한 번의 광폭 최대 시간(초)
  cooldown: 20,     // 광폭이 끝난 뒤 게이지가 차지 않는 시간(초)
  atkSpeed: 1.35,   // 공격 속도 배율
  moveSpeed: 1.15,  // 이동 속도 배율
  power: 1.3,       // 피해 배율
  fistSever: 3.5,   // 광폭 중 맨주먹·발차기도 부위를 뜯어냄 (절단력, 맨주먹 기본은 FIST_SEVER)
  vignette: .65,    // 화면 가장자리 붉은 기운 세기 (0~1)
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
// ---------------- 바이옴 배경 꾸미기 (biomes.js / obstacles.js) ----------------
// slab: 콘크리트 판 이음 간격(m), joint/crack: 이음·균열 색, lane: 바랜 차선(없으면 null)
// patch: 길 위 얼룩(흙·모래·눈) 색, patchF: 얼룩 크기(작을수록 큰 덩어리), patchT: 얼룩 문턱(낮을수록 많이), edgeBoost: 길가에서 더 많이
// patch2: 두 번째 얼룩(이끼·진창·물웅덩이), fog: 안개막 [z, [[바닥 y, 높이, 불투명도]...]]
export const BIOME_ENV = {
  plains: { slab: 3, joint: 0x4a4842, crack: 0x3a3834, lane: 0x9a968a, patch: [0x6e664e, 0x766c52, 0x686048], patchF: .5, patchT: .7, edgeBoost: .3, patch2: [0x66654c, 0x6a6850], patch2T: .84,
    fog: [[-30, [[0, 10, .3], [10, 8, .16]]], [-20, [[0, 6, .26], [6, 6, .12]]], [-12, [[0, 3, .18], [3, 5, .08]]], [-5.4, [[0, 1.2, .14], [1.2, 2.5, .07]]]] },
  desert: { slab: 4, joint: 0x5e584e, crack: 0x4a443c, lane: null, patch: [0xb09a76, 0xa48e6a, 0xb8a27e], patchF: .3, patchT: .68, edgeBoost: .4, patch2: [0x7e786c, 0x96907e], patch2T: .8,
    fog: [[-30, [[0, 12, .42], [12, 10, .22]]], [-20, [[0, 8, .34], [8, 6, .16]]], [-12, [[0, 4, .24], [4, 5, .1]]], [-5.4, [[0, 1.4, .18], [1.4, 3, .09]]]] },
  snow: { slab: 3, joint: 0x45433f, crack: 0x3a3836, lane: 0x8a7a44, patch: [0xc8ccce, 0xb8bcbe, 0xd4d8d9], patchF: .4, patchT: .63, edgeBoost: .4, patch2: [0x4a4e50, 0x7e8284, 0x8a8e8e], patch2T: .76,
    waterY: -0.7,
    fog: [[-32, [[0, 10, .3], [10, 8, .15]]], [-20, [[-1, 7, .2], [6, 6, .1]]], [-11, [[-1, 4, .12], [3, 5, .06]]], [-5.4, [[0, 1.3, .1], [1.3, 2.6, .05]]]] },
};
// 장애물(높이 맵 벽·잔해·바리케이드) / 항구 낭떠러지 아래 바닷물
export const OBSTACLE = { water: 0x2a3436, waterY: -2.2 };

export const BIOMES = {
  city: {
    // 폐허가 된 뉴욕 거리 (docs/art/target_ingame.webp): 바랜 벽돌, 먼지 낀 흙빛 하늘, 짙은 먼지 안개
    name: '폐허 뉴욕 거리', sky: [0.66, 0.56, 0.47], fog: [0.6, 0.51, 0.43], city: true, nyc: true,
    fogNear: 16, fogFar: 62, hfog: [0.55, 3.2],    // 거리 안개(시작·끝 m), 바닥 먼지 안개(세기·높이 m)
    light: { sky: [.44, .42, .44], ground: [.3, .23, .17], sun: [.82, .6, .4] },   // 먼지 낀 늦은 오후: 따뜻하고 낮은 해
    grass: 0x857c70, dirt: 0x5e5650, lane: 0x3e3a37, stone: 0x5a5450,
    wall: 0x7a4434, wall2: 0x5a3428, glass: 0x1e242a, wood: 0x5a4030, leaves: 0x4a5a38, flora: 'none',
    trim: 0x4a4440, far: 0x6e625a, rail: 0x4a463c, build: [0x7a4434, 0x6a3a2c, 0x8a5038, 0x5e4a3e, 0x7e5c46], edge: 0x3a3634,
    particles: { kind: 'dust', n: 70, size: .035, color: [.75, .64, .54], speed: .3, alpha: .55 },   // 떠다니는 먼지 (kind: dust / sand / snow)
  },
  plains: {
    // 폐허 초원 (docs/art/ref/biome_plains.webp): 흐린 잿빛 하늘, 마른 카키 풀, 회색 콘크리트 폐허, 녹슨 철망
    name: '폐허 초원', sky: [0.62, 0.61, 0.58], fog: [0.6, 0.59, 0.55],
    fogNear: 18, fogFar: 66, hfog: [0.45, 2.6],
    light: { sky: [.46, .47, .48], ground: [.28, .26, .21], sun: [.62, .56, .46] },   // 흐린 낮: 해가 약하고 그늘이 부드러움
    grass: 0x8e8462, dirt: 0x5e5040, lane: 0x75716a, stone: 0x5e5a54, edge: 0x5a5650, hillSide: 0x766c4e,
    wall: 0x7e7a74, wall2: 0x5e5a54, glass: 0x1e2024, wood: 0x4e4034, leaves: 0x5e6040, flora: 'none',
    particles: { kind: 'dust', n: 50, size: .026, color: [.74, .71, .64], speed: .3, alpha: .35 },
  },
  desert: {
    // 모래 공업지대 (docs/art/ref/biome_desert.webp): 황토빛 모래 안개, 녹슨 골함석 창고, 굴뚝·크레인
    name: '모래 공업지대', sky: [0.74, 0.62, 0.5], fog: [0.72, 0.6, 0.47],
    fogNear: 14, fogFar: 56, hfog: [0.6, 3.4],
    light: { sky: [.5, .46, .42], ground: [.34, .28, .21], sun: [.8, .64, .46] },     // 먼지 낀 강한 해
    grass: 0xa8946e, dirt: 0x8a7656, lane: 0x86827a, stone: 0x6e6252, edge: 0x6e685e, hillSide: 0x9a845e,
    wall: 0x8a7e6e, wall2: 0x6a5e50, glass: 0x1e1c1a, wood: 0x5a4a3a, leaves: 0x6a6a46, flora: 'none',
    particles: { kind: 'sand', n: 110, size: .028, color: [.86, .74, .56], speed: 1.6, alpha: .55 },
  },
  snow: {
    // 얼어붙은 항구 (docs/art/ref/biome_snow.webp): 차가운 잿빛, 더러운 눈과 진창, 녹슨 컨테이너, 얼음 낀 바다
    name: '얼어붙은 항구', sky: [0.58, 0.6, 0.62], fog: [0.56, 0.58, 0.6],
    fogNear: 18, fogFar: 70, hfog: [0.4, 2.6],
    light: { sky: [.5, .53, .58], ground: [.34, .34, .35], sun: [.5, .5, .52] },     // 눈 오는 흐린 날: 해가 거의 없음
    grass: 0xbcc0c2, dirt: 0x4e4c48, lane: 0x6c6a66, stone: 0x4e4c48, edge: 0x5a5854, hillSide: 0x8e9294,
    wall: 0x6e6c68, wall2: 0x4e4c48, glass: 0x1e2024, wood: 0x4b3a2a, leaves: 0x4a5048, flora: 'none',
    particles: { kind: 'snow', n: 150, size: .045, color: [.9, .92, .94], speed: .9, alpha: .85 },
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
