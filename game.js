// 고블린 키우기 - 게임 로직 (DOM과 무관한 순수 함수 모음)
(function (root) {
  const { ADVANCED3, ADVANCED4 } = typeof module !== 'undefined' && module.exports ? require('./classes.js') : root.GoblinClasses;
  const Sk = typeof module !== 'undefined' && module.exports ? require('./skills.js') : root.GoblinSkills;
  const St = typeof module !== 'undefined' && module.exports ? require('./store.js') : root.GoblinStore;
  const SAVE_VERSION = 1;
  const OFFLINE_CAP = 8 * 3600;   // 오프라인 보상은 최대 8시간까지
  const OFFLINE_MIN = 30;         // 이 시간(초) 이상 자리를 비웠을 때만 오프라인 보상 계산
  const KILLS_PER_STAGE = 5;      // 일반 스테이지는 몬스터 5마리를 잡으면 클리어
  const BOSS_EVERY = 5;           // 5의 배수 스테이지는 보스 1마리
  const DOWN_TIME = 3;            // 쓰러진 뒤 부활까지 걸리는 시간(초)
  const PRESTIGE_MIN_STAGE = 10;  // 환생 가능한 최소 스테이지
  const CLICK_MULT = 3;           // 직접 때리기는 한 번에 공격력의 3배

  // 강화 목록. cost(lv) = base * growth^lv (lv는 현재 레벨 = 다음 레벨업 비용)
  // 무기·갑옷·동료·약탈은 10레벨마다 효과가 1.5배가 된다 (마일스톤).
  const MILESTONE_EVERY = 10;
  const MILESTONE_MULT = 1.5;
  const mile = (lv) => Math.pow(MILESTONE_MULT, Math.floor(lv / MILESTONE_EVERY));
  const UPGRADES = {
    weapon:    { name: '무기',        icon: 'sword',  base: 10, growth: 1.30, max: Infinity, mile: true,
                 effect: (lv) => `공격력 ×${(( 1 + 0.25 * lv) * mile(lv)).toFixed(2)}` },
    armor:     { name: '갑옷',        icon: 'shield', base: 10, growth: 1.30, max: Infinity, mile: true,
                 effect: (lv) => `최대 체력 ×${((1 + 0.25 * lv) * mile(lv)).toFixed(2)}` },
    speed:     { name: '재빠른 손',   icon: 'boots',  base: 40, growth: 1.50, max: 30, mile: false,
                 effect: (lv) => `초당 공격 ${(1 + lv * 0.1).toFixed(1)}회` },
    companion: { name: '동료 고블린', icon: 'party',  base: 60, growth: 1.55, max: Infinity, mile: true,
                 effect: (lv) => `동료 ${lv}마리 (공격 ×${mile(lv).toFixed(2)})` },
    loot:      { name: '약탈 솜씨',   icon: 'pouch',  base: 40, growth: 1.45, max: Infinity, mile: true,
                 effect: (lv) => `골드 획득 ×${((1 + 0.15 * lv) * mile(lv)).toFixed(2)}` },
  };
  const UPGRADE_KEYS = Object.keys(UPGRADES);

  // ---- 직업 ----
  // 1차 전직은 Lv.10, 2차 Lv.20, 3차 Lv.30, 4차 Lv.40부터 가능. 환생하면 직업이 초기화된다.
  // 2차 직업마다 3차 2갈래, 3차마다 4차 2갈래 (3·4차 데이터는 classes.js)
  // mult 항목: dmg 공격력, hp 최대 체력, aps 공격 속도, gold 골드, comp 동료 공격, regen 체력 회복, click 직접 때리기
  const PROMO_LEVEL = { base: 10, adv: 20, adv3: 30, adv4: 40 };
  const PATH_FIELDS = ['cls', 'adv', 'adv3', 'adv4'];   // 저장하는 직업 경로: 1차~4차
  const PROMO_STAGES = ['base', 'adv', 'adv3', 'adv4'];  // 위 경로에 대응하는 전직 단계 이름
  const CLASSES = {
    warrior: { name: '전사',   desc: '튼튼한 체력과 빠른 회복. 오래 버티는 싸움이 특기.',
               mult: { hp: 1.5, regen: 1.3 }, adv: ['knight', 'berserker'] },
    archer:  { name: '궁수',   desc: '빠른 연사로 꾸준히 피해를 준다.',
               mult: { aps: 1.3 }, adv: ['sniper', 'ranger'] },
    mage:    { name: '마법사', desc: '강력한 마법 공격. 대신 체력이 약하다.',
               mult: { dmg: 1.35, hp: 0.85 }, adv: ['pyromancer', 'necromancer'] },
    rogue:   { name: '도적',   desc: '재빠른 손놀림으로 골드를 더 많이 훔친다.',
               mult: { gold: 1.4, dmg: 1.1 }, adv: ['assassin', 'pirate'] },
  };
  const ADVANCED = {
    knight:      { name: '기사',     parent: 'warrior', desc: '철벽 방어. 체력과 회복이 크게 늘지만 공격은 조금 약해진다.',
                   mult: { hp: 1.6, regen: 1.5, dmg: 0.9 } },
    berserker:   { name: '광전사',   parent: 'warrior', desc: '분노의 일격. 공격력이 크게 오르는 대신 체력이 줄어든다.',
                   mult: { dmg: 1.6, hp: 0.85 } },
    sniper:      { name: '저격수',   parent: 'archer',  desc: '한 방이 강력하다. 연사는 조금 느려진다.',
                   mult: { dmg: 1.6, aps: 0.9 } },
    ranger:      { name: '레인저',   parent: 'archer',  desc: '더 빠른 연사와 강해진 동료 공격.',
                   mult: { aps: 1.3, comp: 1.5 } },
    pyromancer:  { name: '화염술사', parent: 'mage',    desc: '불꽃 마법. 공격력이 오르고 직접 때리기가 두 배로 강해진다.',
                   mult: { dmg: 1.5, click: 2 } },
    necromancer: { name: '사령술사', parent: 'mage',    desc: '언데드를 부린다. 동료의 공격이 2배 이상 강해진다.',
                   mult: { comp: 2.2, dmg: 0.9 } },
    assassin:    { name: '암살자',   parent: 'rogue',   desc: '급소를 노린다. 공격력이 크게 오르고 골드도 조금 더 번다.',
                   mult: { dmg: 1.5, gold: 1.1 } },
    pirate:      { name: '해적',     parent: 'rogue',   desc: '보물 사냥꾼. 골드를 엄청나게 벌고 동료도 조금 강해진다.',
                   mult: { gold: 1.7, comp: 1.2 } },
  };

  // ---- 직업 트리 조회 ----
  const CLASS_TABLES = { 1: CLASSES, 2: ADVANCED, 3: ADVANCED3, 4: ADVANCED4 };
  const NODE = {};      // id → 직업 정의
  const TIER_OF = {};   // id → 몇 차 직업인지 (1~4)
  for (const t of [1, 2, 3, 4]) for (const id of Object.keys(CLASS_TABLES[t])) { NODE[id] = CLASS_TABLES[t][id]; TIER_OF[id] = t; }
  const classTier = (id) => TIER_OF[id] || 0;
  const parentOf = (id) => (TIER_OF[id] >= 2 ? NODE[id].parent : null);
  const childrenOf = (id) => {
    const t = TIER_OF[id];
    if (t === 1) return CLASSES[id].adv.slice();
    if (!t || t >= 4) return [];
    return Object.keys(CLASS_TABLES[t + 1]).filter((k) => CLASS_TABLES[t + 1][k].parent === id);
  };
  const ADV_IDS = Object.keys(NODE).filter((id) => TIER_OF[id] >= 2);   // 도감에 기록되는 직업 (2~4차) 전부
  const advIdsOfTier = (t) => Object.keys(CLASS_TABLES[t]);

  // 직업 보너스: 전직을 달성한 직업마다 공격력·골드가 영구히 늘어난다 (환생해도 유지). 차수가 높을수록 하나당 보너스는 작다.
  const MASTERY_BASE = { 2: 0.05, 3: 0.015, 4: 0.005 };
  // 도감 등급(동·은·금): 그 직업으로 도달한 최고 스테이지가 기준을 넘을 때마다 올라가고, 등급 하나당 그 직업 보너스가 기본값의 20%씩 늘어난다.
  const DEX_STAGES = { 2: [20, 35, 50], 3: [30, 45, 60], 4: [40, 55, 70] };
  const DEX_MEDALS = ['동', '은', '금'];
  const MEDAL_BONUS = 0.2;

  // ---- 증표 상점 (영구 강화 트리) ----
  // 환생으로 얻은 왕의 증표로 산다. 산 강화는 환생해도 유지된다. 레벨 lv → lv+1의 가격은 base × (lv+1)개.
  // req: 먼저 올려야 하는 강화 [[id, 레벨], ...]. tier는 화면에서 단계를 나누는 용도.
  const PERKS = {
    might:     { name: '용사의 힘',     icon: 'sword',  tier: 1, max: 10, base: 1, req: [],
                 per: '공격력 +10%', now: (lv) => `공격력 +${lv * 10}%` },
    greed:     { name: '탐욕',          icon: 'pouch',  tier: 1, max: 10, base: 1, req: [],
                 per: '골드 +10%', now: (lv) => `골드 +${lv * 10}%` },
    vitality:  { name: '강철 체력',     icon: 'heart',  tier: 1, max: 10, base: 1, req: [],
                 per: '최대 체력 +10%', now: (lv) => `최대 체력 +${lv * 10}%` },
    click:     { name: '강타',          icon: 'hand',   tier: 2, max: 5,  base: 2, req: [['might', 3]],
                 per: '직접 공격 +25%', now: (lv) => `직접 공격 +${lv * 25}%` },
    bond:      { name: '동료의 유대',   icon: 'party',  tier: 2, max: 10, base: 2, req: [['vitality', 3]],
                 per: '동료 공격 +10%', now: (lv) => `동료 공격 +${lv * 10}%` },
    rest:      { name: '든든한 휴식',   icon: 'scroll', tier: 2, max: 4,  base: 2, req: [['greed', 3]],
                 per: '오프라인 보상 한도 +1시간', now: (lv) => `오프라인 보상 최대 ${8 + lv}시간` },
    luck:      { name: '수집가',        icon: 'gem',    tier: 2, max: 10, base: 2, req: [['greed', 2]],
                 per: '장비 드롭 확률 +1.5%p', now: (lv) => `장비 드롭 확률 +${(lv * 1.5).toFixed(1)}%p` },
    headstart: { name: '빠른 출발',     icon: 'bolt',   tier: 3, max: 5,  base: 3, req: [['might', 5]],
                 per: '환생 후 무기·갑옷 Lv.+3 상태로 시작', now: (lv) => `무기·갑옷 Lv.${lv * HEADSTART_LV}로 시작` },
    kingly:    { name: '왕의 위엄',     icon: 'crown',  tier: 3, max: 5,  base: 5, req: [['might', 5], ['greed', 5]],
                 per: '공격력·골드 +5%', now: (lv) => `공격력·골드 +${lv * 5}%` },
  };
  const PERK_KEYS = Object.keys(PERKS);
  const HEADSTART_LV = 3;

  // 지역은 10스테이지마다 바뀌고, 지역마다 나오는 몬스터와 보스가 다르다. [그림 종류, 이름]
  const BIOME_COUNT = 6;
  const MONSTER_TABLE = [
    { normals: [['slime', '숲 슬라임'], ['wolf', '늑대'], ['boar', '멧돼지'], ['spider', '숲거미'], ['snake', '독뱀']],
      bosses:  [['ogre', '숲의 트롤'], ['golem', '고목 골렘']] },
    { normals: [['bat', '박쥐'], ['spider', '동굴거미'], ['slime', '동굴 슬라임'], ['skeleton', '광부 해골'], ['ghost', '동굴 유령']],
      bosses:  [['spider', '거미 여왕'], ['golem', '수정 골렘']] },
    { normals: [['scorpion', '전갈'], ['snake', '사막뱀'], ['golem', '모래 골렘'], ['slime', '모래 슬라임'], ['bat', '사막 박쥐']],
      bosses:  [['scorpion', '전갈 대왕'], ['dragon', '모래 용']] },
    { normals: [['wolf', '서리늑대'], ['slime', '얼음 슬라임'], ['golem', '얼음 골렘'], ['bat', '서리박쥐'], ['ghost', '설원 유령']],
      bosses:  [['ogre', '설인'], ['dragon', '얼음 용']] },
    { normals: [['imp', '꼬마 악마'], ['slime', '용암 슬라임'], ['golem', '용암 골렘'], ['scorpion', '불전갈'], ['bat', '화염 박쥐']],
      bosses:  [['dragon', '화염 용'], ['imp', '마왕']] },
    { normals: [['skeleton', '해골 병사'], ['ghost', '유령'], ['bat', '흡혈 박쥐'], ['imp', '가고일'], ['spider', '저주 거미']],
      bosses:  [['skeleton', '해골 군주'], ['dragon', '뼈 용']] },
  ];

  // ---- 업적 ----
  // val(s)이 goal에 닿으면 달성. 달성할 때마다 공격력·골드가 영구히 +2%, 환생해도 유지된다.
  const ACHIEVE_BONUS = 0.02;
  const masteredIn = (s, tier) => Object.keys(s.mastered).filter((id) => TIER_OF[id] === tier).length;
  const maxUpgradeLv = (s) => Math.max(...UPGRADE_KEYS.map((k) => s.upgrades[k]));
  const ACHIEVEMENTS = [
    { id: 'kill100',    icon: 'sword',   name: '사냥꾼',         desc: '몬스터 100마리 처치',       goal: 100,   val: (s) => s.totalKills },
    { id: 'kill1000',   icon: 'sword',   name: '학살자',         desc: '몬스터 1,000마리 처치',     goal: 1000,  val: (s) => s.totalKills },
    { id: 'kill10000',  icon: 'skull',   name: '재앙',           desc: '몬스터 10,000마리 처치',    goal: 10000, val: (s) => s.totalKills },
    { id: 'stage10',    icon: 'star',    name: '숲을 벗어나다',  desc: '스테이지 10 도달',          goal: 10,    val: (s) => s.bestStage },
    { id: 'stage30',    icon: 'star',    name: '탐험가',         desc: '스테이지 30 도달',          goal: 30,    val: (s) => s.bestStage },
    { id: 'stage50',    icon: 'star',    name: '정복자',         desc: '스테이지 50 도달',          goal: 50,    val: (s) => s.bestStage },
    { id: 'level30',    icon: 'arrowup', name: '베테랑',         desc: '레벨 30 달성',              goal: 30,    val: (s) => s.level },
    { id: 'upgrade50',  icon: 'anvil',   name: '강화 장인',      desc: '강화 하나를 Lv.50까지',     goal: 50,    val: maxUpgradeLv },
    { id: 'prestige1',  icon: 'crown',   name: '첫 환생',        desc: '환생 1회',                  goal: 1,     val: (s) => s.prestiges },
    { id: 'prestige5',  icon: 'crown',   name: '윤회하는 왕',    desc: '환생 5회',                  goal: 5,     val: (s) => s.prestiges },
    { id: 'codex4',     icon: 'cap',     name: '다재다능',       desc: '2차 직업 4종 달성',         goal: 4,     val: (s) => masteredIn(s, 2) },
    { id: 'codex8',     icon: 'book',    name: '도감 완성',      desc: '2차 직업 8종 모두 달성',    goal: 8,     val: (s) => masteredIn(s, 2) },
    { id: 'tier3',      icon: 'cap',     name: '세 번째 길',     desc: '3차 전직 달성',             goal: 1,     val: (s) => masteredIn(s, 3) },
    { id: 'tier4',      icon: 'crown',   name: '정점에 서다',    desc: '4차 전직 달성',             goal: 1,     val: (s) => masteredIn(s, 4) },
    { id: 'elite8',     icon: 'book',    name: '전설의 수집가',  desc: '4차 직업 8종 달성',         goal: 8,     val: (s) => masteredIn(s, 4) },
  ];
  const achieveMult = (s) => 1 + ACHIEVE_BONUS * Object.keys(s.achieved).length;

  // 새로 달성한 업적을 기록하고 사건({type:'achieve', id})을 ev에 추가한다
  function checkAchievements(s, ev) {
    ev = ev || [];
    for (const a of ACHIEVEMENTS) {
      if (!s.achieved[a.id] && a.val(s) >= a.goal) {
        s.achieved[a.id] = true;
        ev.push({ type: 'achieve', id: a.id });
      }
    }
    return ev;
  }

  // ---- 장비 ----
  // 몬스터를 잡으면 확률로 떨어진다. 등급이 높을수록 확률이 낮고, 보스는 높은 등급이 훨씬 잘 나온다.
  // 수치는 드롭된 스테이지(아이템 레벨)가 높을수록 커진다.
  const RARITIES = [
    { name: '노말', color: '#b9c2d0', w: 62,  bossW: 0,  gold: 3 },     // w: 일반 몬스터 가중치, bossW: 보스 가중치, gold: 판매가 배율
    { name: '고급', color: '#6fe06a', w: 25,  bossW: 45, gold: 8 },
    { name: '희귀', color: '#5aa8ff', w: 9.5, bossW: 35, gold: 25 },
    { name: '영웅', color: '#c07aff', w: 3,   bossW: 16, gold: 80 },
    { name: '전설', color: '#ffc93a', w: 0.5, bossW: 4,  gold: 300 },
  ];
  const RARITY_PREFIX = ['낡은', '튼튼한', '빛나는', '고귀한', '찬란한'];
  const DROP_CHANCE = 0.08;        // 일반 몬스터가 장비를 떨어뜨릴 확률
  const BOSS_DROP_CHANCE = 0.5;    // 보스
  const LUCK_PER_LV = 0.015;       // 증표 상점 '수집가' 레벨당 드롭 확률 추가(+1.5%p)
  const BAG_MAX = 24;              // 기본 가방 칸 수 (가방 확장으로 늘어난다). 가득 차면 새로 얻은 장비는 자동으로 팔린다
  const bagLimit = (s) => BAG_MAX + s.bagExtra;
  const GEAR_SCALE_STAGE = 40;     // 아이템 레벨이 이만큼 오를 때마다 수치가 기본값만큼 더 붙는다 (스테이지 40 = 2배)
  // 종류마다 올려 주는 능력(kind)과 등급별 기본 수치(%: 노말·고급·희귀·영웅·전설), 이름에 쓰는 명사
  const GEAR = {
    weapon:    { name: '무기',     icon: 'sword',  kinds: {
      dmg:   { label: '공격력',    base: [4, 7, 11, 17, 26],   nouns: [['club', '몽둥이'], ['dagger', '단검'], ['hatchet', '손도끼'], ['sword', '장검'], ['staff', '지팡이']] } } },
    armor:     { name: '방어구',   icon: 'shield', kinds: {
      hp:    { label: '최대 체력', base: [6, 10, 16, 24, 36],  nouns: [['leather', '가죽 갑옷'], ['chainmail', '쇠사슬 갑옷'], ['plate', '판금 갑옷'], ['robe', '로브']] } } },
    accessory: { name: '액세서리', icon: 'gem',    kinds: {
      gold:  { label: '골드 획득', base: [6, 10, 15, 23, 34],  nouns: [['goldring', '황금 반지'], ['luckynecklace', '행운의 목걸이']] },
      aps:   { label: '공격 속도', base: [2, 3.5, 5.5, 8, 12], nouns: [['galebracelet', '질풍의 팔찌'], ['featherearring', '깃털 귀걸이']] },
      comp:  { label: '동료 공격', base: [5, 9, 14, 21, 32],   nouns: [['charm', '동료의 부적'], ['friendring', '우정의 반지']] },
      click: { label: '직접 공격', base: [8, 14, 22, 33, 50],  nouns: [['glove', '강타의 장갑'], ['armband', '용사의 완장']] } } },
  };
  const SLOT_KEYS = Object.keys(GEAR);
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);   // 'constructor' 같은 이름을 걸러내려고 in/[] 대신 쓴다

  // 테스트에서 드롭을 고정하려고 난수 함수를 바꿀 수 있게 한다
  let rnd = Math.random;
  function setRandom(fn) { rnd = fn || Math.random; }

  const kindDef = (it) => GEAR[it.slot].kinds[it.kind];
  const itemNoun = (it) => { const nouns = kindDef(it).nouns; return nouns[it.n % nouns.length]; };   // [디자인 id, 이름]
  const itemName = (it) => RARITY_PREFIX[it.r] + ' ' + itemNoun(it)[1];
  // 장비 그림 이름 (images/gear/<디자인 id>). 같은 이름의 장비는 같은 모양이고 등급은 테두리 색으로 구분한다.
  const itemDesign = (it) => itemNoun(it)[0];
  const GEAR_DESIGNS = [];
  for (const slot of Object.keys(GEAR)) for (const kind of Object.keys(GEAR[slot].kinds)) for (const [id] of GEAR[slot].kinds[kind].nouns) GEAR_DESIGNS.push(id);
  const round1 = (x) => Math.round(x * 10) / 10;
  const maxItemVal = (slot, kind, r, ilvl) => round1(GEAR[slot].kinds[kind].base[r] * (1 + ilvl / GEAR_SCALE_STAGE) * 1.15) + 0.1;
  const sellValue = (it) => Math.ceil(monsterGold(it.ilvl) * RARITIES[it.r].gold);

  function rollRarity(boss) {
    const key = boss ? 'bossW' : 'w';
    let total = 0;
    for (const r of RARITIES) total += r[key];
    let x = rnd() * total;
    for (let i = 0; i < RARITIES.length; i++) {
      x -= RARITIES[i][key];
      if (x < 0) return i;
    }
    return RARITIES.length - 1;
  }

  // stage에서 얻는 장비 하나를 굴린다
  function rollItem(s, stage, boss, forceRarity) {
    const r = forceRarity !== undefined ? forceRarity : rollRarity(boss);
    const slot = SLOT_KEYS[Math.floor(rnd() * SLOT_KEYS.length)];
    const kinds = Object.keys(GEAR[slot].kinds);
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const def = GEAR[slot].kinds[kind];
    const val = round1(def.base[r] * (1 + stage / GEAR_SCALE_STAGE) * (0.85 + rnd() * 0.3));   // ±15% 무작위
    s.itemSeq += 1;
    return { id: s.itemSeq, slot, kind, r, ilvl: stage, val, n: Math.floor(rnd() * def.nouns.length) };
  }

  const dropChance = (s, boss) => ((boss ? BOSS_DROP_CHANCE : DROP_CHANCE) + LUCK_PER_LV * perkLv(s, 'luck')) * (1 + potionV(s, 'luck'));
  // 같은 능력을 올려 주면서 수치가 더 큰 장비이거나, 칸이 비어 있으면 '더 좋은' 장비
  const isUpgrade = (s, it) => { const cur = s.equip[it.slot]; return !cur || (cur.kind === it.kind && it.val > cur.val); };

  // 장비를 가방에 넣는다. 자동 판매 등급 이하이거나 가방이 가득 차면 판다. 결과: 'bag' | 'sold'
  function stow(s, it) {
    if (it.r <= s.autoSell || s.bag.length >= bagLimit(s)) {
      s.gold += sellValue(it);
      return 'sold';
    }
    s.bag.push(it);
    return 'bag';
  }

  // 새로 얻은 장비 처리: 자동 장착 → 아니면 가방(또는 판매). drop 사건을 ev에 남긴다.
  function receiveItem(s, it, ev) {
    let action, replaced = null;
    if (s.autoEquip && isUpgrade(s, it)) {
      const before = maxHp(s);
      replaced = s.equip[it.slot];
      s.equip[it.slot] = it;
      s.hp += Math.max(0, maxHp(s) - before);
      if (replaced) stow(s, replaced);
      action = 'equipped';
    } else {
      action = stow(s, it);
    }
    ev.push({ type: 'drop', item: it, action, gold: action === 'sold' ? sellValue(it) : 0 });
  }

  function equipItem(s, id) {
    const i = s.bag.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const it = s.bag[i];
    const before = maxHp(s);
    const old = s.equip[it.slot];
    s.bag.splice(i, 1);
    s.equip[it.slot] = it;
    if (old) s.bag.push(old);
    s.hp = Math.min(maxHp(s), s.hp + Math.max(0, maxHp(s) - before));
    return true;
  }
  function unequipItem(s, slot) {
    const it = s.equip[slot];
    if (!it || s.bag.length >= bagLimit(s)) return false;
    s.equip[slot] = null;
    s.bag.push(it);
    s.hp = Math.min(s.hp, maxHp(s));
    return true;
  }
  // 가방의 장비 하나를 판다. 받은 골드를 돌려준다 (없으면 -1)
  function sellBagItem(s, id) {
    const i = s.bag.findIndex((x) => x.id === id);
    if (i < 0) return -1;
    const g = sellValue(s.bag[i]);
    s.gold += g;
    s.bag.splice(i, 1);
    return g;
  }
  // 가방에서 등급이 maxRarity 이하인 장비를 모두 판다 (장착 중인 것은 그대로)
  function sellBagUpTo(s, maxRarity) {
    let n = 0, gold = 0;
    s.bag = s.bag.filter((it) => {
      if (it.r > maxRarity) return true;
      gold += sellValue(it); n += 1;
      return false;
    });
    s.gold += gold;
    return { n, gold };
  }
  // 여러 개를 골라서 판다. 가방에 없는 번호는 무시한다. { n, gold }
  function sellBagItems(s, ids) {
    const set = new Set(ids);
    let n = 0, gold = 0;
    s.bag = s.bag.filter((it) => {
      if (!set.has(it.id)) return true;
      gold += sellValue(it); n += 1;
      return false;
    });
    s.gold += gold;
    return { n, gold };
  }
  // 지금 낀 장비(같은 칸·같은 능력)보다 수치가 같거나 낮아서 쓸모없어진 가방 장비. 다른 능력의 장비는 비교할 수 없어서 포함하지 않는다.
  const isWeaker = (s, it) => { const cur = s.equip[it.slot]; return !!cur && cur.kind === it.kind && it.val <= cur.val; };
  const bagWeaker = (s) => s.bag.filter((it) => isWeaker(s, it));
  // 장착한 장비가 kind 능력에 주는 배율 (1 = 효과 없음)
  const gearMult = (s, kind) => {
    let v = 0;
    for (const slot of SLOT_KEYS) { const it = s.equip[slot]; if (it && it.kind === kind) v += it.val; }
    return 1 + v / 100;
  };

  // ---- 크리스탈 상점 ----
  // 지금 날짜 문자열 (기기의 현지 시각 기준, 자정에 바뀐다)
  // 하루는 한국 시간(UTC+9) 자정에 바뀐다. 기기의 시간대 설정을 바꿔도 날짜가 달라지지 않게 고정했다.
  const dayKey = (now) => { const d = new Date(now + 9 * 3600e3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };

  // 크리스탈 충전: 같은 주문 번호는 한 번만 지급한다 (결제 화면이 두 번 눌려도 두 번 받지 않는다)
  function creditCrystals(s, amount, orderId) {
    if (!(amount > 0) || typeof orderId !== 'string' || !orderId) return { ok: false, reason: 'invalid' };
    if (s.orders.includes(orderId)) return { ok: false, reason: 'duplicate' };
    s.crystals += Math.floor(amount);
    s.orders.push(orderId);
    if (s.orders.length > 50) s.orders.shift();
    return { ok: true };
  }
  // 상점에서 산 장비를 넣는다. 더 좋으면 바로 장착하고, 아니면 가방에 넣는다 (돈 주고 산 장비는 자동 판매하지 않는다).
  function giveItem(s, it) {
    if (s.autoEquip && isUpgrade(s, it)) {
      const before = maxHp(s), old = s.equip[it.slot];
      s.equip[it.slot] = it;
      s.hp += Math.max(0, maxHp(s) - before);
      if (old) s.bag.push(old);
      return 'equipped';
    }
    s.bag.push(it);
    return 'bag';
  }
  // 확률표(odds: { 등급: 가중치 })로 등급 하나를 고른다
  function rollFromOdds(odds) {
    const keys = Object.keys(odds).map(Number);
    let total = 0;
    for (const k of keys) total += odds[k];
    let x = rnd() * total;
    for (const k of keys) { x -= odds[k]; if (x < 0) return k; }
    return keys[keys.length - 1];
  }
  const shopItemLevel = (s) => Math.max(10, s.bestStage);   // 상자 장비의 레벨: 지금까지 도달한 최고 스테이지 기준

  // 크리스탈로 상품을 산다. 결과: { ok, reason?, product, items? }
  //   reason: 'unknown' 없는 상품 | 'crystals' 크리스탈 부족 | 'bag' 가방 공간 부족 | 'max' 더 못 삼 | 'owned' 이미 산 1회 상품
  function buyProduct(s, id) {
    const potion = St.byId(St.POTIONS, id), instant = St.byId(St.INSTANT, id), box = St.byId(St.BOXES, id), util = St.byId(St.UTILITIES, id);
    const starter = id === St.STARTER.id ? St.STARTER : null;
    const product = potion || instant || box || util || starter;
    if (!product) return { ok: false, reason: 'unknown' };
    if (s.crystals < product.price) return { ok: false, reason: 'crystals', product };
    const needSpace = box ? box.count : starter ? starter.items.count : 0;
    if (needSpace && s.bag.length + needSpace > bagLimit(s)) return { ok: false, reason: 'bag', product };
    if (util && s.bagExtra >= St.BAG_EXTRA_MAX) return { ok: false, reason: 'max', product };
    if (starter && s.bought.starter) return { ok: false, reason: 'owned', product };

    s.crystals -= product.price;
    const items = [];
    if (potion) s.potions[potion.id] = Math.min(St.POTION_CAP, (s.potions[potion.id] || 0) + potion.dur);
    else if (instant) { for (const k of Object.keys(s.skillCd)) s.skillCd[k] = 0; }   // 시간의 모래: 모든 스킬이 바로 준비된다
    else if (box) for (let i = 0; i < box.count; i++) { const it = rollItem(s, shopItemLevel(s), false, rollFromOdds(box.odds)); giveItem(s, it); items.push(it); }
    else if (util) s.bagExtra += St.BAG_STEP;
    else if (starter) {
      const it = rollItem(s, shopItemLevel(s), false, starter.items.rarity); giveItem(s, it); items.push(it);
      for (const pid of starter.potions) { const p = St.byId(St.POTIONS, pid); s.potions[pid] = Math.min(St.POTION_CAP, (s.potions[pid] || 0) + p.dur); }
      s.bought.starter = true;
    }
    return { ok: true, product, items };
  }

  // ---- 광고 보상: 광고를 끝까지 보면 크리스탈 10개, 하루 3번까지 ----
  // 광고 횟수를 세는 '오늘'. 기기 시계는 사용자가 바꿀 수 있어서 서버 시각(serverNow, 없으면 null)을 기준으로 한다.
  // 서버 시각을 못 받으면(오프라인 등) 새 날로 넘어가지 않고 마지막으로 확인된 날짜에 머문다. 시계를 앞으로 돌려도 뒤로 돌려도 횟수는 늘지 않는다.
  function adToday(s, serverNow, localNow) {
    if (Number.isFinite(serverNow)) { const d = dayKey(serverNow); if (d > s.adClock) s.adClock = d; return s.adClock; }
    if (!s.adClock) s.adClock = dayKey(localNow);
    return s.adClock;
  }
  function adStatus(s, day) {
    const used = s.adLog.day === day ? s.adLog.n : 0;
    return { used, left: Math.max(0, St.AD_DAILY_LIMIT - used), limit: St.AD_DAILY_LIMIT };
  }
  // 광고를 끝까지 봤을 때 부른다. 하루 횟수가 남았으면 크리스탈을 준다. 결과: { ok, reason?, left, crystals }
  function claimAd(s, day) {
    const st = adStatus(s, day);
    if (st.left <= 0) return { ok: false, reason: 'limit', left: 0, crystals: 0 };
    s.adLog = { day, n: st.used + 1 };
    s.crystals += St.AD_CRYSTALS;
    return { ok: true, left: st.left - 1, crystals: St.AD_CRYSTALS };
  }

  // ---- 상태 ----
  function createState(now) {
    const s = {
      v: SAVE_VERSION,
      gold: 0,
      level: 1,
      exp: 0,
      stage: 1,
      killsInStage: 0,
      runBest: 1,        // 이번 판에서 도달한 최고 스테이지 (환생 보상 기준)
      bestStage: 1,      // 모든 판을 통틀어 최고 스테이지
      totalKills: 0,
      upgrades: { weapon: 0, armor: 0, speed: 0, companion: 0, loot: 0 },
      tokens: 0,         // 환생으로 얻은 왕의 증표 (공격력·골드 +40%씩)
      prestiges: 0,
      cls: null,         // 1차 직업 (전사·궁수·마법사·도적)
      adv: null,         // 2차 직업
      adv3: null,        // 3차 직업
      adv4: null,        // 4차 직업
      mastered: {},      // 2~4차 전직을 달성한 직업 도감 (환생해도 유지)
      achieved: {},      // 달성한 업적 (환생해도 유지)
      dex: {},           // 도감 기록: 2차 직업별 { best 최고 스테이지, kills 처치 수, runs 전직 횟수 } (환생해도 유지)
      perks: {},         // 증표 상점에서 산 영구 강화 { id: 레벨 } (환생해도 유지)
      equip: { weapon: null, armor: null, accessory: null },   // 장착한 장비 (환생해도 유지)
      bag: [],           // 가방 (환생해도 유지)
      itemSeq: 0,        // 장비 번호를 매기는 카운터
      autoEquip: true,   // 더 좋은 장비를 얻으면 자동으로 장착
      autoSell: 0,       // 이 등급 이하는 얻자마자 자동 판매 (-1 없음, 0 노말, 1 고급, 2 희귀)
      hp: 0,
      monsterHp: 0,
      monsterMax: 0,
      isBoss: false,
      downT: 0,
      atkT: 0,
      dealt: 0,          // 표시용: 최근에 준 피해량 (저장하지 않음)
      crystals: 0,       // 크리스탈(유료 재화). 지금은 데모 결제로만 충전된다
      potions: {},       // 지금 효과가 남아 있는 물약 { id: 남은 초 }
      adClock: '',       // 서버 시각으로 마지막에 확인된 날짜 (광고 횟수를 세는 '오늘'이 뒤로 가지 못하게 한다)
      adLog: { day: '', n: 0 },   // 광고 시청 기록: 그날(YYYY-MM-DD)에 몇 번 봤는지
      bagExtra: 0,       // 가방 확장으로 늘어난 칸 수 (6칸씩)
      bought: {},        // 1회 한정 상품을 샀는지 { starter: true }
      orders: [],        // 크리스탈 충전 주문 번호 (같은 주문이 두 번 지급되지 않게 최근 것만 기억)
      skillCd: {},       // 스킬별 남은 쿨타임(초). 저장은 되지만 불러올 때 새로 시작한다 (표시·계산용)
      buffs: {},         // 지금 걸려 있는 스킬 효과 { haste|might|guard|greed|lifesteal|stun|barrier: { t 남은 시간, v 위력(방벽은 남은 방벽량) } }
      dot: null,         // 몬스터에게 걸린 지속 피해 { t 남은 시간, dps 초당 피해, variant } (몬스터가 바뀌면 사라진다)
      hits: 0,           // 표시용: 지금까지 고블린이 때린 횟수. 화면이 타격 연출을 넣는 시점을 알려고 쓴다 (저장하지 않음)
      savedAt: now || 0,
    };
    s.hp = maxHp(s);
    spawnMonster(s);
    return s;
  }

  // ---- 능력치 계산 ----
  const TOKEN_BONUS = 0.4;   // 왕의 증표 1개당 공격력·골드 보너스
  const tokenMult = (s) => 1 + TOKEN_BONUS * s.tokens;
  const dexRecord = (s, id) => s.dex[id] || { best: 0, kills: 0, runs: 0 };
  const dexStages = (id) => DEX_STAGES[TIER_OF[id]] || [];
  // 도감 등급 0(없음)~3(금): 그 직업으로 도달한 최고 스테이지 기준
  const dexTier = (s, id) => dexStages(id).filter((st) => dexRecord(s, id).best >= st).length;
  // 직업 하나가 주는 공격력·골드 보너스 (예: 0.05 = +5%)
  const masteryOf = (s, id) => (MASTERY_BASE[TIER_OF[id]] || 0) * (1 + MEDAL_BONUS * dexTier(s, id));
  function masteryMult(s) {
    let m = 1;
    for (const id of Object.keys(s.mastered)) m += masteryOf(s, id);
    return m;
  }
  function dexEntry(s, id) {
    if (!s.dex[id]) s.dex[id] = { best: 0, kills: 0, runs: 0 };
    return s.dex[id];
  }

  // ---- 증표 상점 ----
  const perkLv = (s, id) => s.perks[id] || 0;
  const perkCost = (s, id) => PERKS[id].base * (perkLv(s, id) + 1);
  // 지금까지 강화에 쓴 증표 (저장하지 않고 산 강화 레벨에서 계산하므로 저장 데이터를 고쳐도 속일 수 없다)
  const perkSpent = (s) => PERK_KEYS.reduce((sum, id) => sum + PERKS[id].base * perkLv(s, id) * (perkLv(s, id) + 1) / 2, 0);
  // 쓸 수 있는 증표. 공격력·골드 보너스(tokenMult)는 지금까지 번 총 개수(s.tokens) 기준이라 써도 줄지 않는다.
  const tokenBalance = (s) => s.tokens - perkSpent(s);
  const perkMissing = (s, id) => PERKS[id].req.filter(([rid, lv]) => perkLv(s, rid) < lv);
  const perkUnlocked = (s, id) => perkMissing(s, id).length === 0;
  const canBuyPerk = (s, id) =>
    perkLv(s, id) < PERKS[id].max && perkUnlocked(s, id) && tokenBalance(s) >= perkCost(s, id);
  function buyPerk(s, id) {
    if (!PERKS[id] || !canBuyPerk(s, id)) return false;
    const before = maxHp(s);
    s.perks[id] = perkLv(s, id) + 1;
    s.hp += Math.max(0, maxHp(s) - before);   // 체력 강화는 늘어난 만큼 바로 회복
    return true;
  }
  // 산 강화를 모두 되돌리고 증표를 돌려받는다. 돌려받은 증표 수를 알려준다.
  function respecPerks(s) {
    const back = perkSpent(s);
    s.perks = {};
    s.hp = Math.min(s.hp, maxHp(s));
    return back;
  }
  const offlineCap = (s) => OFFLINE_CAP + 3600 * perkLv(s, 'rest');
  const kinglyMult = (s) => 1 + 0.05 * perkLv(s, 'kingly');
  // 1~4차 직업의 배율을 모두 곱한 값 (해당 항목이 없으면 1)
  function statMult(s, key) {
    let m = 1;
    for (const f of PATH_FIELDS) { const id = s[f]; if (id) m *= NODE[id].mult[key] || 1; }
    return m;
  }
  // 물약 효과: 남은 시간이 있는 물약들의 kind 효과(+비율)를 더한다
  const potionV = (s, kind) => {
    let v = 0;
    for (const p of St.POTIONS) if (s.potions[p.id] > 0 && p.effect[kind]) v += p.effect[kind];
    return v;
  };
  const buffV = (s, kind) => (s.buffs[kind] ? s.buffs[kind].v : 0);   // 스킬 효과의 위력 (없으면 0)
  const baseDmg = (s) => 3 + 1.5 * (s.level - 1);
  const maxHp = (s) => (50 + 12 * (s.level - 1)) * (1 + 0.25 * s.upgrades.armor) * mile(s.upgrades.armor) * statMult(s, 'hp') * (1 + 0.1 * perkLv(s, 'vitality')) * gearMult(s, 'hp');
  const hitDmg = (s) =>
    baseDmg(s) * (1 + 0.25 * s.upgrades.weapon) * mile(s.upgrades.weapon) * tokenMult(s) * masteryMult(s) * achieveMult(s) * statMult(s, 'dmg') * (1 + 0.1 * perkLv(s, 'might')) * kinglyMult(s) * gearMult(s, 'dmg') * (1 + buffV(s, 'might') + potionV(s, 'might'));
  const attacksPerSec = (s) => (1 + 0.1 * s.upgrades.speed) * statMult(s, 'aps') * gearMult(s, 'aps') * (1 + buffV(s, 'haste') + potionV(s, 'haste'));
  const companionDps = (s) => s.upgrades.companion * mile(s.upgrades.companion) * hitDmg(s) * 0.35 * statMult(s, 'comp') * (1 + 0.1 * perkLv(s, 'bond')) * gearMult(s, 'comp');
  const goldMult = (s) =>
    (1 + 0.15 * s.upgrades.loot) * mile(s.upgrades.loot) * tokenMult(s) * masteryMult(s) * achieveMult(s) * statMult(s, 'gold') * (1 + 0.1 * perkLv(s, 'greed')) * kinglyMult(s) * gearMult(s, 'gold') * (1 + potionV(s, 'gold'));
  const totalDps = (s) => hitDmg(s) * attacksPerSec(s) + companionDps(s);
  const expNeeded = (s) => Math.ceil(15 * Math.pow(1.3, s.level - 1));

  const isBossStage = (stage) => stage % BOSS_EVERY === 0;
  const monsterMaxHp = (stage) =>
    Math.round(24 * Math.pow(1.25, stage - 1)) * (isBossStage(stage) ? 6 : 1);
  const monsterAtk = (stage) =>
    2 * Math.pow(1.19, stage - 1) * (isBossStage(stage) ? 1.5 : 1);
  const monsterGold = (stage) =>
    Math.ceil(4 * Math.pow(1.21, stage - 1)) * (isBossStage(stage) ? 5 : 1);
  const monsterExp = (stage) =>
    Math.ceil(3 * Math.pow(1.15, stage - 1)) * (isBossStage(stage) ? 4 : 1);

  const BIOME_LEN = 10;   // 한 지역은 10스테이지
  const biomeOf = (stage) => Math.floor((stage - 1) / BIOME_LEN) % BIOME_COUNT;
  // 6개 지역을 다 돌면 '회차'가 올라간다: 스테이지 61부터는 같은 지역이 색과 이름을 바꿔 다시 나온다 (숲 → 숲 II ...)
  const roundOf = (stage) => Math.floor((stage - 1) / (BIOME_LEN * BIOME_COUNT));
  // 지역 안의 위치(0~9) → 그 지역의 몇 번째 일반 몬스터가 나오는지 (null은 보스 자리).
  // 예전에는 (스테이지-1) % 5로 골라서 5번째 몬스터가 보스 자리와 겹쳐 한 번도 나오지 않았다.
  // 앞쪽에서 1~4번째를 차례로 만나고, 첫 보스 뒤에 새로운 5번째가 등장해 뒷부분에서 힘을 낸다.
  const NORMAL_SLOTS = [0, 1, 2, 3, null, 4, 2, 3, 4, null];

  // 이 스테이지에 나오는 몬스터 { kind(그림 종류), name, boss, biome, pos(지역 안 1~10번째), round(회차) }
  function monsterInfo(stage) {
    const t = MONSTER_TABLE[biomeOf(stage)];
    const idx = (stage - 1) % BIOME_LEN;
    const boss = isBossStage(stage);
    const pick = boss ? t.bosses[(stage / BOSS_EVERY - 1) % t.bosses.length] : t.normals[NORMAL_SLOTS[idx]];
    return { kind: pick[0], name: pick[1], boss, biome: biomeOf(stage), pos: idx + 1, round: roundOf(stage) };
  }

  // 지금 가장 높은 단계의 직업 (없으면 null)
  const deepest = (s) => s.adv4 || s.adv3 || s.adv || s.cls || null;
  // 지금까지 고른 직업 경로 [1차, 2차, ...]
  const classPath = (s) => PATH_FIELDS.map((f) => s[f]).filter(Boolean);
  // 화면에 그릴 고블린 종류 (가장 높은 단계 직업 > 견습)
  const lookId = (s) => deepest(s) || 'novice';
  const classTitle = (s) => { const id = deepest(s); return id ? NODE[id].name : '견습 고블린'; };

  // ---- 전직 ----
  // 지금 할 수 있는 전직 단계: 'base' | 'adv' | 'adv3' | 'adv4' | null
  function promoStage(s) {
    for (let i = 0; i < PATH_FIELDS.length; i++) {
      if (!s[PATH_FIELDS[i]]) return s.level >= PROMO_LEVEL[PROMO_STAGES[i]] ? PROMO_STAGES[i] : null;
    }
    return null;
  }
  // 다음에 할 전직 정보 (화면 표시용): { stage, tier, need 필요 레벨, ready 지금 가능한지, options 고를 수 있는 직업 } / 모두 끝났으면 null
  function nextPromo(s) {
    for (let i = 0; i < PATH_FIELDS.length; i++) {
      if (s[PATH_FIELDS[i]]) continue;
      const stage = PROMO_STAGES[i], need = PROMO_LEVEL[stage];
      return { stage, tier: i + 1, need, ready: s.level >= need, options: i === 0 ? Object.keys(CLASSES) : childrenOf(s[PATH_FIELDS[i - 1]]) };
    }
    return null;
  }
  function promoOptions(s) {
    const st = promoStage(s);
    if (!st) return [];
    if (st === 'base') return Object.keys(CLASSES);
    return childrenOf(s[PATH_FIELDS[PROMO_STAGES.indexOf(st) - 1]]);
  }
  function promote(s, id) {
    if (promoOptions(s).indexOf(id) < 0) return false;
    const oldMax = maxHp(s);
    const i = PROMO_STAGES.indexOf(promoStage(s));
    s[PATH_FIELDS[i]] = id;
    if (i >= 1) { s.mastered[id] = true; dexEntry(s, id).runs += 1; }
    s.hp = Math.min(maxHp(s), s.hp + Math.max(0, maxHp(s) - oldMax));   // 늘어난 체력만큼 회복
    return true;
  }

  // ---- 스킬 ----
  // 지금까지 고른 직업(1~4차)의 스킬들. 전직할수록 하나씩 쌓인다.
  function skillsOf(s) {
    const out = [];
    for (const f of PATH_FIELDS) {
      const id = s[f];
      const sk = id && Sk.makeSkill(id, TIER_OF[id]);
      if (sk) out.push(sk);
    }
    return out;
  }
  // 이 스킬을 지금 써도 되는지: 종류마다 '상황'이 맞을 때만 쓴다 (체력이 충분한데 회복을 쓰지 않고, 보스가 아닌데 보스 사냥을 쓰지 않도록)
  function canCast(s, sk) {
    const hpRatio = s.hp / maxHp(s);
    const monRatio = s.monsterMax > 0 ? s.monsterHp / s.monsterMax : 1;
    switch (sk.kind) {
      case 'heal': return hpRatio < 0.7;
      case 'guard': return hpRatio < 0.85;
      case 'stun': return hpRatio < 0.85 && s.monsterHp > 0;
      case 'barrier': return hpRatio < 0.75 && !s.buffs.barrier;
      case 'lifesteal': return hpRatio < 0.9 && !s.buffs.lifesteal;
      case 'execute': return s.monsterHp > 0 && monRatio < 0.4;
      case 'bossbane': return s.isBoss && s.monsterHp > 0;
      case 'dot': return !s.dot && monRatio > 0.5;
      default: return s.monsterHp > 0;
    }
  }
  // 스킬 하나를 쓴다. 효과를 적용하고 { type: 'skill' } 사건을 남긴다.
  function castSkill(s, sk, ev) {
    let amount = 0;
    const setBuff = (kind, v, t) => { const cur = s.buffs[kind]; s.buffs[kind] = { t: Math.max(t, cur ? cur.t : 0), v: Math.max(v, cur ? cur.v : 0) }; };   // 같은 종류가 겹치면 더 센 위력과 더 긴 시간을 따른다
    switch (sk.kind) {
      case 'strike': case 'execute': case 'bossbane':
        amount = hitDmg(s) * sk.power; dealDamage(s, amount, ev); break;
      case 'multi':
        amount = hitDmg(s) * sk.power * sk.hits; dealDamage(s, amount, ev); break;
      case 'summon':
        amount = totalDps(s) * 0.3 * sk.secs * sk.power; dealDamage(s, amount, ev); break;   // 동료 배율에 좌우되지 않게, 내 초당 피해의 30%를 기준으로 한다
      case 'dot':   // 매초 (내 초당 피해 × 위력). 몬스터가 바뀌면 사라진다.
        s.dot = { t: sk.dur, dps: totalDps(s) * sk.power, variant: sk.variant }; amount = s.dot.dps * sk.dur; break;
      case 'heal': { const before = s.hp; s.hp = Math.min(maxHp(s), s.hp + maxHp(s) * sk.power); amount = s.hp - before; break; }
      case 'barrier': amount = maxHp(s) * sk.power; s.buffs.barrier = { t: sk.dur, v: amount }; break;
      case 'stun': setBuff('stun', 1, sk.power); amount = sk.power; break;
      case 'bounty': amount = Math.ceil(monsterGold(s.stage) * goldMult(s) * sk.power); s.gold += amount; break;
      case 'frenzy': setBuff('haste', sk.power, sk.dur); setBuff('might', sk.power, sk.dur); amount = sk.power; break;
      default: setBuff(sk.kind, sk.power, sk.dur); amount = sk.power;   // haste·might·guard·greed·lifesteal
    }
    ev.push({ type: 'skill', id: sk.id, kind: sk.kind, name: sk.name, variant: sk.variant, amount, hits: sk.hits, power: sk.power, secs: sk.secs });
  }
  // dt초 동안의 쿨타임과 효과 시간을 흘려보내고, 준비된 스킬을 쓴다. 처음 만난 스킬은 조금씩 시간 차를 두고 시작해서 한꺼번에 터지지 않는다.
  function updateSkills(s, dt, ev) {
    for (const k of Object.keys(s.buffs)) { s.buffs[k].t -= dt; if (s.buffs[k].t <= 0) delete s.buffs[k]; }
    const d = s.dot;
    if (d) {   // 지속 피해: 이 몬스터가 죽거나 시간이 다하면 끝난다
      const step = Math.min(dt, d.t);
      d.t -= dt;
      dealDamage(s, d.dps * step, ev);
      if (d.t <= 0 && s.dot === d) s.dot = null;
    }
    const list = skillsOf(s);
    list.forEach((sk, i) => {
      if (s.skillCd[sk.id] === undefined) s.skillCd[sk.id] = sk.cd * 0.15 * (i + 1);
      s.skillCd[sk.id] -= dt;
      if (s.skillCd[sk.id] > 0) return;
      if (!canCast(s, sk)) { s.skillCd[sk.id] = 0; return; }   // 조건이 될 때까지 기다린다
      castSkill(s, sk, ev);
      s.skillCd[sk.id] = sk.cd;
    });
  }

  // ---- 공격 모션 ----
  // 그 직업의 공격 모양 (칼, 표창, 마법구 …). 정해지지 않은 직업은 가장 가까운 윗단계 직업을 따른다.
  function styleOfClass(id) {
    for (let c = id, n = 0; c && n < 6; c = parentOf(c), n++) if (has(Sk.ATTACK_STYLE, c)) return Sk.ATTACK_STYLE[c];
    return 'slash';
  }
  const attackStyle = (s) => styleOfClass(deepest(s) || 'novice');

  // ---- 강화 ----
  function upgradeCost(s, key) {
    const u = UPGRADES[key];
    return Math.ceil(u.base * Math.pow(u.growth, s.upgrades[key]));
  }

  function canBuy(s, key) {
    return s.upgrades[key] < UPGRADES[key].max && s.gold >= upgradeCost(s, key);
  }

  // 최대 want번 살 때 실제로 살 수 있는 횟수와 총 비용 (want에 Infinity를 주면 살 수 있는 만큼 전부)
  function planBuy(s, key, want) {
    const u = UPGRADES[key];
    let lv = s.upgrades[key], gold = s.gold, n = 0, cost = 0;
    while (n < want && lv < u.max) {
      const c = Math.ceil(u.base * Math.pow(u.growth, lv));
      if (c > gold) break;
      gold -= c; cost += c; lv += 1; n += 1;
    }
    return { n, cost };
  }

  // 최대 want번 연속으로 산다. 산 횟수를 돌려준다.
  function buyMany(s, key, want) {
    let n = 0;
    while (n < want && buy(s, key)) n += 1;
    return n;
  }

  function buy(s, key) {
    if (!canBuy(s, key)) return false;
    const before = maxHp(s);
    s.gold -= upgradeCost(s, key);
    s.upgrades[key] += 1;
    if (key === 'armor') s.hp += maxHp(s) - before;   // 갑옷을 사면 늘어난 체력만큼 바로 회복
    return true;
  }

  // ---- 전투 ----
  function spawnMonster(s) {
    s.dot = null;
    s.isBoss = isBossStage(s.stage);
    s.monsterMax = monsterMaxHp(s.stage);
    s.monsterHp = s.monsterMax;
  }

  function gainExp(s, amount, ev) {
    s.exp += amount;
    while (s.exp >= expNeeded(s)) {
      s.exp -= expNeeded(s);
      s.level += 1;
      s.hp += 12;   // 레벨업 시 늘어난 기본 체력만큼 회복
      ev.push({ type: 'levelup', level: s.level });
      const st = promoStage(s);
      if (st && s.level === PROMO_LEVEL[st]) ev.push({ type: 'promoReady', stage: st });
    }
  }

  function onKill(s, ev) {
    const gold = Math.ceil(monsterGold(s.stage) * goldMult(s) * (1 + buffV(s, 'greed')));
    s.gold += gold;
    s.totalKills += 1;
    s.killsInStage += 1;
    for (const f of PATH_FIELDS) if (s[f] && f !== 'cls') dexEntry(s, s[f]).kills += 1;   // 고른 2~4차 직업 모두 기록
    ev.push({ type: 'kill', gold, boss: s.isBoss });
    gainExp(s, Math.ceil(monsterExp(s.stage) * (1 + potionV(s, 'exp'))), ev);   // 지혜의 물약
    if (rnd() < dropChance(s, s.isBoss)) receiveItem(s, rollItem(s, s.stage, s.isBoss), ev);

    if (s.isBoss || s.killsInStage >= KILLS_PER_STAGE) {
      s.stage += 1;
      s.killsInStage = 0;
      if (s.stage > s.runBest) s.runBest = s.stage;
      if (s.stage > s.bestStage) s.bestStage = s.stage;
      for (const f of PATH_FIELDS) if (s[f] && f !== 'cls') { const d = dexEntry(s, s[f]); if (s.stage > d.best) d.best = s.stage; }
      ev.push({ type: 'stage', stage: s.stage });
    }
    spawnMonster(s);
  }

  function dealDamage(s, amount, ev) {
    if (amount <= 0 || s.monsterHp <= 0) return;
    s.dealt += Math.min(amount, s.monsterHp);
    const ls = buffV(s, 'lifesteal');
    if (ls > 0) s.hp = Math.min(maxHp(s), s.hp + Math.min(amount, s.monsterHp) * ls);   // 흡혈 스킬
    s.monsterHp -= amount;
    if (s.monsterHp <= 0) onKill(s, ev);
  }

  // dt초 만큼 전투를 진행하고 발생한 사건 목록을 돌려준다
  function tick(s, dt) {
    const ev = [];
    for (const id of Object.keys(s.potions)) { s.potions[id] -= dt; if (s.potions[id] <= 0) delete s.potions[id]; }   // 물약 시간은 쓰러져 있는 동안에도 흐른다
    if (s.downT > 0) {
      s.downT -= dt;
      if (s.downT <= 0) { s.downT = 0; s.hp = maxHp(s); }
      return ev;
    }

    dealDamage(s, companionDps(s) * dt, ev);

    s.atkT += dt;
    const interval = 1 / attacksPerSec(s);
    while (s.atkT >= interval) {
      s.atkT -= interval;
      s.hits += 1;
      dealDamage(s, hitDmg(s), ev);
    }

    updateSkills(s, dt, ev);

    const max = maxHp(s);
    s.hp = Math.min(max, s.hp + max * 0.02 * statMult(s, 'regen') * dt);   // 초당 최대 체력의 2% 회복
    let dmg = buffV(s, 'stun') > 0 ? 0 : monsterAtk(s.stage) * dt * (1 - buffV(s, 'guard'));   // 기절한 몬스터는 공격하지 못한다
    const barrier = s.buffs.barrier;
    if (barrier && dmg > 0) {   // 방벽이 피해를 먼저 대신 맞는다
      const absorbed = Math.min(barrier.v, dmg);
      barrier.v -= absorbed; dmg -= absorbed;
      if (barrier.v <= 0) delete s.buffs.barrier;
    }
    s.hp -= dmg;

    if (s.hp <= 0) {
      s.hp = 0;
      s.downT = DOWN_TIME;
      s.atkT = 0;
      s.killsInStage = 0;
      const from = s.stage;
      s.stage = Math.max(1, s.stage - 1);   // 쓰러지면 한 스테이지 뒤로
      spawnMonster(s);
      ev.push({ type: 'down', from, to: s.stage });
    }
    if (ev.length > 0) checkAchievements(s, ev);   // 처치·레벨업 같은 사건이 있을 때만 판정 (매 틱마다 하지 않음)
    return ev;
  }

  // 직접 때리기: 공격력의 3배 피해. 쓰러진 상태에서는 못 한다.
  function clickAttack(s) {
    if (s.downT > 0) return { dmg: 0, events: [] };
    const ev = [];
    const dmg = hitDmg(s) * CLICK_MULT * statMult(s, 'click') * (1 + 0.25 * perkLv(s, 'click')) * gearMult(s, 'click');
    dealDamage(s, dmg, ev);
    if (ev.length > 0) checkAchievements(s, ev);
    return { dmg, events: ev };
  }

  // 여러 초를 한 번에 진행 (백그라운드 탭, 오프라인 보상용). 긴 시간은 간격을 넓혀 계산량을 줄인다.
  function simulate(s, seconds) {
    const step = seconds > 30 ? 0.25 : 0.1;
    const ev = [];
    let left = seconds;
    while (left > 1e-9) {
      const dt = Math.min(step, left);
      const e = tick(s, dt);
      for (const x of e) ev.push(x);
      left -= dt;
    }
    return ev;
  }

  // ---- 오프라인 보상 ----
  function applyOffline(s, now) {
    const elapsed = Math.min((now - s.savedAt) / 1000, offlineCap(s));
    if (!(elapsed >= OFFLINE_MIN)) return null;
    const before = { gold: s.gold, kills: s.totalKills, stage: s.stage, level: s.level };
    const ev = simulate(s, elapsed);
    s.dealt = 0;
    const drops = ev.filter((e) => e.type === 'drop');
    return {
      seconds: Math.floor(elapsed),
      gold: Math.floor(s.gold - before.gold),
      kills: s.totalKills - before.kills,
      stageFrom: before.stage,
      stageTo: s.stage,
      levelFrom: before.level,
      levelTo: s.level,
      drops: drops.length,
      dropsSold: drops.filter((e) => e.action === 'sold').length,
      dropBest: drops.reduce((m, e) => Math.max(m, e.item.r), -1),
    };
  }

  // ---- 환생 ----
  const prestigeGain = (s) => (s.runBest >= PRESTIGE_MIN_STAGE ? Math.floor(s.runBest / 5) : 0);
  const canPrestige = (s) => prestigeGain(s) > 0;

  function prestige(s) {
    const gain = prestigeGain(s);
    if (gain <= 0) return 0;
    s.tokens += gain;
    s.prestiges += 1;
    s.gold = 0;
    s.level = 1;
    s.exp = 0;
    s.stage = 1;
    s.killsInStage = 0;
    s.runBest = 1;
    s.upgrades = { weapon: 0, armor: 0, speed: 0, companion: 0, loot: 0 };
    s.upgrades.weapon = s.upgrades.armor = HEADSTART_LV * perkLv(s, 'headstart');   // 빠른 출발
    s.cls = null;   // 직업은 초기화 (도감은 유지)
    s.adv = null;
    s.adv3 = null;
    s.adv4 = null;
    s.skillCd = {};
    s.buffs = {};
    s.dot = null;
    s.downT = 0;
    s.atkT = 0;
    s.hp = maxHp(s);
    spawnMonster(s);
    return gain;
  }

  // ---- 저장 / 불러오기 ----
  function serialize(s, now) {
    s.savedAt = now;
    return JSON.stringify(s);
  }

  const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  // 범위 안으로 보정한다. 저장 데이터가 손상되거나 조작되어도 Infinity/NaN이 생기지 않게 한다.
  const clamp = (x, min, max) => Math.min(max, Math.max(min, x));

  // 저장 문자열을 상태로 복원한다. 깨진 데이터면 null.
  function deserialize(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || typeof o !== 'object') return null;
    const s = createState(num(o.savedAt, 0));
    s.gold = clamp(num(o.gold, 0), 0, 1e60);
    s.level = clamp(Math.floor(num(o.level, 1)), 1, 9999);
    s.exp = clamp(num(o.exp, 0), 0, 1e60);
    s.stage = clamp(Math.floor(num(o.stage, 1)), 1, 999);
    s.killsInStage = clamp(Math.floor(num(o.killsInStage, 0)), 0, KILLS_PER_STAGE);
    s.runBest = clamp(Math.floor(num(o.runBest, s.stage)), s.stage, 999);
    s.bestStage = clamp(Math.floor(num(o.bestStage, s.runBest)), s.runBest, 999);
    s.totalKills = clamp(Math.floor(num(o.totalKills, 0)), 0, 1e15);
    s.tokens = clamp(Math.floor(num(o.tokens, 0)), 0, 99999);
    s.prestiges = clamp(Math.floor(num(o.prestiges, 0)), 0, 99999);
    for (const k of UPGRADE_KEYS) {
      const lv = clamp(Math.floor(num(o.upgrades && o.upgrades[k], 0)), 0, 9999);
      s.upgrades[k] = Math.min(lv, UPGRADES[k].max);
    }
    s.cls = typeof o.cls === 'string' && has(CLASSES, o.cls) ? o.cls : null;
    // 직업 경로: 앞 단계의 자식으로 이어지는 것만 받아들인다
    for (let i = 1; i < PATH_FIELDS.length; i++) {
      const prev = s[PATH_FIELDS[i - 1]], id = o[PATH_FIELDS[i]];
      s[PATH_FIELDS[i]] = prev && typeof id === 'string' && has(CLASS_TABLES[i + 1], id) && CLASS_TABLES[i + 1][id].parent === prev ? id : null;
    }
    for (const k of ADV_IDS) if (o.mastered && o.mastered[k] === true) s.mastered[k] = true;
    for (const f of PATH_FIELDS) if (s[f] && f !== 'cls') s.mastered[s[f]] = true;
    for (const a of ACHIEVEMENTS) if (o.achieved && o.achieved[a.id] === true) s.achieved[a.id] = true;
    for (const k of ADV_IDS) {
      const d = o.dex && o.dex[k];
      if (d && typeof d === 'object') {
        s.dex[k] = { best: clamp(Math.floor(num(d.best, 0)), 0, 999), kills: clamp(Math.floor(num(d.kills, 0)), 0, 1e15), runs: clamp(Math.floor(num(d.runs, 0)), 0, 99999) };
      }
    }
    for (const id of PERK_KEYS) {
      const lv = clamp(Math.floor(num(o.perks && o.perks[id], 0)), 0, PERKS[id].max);
      if (lv > 0) s.perks[id] = lv;
    }
    // 장비: 이름은 저장하지 않고 번호로 다시 만들며, 수치는 그 등급·레벨에서 나올 수 있는 최대치로 제한한다
    const cleanItem = (x) => {
      if (!x || typeof x !== 'object' || !has(GEAR, x.slot) || !has(GEAR[x.slot].kinds, x.kind)) return null;
      const r = Math.floor(num(x.r, -1));
      if (r < 0 || r >= RARITIES.length) return null;
      const ilvl = clamp(Math.floor(num(x.ilvl, 1)), 1, 999);
      return { id: clamp(Math.floor(num(x.id, 0)), 1, 1e12), slot: x.slot, kind: x.kind, r, ilvl,
               val: clamp(num(x.val, 0), 0, maxItemVal(x.slot, x.kind, r, ilvl)), n: clamp(Math.floor(num(x.n, 0)), 0, 99) };
    };
    const seen = {};
    const fresh = (x) => { const it = cleanItem(x); if (!it || seen[it.id]) return null; seen[it.id] = true; return it; };   // 번호가 겹치는 장비는 버린다
    for (const slot of SLOT_KEYS) {
      const it = o.equip && fresh(o.equip[slot]);
      if (it && it.slot === slot) s.equip[slot] = it;
    }
    const bagExtraSaved = Math.min(St.BAG_EXTRA_MAX, Math.floor(clamp(Math.floor(num(o.bagExtra, 0)), 0, St.BAG_EXTRA_MAX) / St.BAG_STEP) * St.BAG_STEP);
    if (Array.isArray(o.bag)) for (const x of o.bag.slice(0, BAG_MAX + bagExtraSaved)) { const it = fresh(x); if (it) s.bag.push(it); }
    let maxId = 0;
    for (const it of [...s.bag, ...SLOT_KEYS.map((k) => s.equip[k]).filter(Boolean)]) maxId = Math.max(maxId, it.id);
    s.itemSeq = Math.max(maxId, clamp(Math.floor(num(o.itemSeq, 0)), 0, 1e12));
    s.autoEquip = o.autoEquip !== false;
    s.autoSell = clamp(Math.floor(num(o.autoSell, 0)), -1, 2);
    // 상점 관련 값: 이상한 값은 범위 안으로 보정하고, 없는 물약·상품은 버린다
    s.crystals = clamp(Math.floor(num(o.crystals, 0)), 0, 1e9);
    for (const p of St.POTIONS) { const t = num(o.potions && o.potions[p.id], 0); if (t > 0) s.potions[p.id] = Math.min(St.POTION_CAP, t); }
    if (typeof o.adClock === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.adClock)) s.adClock = o.adClock;
    const ad = o.adLog;
    if (ad && typeof ad.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ad.day)) s.adLog = { day: ad.day, n: clamp(Math.floor(num(ad.n, 0)), 0, St.AD_DAILY_LIMIT) };
    s.bagExtra = Math.min(St.BAG_EXTRA_MAX, Math.floor(clamp(Math.floor(num(o.bagExtra, 0)), 0, St.BAG_EXTRA_MAX) / St.BAG_STEP) * St.BAG_STEP);
    if (o.bought && o.bought.starter === true) s.bought.starter = true;
    if (Array.isArray(o.orders)) s.orders = o.orders.filter((x) => typeof x === 'string' && /^[\w-]{1,64}$/.test(x)).slice(-50);
    if (tokenBalance(s) < 0) s.perks = {};   // 번 것보다 많이 쓴 저장 데이터는 산 강화를 모두 되돌린다
    s.hp = Math.min(maxHp(s), Math.max(1, num(o.hp, maxHp(s))));
    spawnMonster(s);
    s.monsterHp = Math.min(s.monsterMax, Math.max(1, num(o.monsterHp, s.monsterMax)));
    return s;
  }

  // ---- 표시용 ----
  const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
  function fmt(n) {
    if (!Number.isFinite(n)) return '∞';
    if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : String(Math.floor(n));
    let i = 0;
    let x = n;
    while (x >= 1000 && i < UNITS.length - 1) { x /= 1000; i++; }
    if (x >= 1000) return n.toExponential(2).replace('+', '');
    return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + UNITS[i];
  }

  function fmtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}시간 ${m}분`;
    if (m > 0) return `${m}분`;
    return `${Math.floor(sec)}초`;
  }

  const api = {
    UPGRADES, UPGRADE_KEYS, MILESTONE_EVERY, MILESTONE_MULT, mile, CLASSES, ADVANCED, ADVANCED3, ADVANCED4, PROMO_LEVEL, KILLS_PER_STAGE, DOWN_TIME, PRESTIGE_MIN_STAGE, OFFLINE_CAP,
    createState, tick, simulate, clickAttack, applyOffline,
    upgradeCost, canBuy, buy, planBuy, buyMany,
    prestigeGain, canPrestige, prestige,
    serialize, deserialize,
    TOKEN_BONUS, maxHp, hitDmg, attacksPerSec, companionDps, totalDps, goldMult, expNeeded, tokenMult,
    monsterAtk, monsterGold, monsterInfo, biomeOf, roundOf, BIOME_LEN, NORMAL_SLOTS, isBossStage, lookId, classTitle,
    STORE: St, potionV, dayKey, creditCrystals, buyProduct, adToday, adStatus, claimAd, shopItemLevel,
    SKILL_KINDS: Sk.KINDS, SKILL_NAMES: Sk.SKILLS, describeSkill: Sk.describeSkill, MELEE_STYLES: Sk.MELEE_STYLES, ATTACK_STYLE: Sk.ATTACK_STYLE,
    skillsOf, attackStyle, styleOfClass, buffV, canCast, skillFor: (id) => Sk.makeSkill(id, TIER_OF[id]),
    NODES: NODE, nextPromo, promoStage, promoOptions, promote, statMult, masteryMult,
    ACHIEVEMENTS, ACHIEVE_BONUS, achieveMult, checkAchievements,
    PATH_FIELDS, ADV_IDS, advIdsOfTier, classTier, parentOf, childrenOf, classPath, deepest, DEX_STAGES, DEX_MEDALS, MASTERY_BASE, MEDAL_BONUS, dexStages, masteryOf, dexRecord, dexTier,
    RARITIES, GEAR, SLOT_KEYS, BAG_MAX, bagLimit, DROP_CHANCE, BOSS_DROP_CHANCE, LUCK_PER_LV,
    GEAR_DESIGNS, itemDesign, setRandom, itemName, sellValue, rollItem, dropChance, isUpgrade, receiveItem, equipItem, unequipItem, sellBagItem, sellBagUpTo, sellBagItems, isWeaker, bagWeaker, gearMult,
    PERKS, PERK_KEYS, HEADSTART_LV, perkLv, perkCost, perkSpent, tokenBalance, perkMissing, perkUnlocked, canBuyPerk, buyPerk, respecPerks, offlineCap,
    fmt, fmtTime,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
