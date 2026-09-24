// 고블린 키우기 - 크리스탈 상점 데이터 (game.js가 불러 쓴다)
//
// 크리스탈: 유료 재화. 지금은 '데모 결제'로만 충전된다 (실제 돈은 청구되지 않는다). 실제 결제로 바꾸려면 docs/PAYMENTS.md 를 보세요.
// 상품: 장비 상점(특별 옵션 장비, 시간마다 갱신), 장비 상자(등급 확률 공개), 유물, 편의(가방 확장), 시작 패키지(1회). 물약은 광고 보상으로만 얻는다.
// 광고: 광고를 끝까지 보면 크리스탈 10개와 물약 1개, 하루 3번까지.
(function (root) {
  const pct = (v) => Math.round(v * 1000) / 10;   // 0.125 → 12.5
  // ---- 크리스탈 충전 상품 (가격은 원). crystals에는 보너스가 포함돼 있다. ----
  const CRYSTAL_PACKS = [
    { id: 'c60',   crystals: 60,   bonus: 0,    price: 1200 },
    { id: 'c330',  crystals: 330,  bonus: 30,   price: 5900 },
    { id: 'c700',  crystals: 700,  bonus: 100,  price: 11000 },
    { id: 'c1500', crystals: 1500, bonus: 300,  price: 22000 },
    { id: 'c4000', crystals: 4000, bonus: 1000, price: 55000 },
  ];

  // ---- 물약: 광고를 볼 때 하나씩 받는다 (상점에서는 팔지 않는다). 잠시 동안 능력이 오른다. effect의 값은 +비율(0.5 = +50%). 겹쳐 받으면 시간이 늘어난다(최대 POTION_CAP초). ----
  // w는 광고에서 나올 가중치. 용사의 비약은 드물게 나온다.
  const POTION_CAP = 3 * 3600;
  const POTIONS = [
    { id: 'gold',  name: '황금 물약',   color: '#ffc93a', w: 22, dur: 1800, effect: { gold: 1.0 },              desc: '골드 획득 +100%' },
    { id: 'might', name: '힘의 물약',   color: '#ff6a5a', w: 22, dur: 1800, effect: { might: 0.5 },             desc: '공격력 +50%' },
    { id: 'haste', name: '신속의 물약', color: '#5ad8ff', w: 18, dur: 1800, effect: { haste: 0.4 },             desc: '공격 속도 +40%' },
    { id: 'exp',   name: '지혜의 물약', color: '#7be86a', w: 18, dur: 1800, effect: { exp: 1.0 },               desc: '경험치 획득 +100%' },
    { id: 'luck',  name: '행운의 물약', color: '#c07aff', w: 14, dur: 1800, effect: { luck: 1.0 },              desc: '장비 드롭 확률 ×2' },
    { id: 'hero',  name: '용사의 비약', color: '#ffe27a', w: 6,  dur: 3600, effect: { might: 0.5, gold: 0.5 },  desc: '공격력·골드 +50% (1시간)' },
  ];

  // ---- 장비 상자: 등급별 확률(%)을 화면에 그대로 공개한다. odds의 키는 등급 번호(0 노말 … 4 전설). ----
  const BOXES = [
    { id: 'box_fine',   name: '고급 장비 상자', price: 100, count: 3, odds: { 1: 60, 2: 30, 3: 9, 4: 1 },  desc: '장비 3개 (고급 이상 보장)' },
    { id: 'box_hero',   name: '영웅 장비 상자', price: 300, count: 1, odds: { 3: 85, 4: 15 },              desc: '장비 1개 (영웅 이상 보장)' },
    { id: 'box_legend', name: '전설 장비 상자', price: 900, count: 1, odds: { 4: 90, 5: 9, 6: 1 },        desc: '전설 이상 장비 1개 (유니크 9%, 신화 1%)' },
  ];

  // ---- 칸별 뽑기: 어떤 칸이 나올지 직접 고를 수 있다 (등급은 무작위, 위 상자와 같은 확률표). ----
  const SLOT_DRAWS = [
    { id: 'draw_weapon',    slot: 'weapon',    name: '무기 뽑기',     icon: 'sword',  price: 150, odds: { 1: 55, 2: 30, 3: 12, 4: 3 }, desc: '무기 1개 (고급 이상 보장)' },
    { id: 'draw_armor',     slot: 'armor',     name: '방어구 뽑기',   icon: 'shield', price: 150, odds: { 1: 55, 2: 30, 3: 12, 4: 3 }, desc: '방어구 1개 (고급 이상 보장)' },
    { id: 'draw_accessory', slot: 'accessory', name: '액세서리 뽑기', icon: 'gem',    price: 150, odds: { 1: 55, 2: 30, 3: 12, 4: 3 }, desc: '액세서리 1개 (고급 이상 보장)' },
  ];
  // ---- 유물 뽑기: 아직 없는 유물 중 하나를 무작위로 준다 (골라 살 때보다 싸다). 모두 가지고 있으면 살 수 없다. ----
  const RELIC_DRAW = { id: 'draw_relic', name: '유물 뽑기', icon: 'star', price: 400, desc: '아직 없는 유물 하나를 무작위로 얻어요' };

  // ---- 편의 ----
  const BAG_STEP = 6, BAG_EXTRA_MAX = 18;   // 가방 확장: 6칸씩, 최대 +18칸
  const UTILITIES = [
    { id: 'bag', name: '가방 확장', price: 80, desc: `가방이 ${BAG_STEP}칸 늘어나요 (최대 +${BAG_EXTRA_MAX}칸)` },
  ];

  // ---- 유물: 드롭 장비에는 없는 '특별 옵션'이 붙은 크리스탈 전용 상품 (한 번 사면 영구 보유, 환생해도 남는다) ----
  // 같은 옵션은 장비 드롭으로 얻을 수 없다. 한 번에 RELIC_SLOTS개까지만 장착할 수 있어서 무엇을 낄지 고르게 된다.
  // opts의 k는 game.js가 읽는 효과 이름, v는 값(0.25 = 25%), text는 화면에 보이는 설명이다.
  const RELIC_SLOTS = 2;
  const RELICS = [
    { id: 'relic_chrono',  name: '시간의 회중시계', icon: 'bolt',  color: '#5ad8ff', price: 700,  opts: [{ k: 'cdr', v: 0.25, text: '스킬 쿨타임 -25%' }],
      desc: '멈춘 듯한 초침이 스킬을 더 빨리 깨워요.' },
    { id: 'relic_scholar', name: '학자의 안경',     icon: 'book',  color: '#7be86a', price: 500,  opts: [{ k: 'exp', v: 0.5, text: '경험치 획득 +50%' }],
      desc: '레벨이 빨리 올라 전직도 그만큼 빨라져요.' },
    { id: 'relic_seal',    name: '왕의 인장',       icon: 'crown', color: '#ffe27a', price: 1200, opts: [{ k: 'token', v: 0.15, text: '환생 증표 획득 +15%' }],
      desc: '환생할 때 받는 왕의 증표가 늘어나요.' },
    { id: 'relic_horn',    name: '사냥꾼의 뿔피리', icon: 'skull', color: '#ff6a5a', price: 600,  opts: [{ k: 'boss', v: 0.4, text: '보스에게 주는 피해 +40%' }, { k: 'bossguard', v: 0.25, text: '보스에게 받는 피해 -25%' }],
      desc: '보스 앞에서 울리면 힘이 솟아요.' },
    { id: 'relic_phoenix', name: '불사조의 깃털',   icon: 'heart', color: '#ff9a3a', price: 700,  opts: [{ k: 'revive', v: 0.6, text: '쓰러졌을 때 부활 시간 -60%' }, { k: 'rescue', v: 1, text: '쓰러질 때 45초마다 한 번 체력 40%로 버팀' }],
      desc: '쓰러질 뻔해도 한 번은 다시 일어나요.' },
    { id: 'relic_aegis',   name: '수호자의 방패',   icon: 'shield', color: '#6fe0c0', price: 700, opts: [{ k: 'guard', v: 0.2, text: '받는 피해 -20%' }, { k: 'regen', v: 0.5, text: '체력 회복 +50%' }],
      desc: '어떤 공격도 한 번은 막아 줘요.' },
    { id: 'relic_vault',   name: '탐욕의 금고',     icon: 'coin',  color: '#ffc93a', price: 900,  opts: [{ k: 'gold', v: 0.3, text: '골드 획득 +30%' }, { k: 'offline', v: 2, text: '오프라인 보상 한도 +2시간' }],
      desc: '열쇠는 없지만 언제나 묵직해요.' },
    { id: 'relic_clover',  name: '네잎클로버',      icon: 'star',  color: '#c07aff', price: 800,  opts: [{ k: 'luck', v: 0.05, text: '장비 드롭 확률 +5%p' }, { k: 'rare', v: 0.5, text: '희귀 이상 등급 확률 ×1.5' }],
      desc: '좋은 장비가 더 자주, 더 좋게 떨어져요.' },
    { id: 'relic_bugle',   name: '동료의 나팔',     icon: 'party', color: '#5aa8ff', price: 600,  opts: [{ k: 'comp', v: 0.5, text: '동료 공격 +50%' }],
      desc: '나팔 소리에 동료 고블린들이 힘을 냅니다.' },
  ];

  // ---- 장비 상점: 특별 옵션이 하나 붙은 영웅·전설 장비를 판다. 정해진 시간마다 새로 들어오고, 크리스탈로 새로고침도 할 수 있다. ----
  // 특별 옵션은 장비 드롭에는 없다. 낀 동안 효과가 적용된다 (값은 비율, 0.12 = 12%). hero/legend는 등급별 값의 범위.
  const SPECIALS = [
    { k: 'exp',    prefix: '현자의',   text: (v) => `경험치 획득 +${pct(v)}%`,          hero: [0.10, 0.16], legend: [0.18, 0.28] },
    { k: 'boss',   prefix: '사냥꾼의', text: (v) => `보스에게 주는 피해 +${pct(v)}%`,   hero: [0.15, 0.25], legend: [0.28, 0.40] },
    { k: 'cdr',    prefix: '태엽의',   text: (v) => `스킬 쿨타임 -${pct(v)}%`,          hero: [0.08, 0.12], legend: [0.13, 0.18] },
    { k: 'guard',  prefix: '수호의',   text: (v) => `받는 피해 -${pct(v)}%`,            hero: [0.05, 0.08], legend: [0.09, 0.13] },
    { k: 'regen',  prefix: '생명의',   text: (v) => `체력 회복 +${pct(v)}%`,            hero: [0.20, 0.35], legend: [0.40, 0.60] },
    { k: 'luck',   prefix: '행운의',   text: (v) => `장비 드롭 확률 +${pct(v)}%p`,      hero: [0.010, 0.015], legend: [0.020, 0.030] },
    { k: 'token',  prefix: '왕의',     text: (v) => `환생 증표 +${pct(v)}%`,            hero: [0.03, 0.05], legend: [0.06, 0.09] },
    { k: 'revive', prefix: '불사조의', text: (v) => `부활 시간 -${pct(v)}%`,            hero: [0.15, 0.25], legend: [0.30, 0.45] },
  ];
  // 장비 상점: 칸마다 전설 25%, 유니크 6%, 신화 2% (나머지 영웅). 한 구간(4시간)에 신화가 하나라도 보일 확률: 새로고침 없이 약 11%, 3번 다 새로고침하면 약 38%
  const GEAR_SHOP = { count: 6, refreshSec: 4 * 3600, rerollCost: 40, rerollMax: 3, price: { 3: 450, 4: 1300, 5: 2400, 6: 4500 }, legendChance: 0.25, uniqueChance: 0.06, mythChance: 0.02 };
  // 신화 보장(천장): 장비 상자·칸별 뽑기에 쓴 크리스탈이 이만큼 쌓이면 다음 장비 하나는 신화 확정 (전설 상자 3개).
  // 운 좋게 신화가 먼저 나오면 처음부터 다시 쌓는다.
  const MYTH_PITY = 2700;

  // ---- 시작 패키지 (계정당 1번) ----
  const STARTER = { id: 'starter', name: '시작 패키지', price: 250, desc: '영웅 장비 1개 + 황금 물약 + 힘의 물약 (1회 한정)', items: { rarity: 3, count: 1 }, potions: ['gold', 'might'] };

  // ---- 출석 보상: 서버에 기록된 연속 출석 일수(7일 주기)마다 받는 크리스탈. 7일째가 가장 크다. ----
  const ATTEND_REWARDS = [3, 3, 5, 5, 8, 8, 20];

  // ---- 광고 ----
  const AD_DAILY_LIMIT = 3;   // 하루 3번 (자정에 초기화)
  const AD_CRYSTALS = 10;     // 광고 1번을 볼 때마다 받는 크리스탈 (물약도 하나 함께 받는다)
  const AD_SECONDS = 5;       // 데모 광고 길이

  const specialOf = (k) => SPECIALS.find((x) => x.k === k) || null;
  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const POTION_IDS = POTIONS.map((p) => p.id);

  const api = { MYTH_PITY, CRYSTAL_PACKS, POTIONS, BOXES, SLOT_DRAWS, RELIC_DRAW, UTILITIES, STARTER, POTION_CAP, POTION_IDS, BAG_STEP, BAG_EXTRA_MAX, AD_DAILY_LIMIT, AD_CRYSTALS, AD_SECONDS, RELICS, RELIC_SLOTS, ATTEND_REWARDS, SPECIALS, GEAR_SHOP, specialOf, byId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
