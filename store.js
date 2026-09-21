// 고블린 키우기 - 크리스탈 상점 데이터 (game.js가 불러 쓴다)
//
// 크리스탈: 유료 재화. 지금은 '데모 결제'로만 충전된다 (실제 돈은 청구되지 않는다). 실제 결제로 바꾸려면 docs/PAYMENTS.md 를 보세요.
// 상품: 물약(잠시 지속되는 효과), 장비 상자(등급 확률 공개), 편의(가방 확장), 시작 패키지(1회).
// 광고: 광고를 끝까지 보면 크리스탈 10개, 하루 3번까지.
(function (root) {
  // ---- 크리스탈 충전 상품 (가격은 원). crystals에는 보너스가 포함돼 있다. ----
  const CRYSTAL_PACKS = [
    { id: 'c60',   crystals: 60,   bonus: 0,    price: 1200 },
    { id: 'c330',  crystals: 330,  bonus: 30,   price: 5900 },
    { id: 'c700',  crystals: 700,  bonus: 100,  price: 11000 },
    { id: 'c1500', crystals: 1500, bonus: 300,  price: 22000 },
    { id: 'c4000', crystals: 4000, bonus: 1000, price: 55000 },
  ];

  // ---- 물약: 잠시 동안 능력이 오른다. effect의 값은 +비율(0.5 = +50%). 다시 사면 시간이 늘어난다(최대 POTION_CAP초). ----
  const POTION_CAP = 3 * 3600;
  const POTIONS = [
    { id: 'gold',  name: '황금 물약',   color: '#ffc93a', price: 60,  dur: 1800, effect: { gold: 1.0 },              desc: '골드 획득 +100%' },
    { id: 'might', name: '힘의 물약',   color: '#ff6a5a', price: 60,  dur: 1800, effect: { might: 0.5 },             desc: '공격력 +50%' },
    { id: 'haste', name: '신속의 물약', color: '#5ad8ff', price: 60,  dur: 1800, effect: { haste: 0.4 },             desc: '공격 속도 +40%' },
    { id: 'exp',   name: '지혜의 물약', color: '#7be86a', price: 80,  dur: 1800, effect: { exp: 1.0 },               desc: '경험치 획득 +100%' },
    { id: 'luck',  name: '행운의 물약', color: '#c07aff', price: 100, dur: 1800, effect: { luck: 1.0 },              desc: '장비 드롭 확률 ×2' },
    { id: 'hero',  name: '용사의 비약', color: '#ffe27a', price: 200, dur: 3600, effect: { might: 0.5, gold: 0.5 },  desc: '공격력·골드 +50% (1시간)' },
  ];
  // 즉시 효과 물약
  const INSTANT = [
    { id: 'sand', name: '시간의 모래', color: '#e8d8a0', price: 30, desc: '모든 스킬의 쿨타임을 바로 초기화해요' },
  ];

  // ---- 장비 상자: 등급별 확률(%)을 화면에 그대로 공개한다. odds의 키는 등급 번호(0 노말 … 4 전설). ----
  const BOXES = [
    { id: 'box_fine',   name: '고급 장비 상자', price: 100, count: 3, odds: { 1: 60, 2: 30, 3: 9, 4: 1 },  desc: '장비 3개 (고급 이상 보장)' },
    { id: 'box_hero',   name: '영웅 장비 상자', price: 300, count: 1, odds: { 3: 85, 4: 15 },              desc: '장비 1개 (영웅 이상 보장)' },
    { id: 'box_legend', name: '전설 장비 상자', price: 900, count: 1, odds: { 4: 100 },                    desc: '전설 장비 1개 (확정)' },
  ];

  // ---- 편의 ----
  const BAG_STEP = 6, BAG_EXTRA_MAX = 18;   // 가방 확장: 6칸씩, 최대 +18칸
  const UTILITIES = [
    { id: 'bag', name: '가방 확장', price: 80, desc: `가방이 ${BAG_STEP}칸 늘어나요 (최대 +${BAG_EXTRA_MAX}칸)` },
  ];

  // ---- 시작 패키지 (계정당 1번) ----
  const STARTER = { id: 'starter', name: '시작 패키지', price: 250, desc: '영웅 장비 1개 + 황금 물약 + 힘의 물약 (1회 한정)', items: { rarity: 3, count: 1 }, potions: ['gold', 'might'] };

  // ---- 광고 ----
  const AD_DAILY_LIMIT = 3;   // 하루 3번 (자정에 초기화)
  const AD_CRYSTALS = 10;     // 광고 1번을 볼 때마다 받는 크리스탈
  const AD_SECONDS = 5;       // 데모 광고 길이

  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const POTION_IDS = POTIONS.map((p) => p.id);

  const api = { CRYSTAL_PACKS, POTIONS, INSTANT, BOXES, UTILITIES, STARTER, POTION_CAP, POTION_IDS, BAG_STEP, BAG_EXTRA_MAX, AD_DAILY_LIMIT, AD_CRYSTALS, AD_SECONDS, byId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
