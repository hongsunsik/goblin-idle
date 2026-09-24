// 고블린 키우기 - 게임 로직 (DOM과 무관한 순수 함수 모음)
(function (root) {
  const { ADVANCED3, ADVANCED4, ADVANCED5 } = typeof module !== 'undefined' && module.exports ? require('./classes.js') : root.GoblinClasses;
  const Sk = typeof module !== 'undefined' && module.exports ? require('./skills.js') : root.GoblinSkills;
  const Social = typeof module !== 'undefined' && module.exports ? require('./social.js') : root.GoblinSocial;
  const St = typeof module !== 'undefined' && module.exports ? require('./store.js') : root.GoblinStore;
  const Dg = typeof module !== 'undefined' && module.exports ? require('./dungeon.js') : root.GoblinDungeon;
  const SAVE_VERSION = 1;
  const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
  const OFFLINE_CAP = 8 * 3600;   // 오프라인 보상은 최대 8시간까지
  const OFFLINE_MIN = 30;         // 이 시간(초) 이상 자리를 비웠을 때만 오프라인 보상 계산
  const KILLS_PER_STAGE = 5;      // 일반 스테이지는 몬스터 5마리를 잡으면 클리어
  const BOSS_EVERY = 5;           // 5의 배수 스테이지는 보스 1마리
  const DOWN_TIME = 3;            // 쓰러진 뒤 부활까지 걸리는 시간(초)
  // 몇 년 플레이해도 저장 복원에서 잘리지 않게 넉넉히 잡은 상한 (예전 스테이지 999·증표 99,999·골드 1e60은 1~2년이면 닿았다)
  const STAGE_CAP = 99999, LEVEL_CAP = 99999, TOKEN_CAP = 1e12, BIG_CAP = 1e300;
  const PRESTIGE_MIN_STAGE = 10;  // 환생 가능한 최소 스테이지
  const CLICK_MULT = 3;           // 직접 때리기는 한 번에 공격력의 3배

  // 강화 목록. cost(lv) = base * growth^lv (lv는 현재 레벨 = 다음 레벨업 비용)
  // 무기·갑옷·동료·약탈은 10레벨마다 효과가 1.5배가 된다 (마일스톤).
  const MILESTONE_EVERY = 10;
  const MILESTONE_MULT = 1.5;
  const mile = (lv) => Math.pow(MILESTONE_MULT, Math.floor(lv / MILESTONE_EVERY));
  // 재빠른 손: 가격 40 × 1.5^Lv, 레벨마다 초당 공격 +0.1이고 동료 공격도 +4%.
  // 동료가 전체 피해의 80~90%를 차지해서, 내 공격 속도만 올리는 예전 방식은 강화를 다 사도 스테이지가 1도 안 올랐다 (tools/simulate.js로 확인).
  // 동료도 함께 빨라지게 해서 이제 빼면 스테이지가 5 가까이 낮아진다.
  const SPEED_BASE = 40, SPEED_GROWTH = 1.5, SPEED_PER_LV = 0.1, SPEED_PARTY = 0.04;
  const UPGRADES = {
    weapon:    { name: '무기',        icon: 'sword',  base: 10, growth: 1.30, max: Infinity, mile: true,
                 effect: (lv) => `공격력 ×${(( 1 + 0.25 * lv) * mile(lv)).toFixed(2)}` },
    armor:     { name: '갑옷',        icon: 'shield', base: 10, growth: 1.30, max: Infinity, mile: true,
                 effect: (lv) => `최대 체력 ×${((1 + 0.25 * lv) * mile(lv)).toFixed(2)}` },
    speed:     { name: '재빠른 손',   icon: 'boots',  base: SPEED_BASE, growth: SPEED_GROWTH, max: 30, mile: false,
                 effect: (lv) => `초당 공격 ${(1 + lv * SPEED_PER_LV).toFixed(1)}회 · 동료 공격 +${Math.round(lv * SPEED_PARTY * 100)}%` },
    companion: { name: '동료 고블린', icon: 'party',  base: 60, growth: 1.55, max: Infinity, mile: true,
                 effect: (lv) => `동료 ${lv}마리 (공격 ×${mile(lv).toFixed(2)})` },
    loot:      { name: '약탈 솜씨',   icon: 'pouch',  base: 40, growth: 1.45, max: Infinity, mile: true,
                 effect: (lv) => `골드 획득 ×${((1 + 0.15 * lv) * mile(lv)).toFixed(2)}` },
  };
  const UPGRADE_KEYS = Object.keys(UPGRADES);

  // ---- 직업 ----
  // 1차 전직은 Lv.15, 2차 Lv.28, 3차 Lv.45, 4차 Lv.65, 5차 Lv.90부터 가능. 환생하면 직업이 초기화된다.
  // 5차 이후로는 갈래가 더 없고, 5차 직업을 그대로 '초월'만 한다 (TRANSCEND_LEVEL, 갈래 없이 수치만 강해짐).
  // 2차 직업마다 3차 2갈래, 3차마다 4차 2갈래, 4차마다 5차 2갈래 (3·4·5차 데이터는 classes.js)
  // mult 항목: dmg 공격력, hp 최대 체력, aps 공격 속도, gold 골드, comp 동료 공격, regen 체력 회복, click 직접 때리기
  const PROMO_LEVEL = { base: 15, adv: 28, adv3: 45, adv4: 65, adv5: 90 };
  const PATH_FIELDS = ['cls', 'adv', 'adv3', 'adv4', 'adv5'];   // 저장하는 직업 경로: 1차~5차
  const PROMO_STAGES = ['base', 'adv', 'adv3', 'adv4', 'adv5'];  // 위 경로에 대응하는 전직 단계 이름
  // 5차 직업을 얻은 뒤 갈래 없이 랭크만 올리는 '초월'. 각 랭크는 공격력·골드를 곱으로 더 강하게 만든다 (achieveMult와 같은 자리에 곱해짐).
  const TRANSCEND_LEVEL = [115, 140];   // 1랭크·2랭크에 필요한 레벨
  const TRANSCEND_BONUS = 0.35;         // 랭크 하나당 공격력·골드 +35%
  const CLASSES = {
    warrior: { name: '전사',   desc: '튼튼한 체력과 빠른 회복. 오래 버티는 싸움이 특기.',
               mult: { hp: 1.5, regen: 1.3 }, adv: ['knight', 'berserker'] },
    archer:  { name: '궁수',   desc: '빠른 연사로 꾸준히 피해를 준다.',
               mult: { aps: 1.1 }, adv: ['sniper', 'ranger'] },   // 1.3 → 1.1: 공격 속도는 동료 공격까지 끌어올려 궁수 계열만 1.8배 강했다
    mage:    { name: '마법사', desc: '강력한 마법 공격. 대신 체력이 약하다.',
               mult: { dmg: 1.35, hp: 0.85 }, adv: ['pyromancer', 'necromancer'] },
    rogue:   { name: '도적',   desc: '재빠른 손놀림으로 골드를 더 많이 훔친다.',
               mult: { gold: 1.4, dmg: 1.1 }, adv: ['assassin', 'pirate'] },
  };
  const ADVANCED = {
    knight:      { name: '기사',     parent: 'warrior', desc: '철벽 방어. 체력과 회복이 크게 늘고, 단단한 만큼 공격도 오른다.',
                   mult: { hp: 1.5, regen: 1.4, dmg: 1.22 } },
    berserker:   { name: '광전사',   parent: 'warrior', desc: '분노의 일격. 공격력이 크게 오르는 대신 체력이 줄어든다.',
                   mult: { dmg: 1.5, hp: 0.85 } },
    sniper:      { name: '저격수',   parent: 'archer',  desc: '한 방이 강력하다. 연사는 조금 느려진다.',
                   mult: { dmg: 1.8, aps: 0.9 } },
    ranger:      { name: '레인저',   parent: 'archer',  desc: '더 빠른 연사와 강해진 동료 공격.',
                   mult: { aps: 1.3, comp: 1.5 } },
    pyromancer:  { name: '화염술사', parent: 'mage',    desc: '불꽃 마법. 공격력이 오르고 직접 때리기가 두 배로 강해진다.',
                   mult: { dmg: 1.5, click: 2 } },
    necromancer: { name: '사령술사', parent: 'mage',    desc: '언데드를 부린다. 동료의 공격이 2배 이상 강해진다.',
                   mult: { comp: 1.8, dmg: 0.9 } },
    assassin:    { name: '암살자',   parent: 'rogue',   desc: '급소를 노린다. 공격력이 크게 오르고 골드도 조금 더 번다.',
                   mult: { dmg: 1.5, gold: 1.1 } },
    pirate:      { name: '해적',     parent: 'rogue',   desc: '보물 사냥꾼. 골드를 엄청나게 벌고 동료도 조금 강해진다.',
                   mult: { gold: 1.7, comp: 1.2 } },
  };

  // ---- 직업 트리 조회 ----
  const CLASS_TABLES = { 1: CLASSES, 2: ADVANCED, 3: ADVANCED3, 4: ADVANCED4, 5: ADVANCED5 };
  const NODE = {};      // id → 직업 정의
  const TIER_OF = {};   // id → 몇 차 직업인지 (1~5)
  for (const t of [1, 2, 3, 4, 5]) for (const id of Object.keys(CLASS_TABLES[t])) { NODE[id] = CLASS_TABLES[t][id]; TIER_OF[id] = t; }
  const classTier = (id) => TIER_OF[id] || 0;
  const parentOf = (id) => (TIER_OF[id] >= 2 ? NODE[id].parent : null);
  const childrenOf = (id) => {
    const t = TIER_OF[id];
    if (t === 1) return CLASSES[id].adv.slice();
    if (!t || t >= 5) return [];
    return Object.keys(CLASS_TABLES[t + 1]).filter((k) => CLASS_TABLES[t + 1][k].parent === id);
  };
  const ADV_IDS = Object.keys(NODE).filter((id) => TIER_OF[id] >= 2);   // 도감에 기록되는 직업 (2~5차) 전부
  const advIdsOfTier = (t) => Object.keys(CLASS_TABLES[t]);

  // 직업 보너스: 전직을 달성한 직업마다 공격력·골드가 영구히 늘어난다 (환생해도 유지). 차수가 높을수록 하나당 보너스는 작다.
  const MASTERY_BASE = { 2: 0.05, 3: 0.015, 4: 0.005, 5: 0.0015 };
  // 도감 등급(동·은·금): 그 직업으로 도달한 최고 스테이지가 기준을 넘을 때마다 올라가고, 등급 하나당 그 직업 보너스가 기본값의 20%씩 늘어난다.
  const DEX_STAGES = { 2: [20, 35, 50], 3: [30, 45, 60], 4: [40, 55, 70], 5: [55, 70, 85] };
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
  // 4단계: 전직과 이어지는 강화. 직업을 끝까지 키울수록 증표의 가치가 커진다.
  PERKS.awaken = { name: '직업 각성', icon: 'cap', tier: 4, max: 5, base: 4, req: [['kingly', 1]],
                   per: '직업 능력의 장점 효과 +10% 강화', now: (lv) => `직업 능력의 장점 효과 +${lv * 10}% 강화` };
  PERKS.codex = { name: '도감 공명', icon: 'book', tier: 4, max: 5, base: 4, req: [['kingly', 1]],
                  per: '직업 도감 보너스 +20%', now: (lv) => `직업 도감 보너스 +${lv * 20}%` };
  // 5단계: 4단계를 모두 채운 뒤에 열리는 끝없는 강화. 증표를 아무리 벌어도 살 게 없어지지 않도록, 레벨 상한을 훨씬 높게 잡았다.
  PERKS.ascend = { name: '초월자의 힘', icon: 'burst', tier: 5, max: 50, base: 10, req: [['awaken', 5], ['codex', 5]],
                   per: '공격력·골드 +2%', now: (lv) => `공격력·골드 +${lv * 2}%` };
  // 2026-09-24 추가: 공격력·골드 말고도 여러 방향으로 강해지는 강화 (단계별로 끼워 넣는다 — 표시 순서는 단계 순)
  Object.assign(PERKS, {
    scholar:   { name: '배움의 기쁨',   icon: 'book',   tier: 1, max: 10, base: 1, req: [],
                 per: '경험치 +10%', now: (lv) => `경험치 +${lv * 10}%` },
    swift:     { name: '재빠른 손',     icon: 'boots',  tier: 1, max: 10, base: 1, req: [],
                 per: '공격 속도 +3%', now: (lv) => `공격 속도 +${lv * 3}%` },
    hunter:    { name: '보스 사냥꾼',   icon: 'skull',  tier: 2, max: 10, base: 2, req: [['might', 3]],
                 per: '보스에게 주는 피해 +8%', now: (lv) => `보스에게 주는 피해 +${lv * 8}%` },
    bulwark:   { name: '철벽',          icon: 'shield', tier: 2, max: 10, base: 2, req: [['vitality', 3]],
                 per: '받는 피해 -2%', now: (lv) => `받는 피해 -${lv * 2}%` },
    spring:    { name: '생명의 샘',     icon: 'heart',  tier: 2, max: 10, base: 2, req: [['vitality', 2]],
                 per: '체력 회복 +15%', now: (lv) => `체력 회복 +${lv * 15}%` },
    undying:   { name: '불굴',          icon: 'star',   tier: 2, max: 10, base: 2, req: [['vitality', 5]],
                 per: '쓰러졌을 때 부활 시간 -6%', now: (lv) => `부활 시간 -${lv * 6}%` },
    timewarp:  { name: '시간 왜곡',     icon: 'bolt',   tier: 3, max: 10, base: 3, req: [['scholar', 3]],
                 per: '스킬 쿨타임 -3%', now: (lv) => `스킬 쿨타임 -${lv * 3}%` },
    harvest:   { name: '증표 수확',     icon: 'crown',  tier: 3, max: 10, base: 3, req: [['greed', 5]],
                 per: '환생 증표 +4%', now: (lv) => `환생 증표 +${lv * 4}%` },
    alchemy:   { name: '가루 연금술',   icon: 'anvil',  tier: 3, max: 10, base: 3, req: [['luck', 3]],
                 per: '분해 가루 +10%', now: (lv) => `분해 가루 +${lv * 10}%` },
    bigbag:    { name: '큰 가방',       icon: 'pouch',  tier: 3, max: 5,  base: 3, req: [['greed', 3]],
                 per: '가방 +3칸', now: (lv) => `가방 +${lv * 3}칸` },
    starluck:  { name: '행운의 별',     icon: 'medal',  tier: 3, max: 5,  base: 4, req: [['luck', 5]],
                 per: '희귀 이상 장비 확률 +8%', now: (lv) => `희귀 이상 장비 확률 +${lv * 8}%` },
    artisan:   { name: '장인의 손길',   icon: 'anvil',  tier: 4, max: 5,  base: 5, req: [['kingly', 1]],
                 per: '장비 강화 성공 확률 +3%p (100% 미만 단계)', now: (lv) => `장비 강화 성공 확률 +${lv * 3}%p` },
    conquest:  { name: '던전 정복자',   icon: 'gate',   tier: 4, max: 5,  base: 5, req: [['kingly', 1]],
                 per: '던전·탑 크리스탈 +10%', now: (lv) => `던전·탑 크리스탈 +${lv * 10}%` },
    titanbody: { name: '불멸의 육체',   icon: 'heart',  tier: 5, max: 50, base: 10, req: [['awaken', 5], ['codex', 5]],
                 per: '최대 체력 +3%', now: (lv) => `최대 체력 +${lv * 3}%` },
    legion:    { name: '끝없는 군단',   icon: 'party',  tier: 5, max: 50, base: 10, req: [['awaken', 5], ['codex', 5]],
                 per: '동료 공격 +3%', now: (lv) => `동료 공격 +${lv * 3}%` },
  });
  // 유물·특별 옵션과 같은 '특수 효과'로 합쳐지는 강화 (specialV가 더한다 — 상한도 유물과 함께 적용된다)
  const PERK_SPECIAL = { exp: ['scholar', 0.1], boss: ['hunter', 0.08], guard: ['bulwark', 0.02], regen: ['spring', 0.15],
                         revive: ['undying', 0.06], cdr: ['timewarp', 0.03], token: ['harvest', 0.04], rare: ['starluck', 0.08] };
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
  // val(s)이 goal에 닿으면 달성. 달성할 때마다 공격력·골드가 영구히 +0.5%이고 (환생해도 유지), 기록 탭에서 크리스탈 보상을 받을 수 있다.
  // group은 기록 탭에서 묶어 보여 주는 분류, reward는 보상 크리스탈.
  const ACHIEVE_BONUS = 0.005;
  const masteredIn = (s, tier) => Object.keys(s.mastered).filter((id) => TIER_OF[id] === tier).length;
  const maxUpgradeLv = (s) => Math.max(...UPGRADE_KEYS.map((k) => s.upgrades[k]));
  const statOf = (key) => (s) => s.stats[key];
  const equippedAtLeast = (s, r) => SLOT_KEYS.filter((k) => s.equip[k] && s.equip[k].r >= r).length;
  const ACHIEVEMENTS = [
    // 처치
    { id: 'kill100',    group: '처치', icon: 'sword',   name: '사냥꾼',         desc: '몬스터 100마리 처치',        goal: 100,    val: (s) => s.totalKills, reward: 5 },
    { id: 'kill1000',   group: '처치', icon: 'sword',   name: '학살자',         desc: '몬스터 1,000마리 처치',      goal: 1000,   val: (s) => s.totalKills, reward: 10 },
    { id: 'kill10000',  group: '처치', icon: 'skull',   name: '재앙',           desc: '몬스터 10,000마리 처치',     goal: 10000,  val: (s) => s.totalKills, reward: 20 },
    { id: 'kill100000', group: '처치', icon: 'skull',   name: '끝없는 사냥',    desc: '몬스터 100,000마리 처치',    goal: 100000, val: (s) => s.totalKills, reward: 40 },
    { id: 'boss10',     group: '처치', icon: 'skull',   name: '보스 사냥꾼',    desc: '보스 10마리 처치',           goal: 10,     val: statOf('bossKills'), reward: 5 },
    { id: 'boss100',    group: '처치', icon: 'skull',   name: '보스 학살자',    desc: '보스 100마리 처치',          goal: 100,    val: statOf('bossKills'), reward: 15 },
    { id: 'boss1000',   group: '처치', icon: 'crown',   name: '왕의 사냥개',    desc: '보스 1,000마리 처치',        goal: 1000,   val: statOf('bossKills'), reward: 40 },
    // 스테이지
    { id: 'stage10',    group: '스테이지', icon: 'star', name: '숲을 벗어나다', desc: '스테이지 10 도달',           goal: 10,     val: (s) => s.bestStage, reward: 5 },
    { id: 'stage20',    group: '스테이지', icon: 'star', name: '어둠 속으로',   desc: '스테이지 20 도달',           goal: 20,     val: (s) => s.bestStage, reward: 5 },
    { id: 'stage30',    group: '스테이지', icon: 'star', name: '탐험가',        desc: '스테이지 30 도달',           goal: 30,     val: (s) => s.bestStage, reward: 10 },
    { id: 'stage50',    group: '스테이지', icon: 'star', name: '정복자',        desc: '스테이지 50 도달',           goal: 50,     val: (s) => s.bestStage, reward: 20 },
    { id: 'stage70',    group: '스테이지', icon: 'star', name: '전설의 길',     desc: '스테이지 70 도달',           goal: 70,     val: (s) => s.bestStage, reward: 30 },
    { id: 'stage100',   group: '스테이지', icon: 'crown', name: '끝을 향해',    desc: '스테이지 100 도달',          goal: 100,    val: (s) => s.bestStage, reward: 50 },
    { id: 'stage150',   group: '스테이지', icon: 'crown', name: '신화',         desc: '스테이지 150 도달',          goal: 150,    val: (s) => s.bestStage, reward: 80 },
    // 성장·강화
    { id: 'level10',    group: '성장', icon: 'arrowup', name: '첫걸음',         desc: '레벨 10 달성',               goal: 10,     val: (s) => s.level, reward: 5 },
    { id: 'level30',    group: '성장', icon: 'arrowup', name: '베테랑',         desc: '레벨 30 달성',               goal: 30,     val: (s) => s.level, reward: 10 },
    { id: 'level50',    group: '성장', icon: 'arrowup', name: '고수',           desc: '레벨 50 달성',               goal: 50,     val: (s) => s.level, reward: 25 },
    { id: 'level70',    group: '성장', icon: 'arrowup', name: '초월자',         desc: '레벨 70 달성',               goal: 70,     val: (s) => s.level, reward: 50 },
    { id: 'upgrade10',  group: '성장', icon: 'anvil',   name: '대장간 손님',    desc: '강화 하나를 Lv.10까지',      goal: 10,     val: maxUpgradeLv, reward: 5 },
    { id: 'upgrade50',  group: '성장', icon: 'anvil',   name: '강화 장인',      desc: '강화 하나를 Lv.50까지',      goal: 50,     val: maxUpgradeLv, reward: 15 },
    { id: 'upgrade100', group: '성장', icon: 'anvil',   name: '강화의 신',      desc: '강화 하나를 Lv.100까지',     goal: 100,    val: maxUpgradeLv, reward: 30 },
    { id: 'speed30',    group: '성장', icon: 'bolt',    name: '번개 손',        desc: '재빠른 손을 최대(Lv.30)까지', goal: 30,    val: (s) => s.upgrades.speed, reward: 20 },
    { id: 'party30',    group: '성장', icon: 'party',   name: '고블린 대가족',  desc: '동료 고블린 30마리',         goal: 30,     val: (s) => s.upgrades.companion, reward: 10 },
    // 환생
    { id: 'prestige1',  group: '환생', icon: 'crown',   name: '첫 환생',        desc: '환생 1회',                   goal: 1,      val: (s) => s.prestiges, reward: 10 },
    { id: 'prestige5',  group: '환생', icon: 'crown',   name: '윤회하는 왕',    desc: '환생 5회',                   goal: 5,      val: (s) => s.prestiges, reward: 20 },
    { id: 'prestige10', group: '환생', icon: 'crown',   name: '끝나지 않는 왕좌', desc: '환생 10회',                goal: 10,     val: (s) => s.prestiges, reward: 30 },
    { id: 'prestige25', group: '환생', icon: 'crown',   name: '영겁의 왕',      desc: '환생 25회',                  goal: 25,     val: (s) => s.prestiges, reward: 60 },
    { id: 'tokens100',  group: '환생', icon: 'crown',   name: '증표 수집가',    desc: '왕의 증표를 지금까지 100개 모으기', goal: 100, val: (s) => s.tokens, reward: 30 },
    { id: 'tokens300',  group: '환생', icon: 'crown',   name: '증표 부자',      desc: '왕의 증표를 지금까지 300개 모으기', goal: 300, val: (s) => s.tokens, reward: 60 },
    // 직업
    { id: 'codex4',     group: '직업', icon: 'cap',     name: '다재다능',       desc: '2차 직업 4종 달성',          goal: 4,      val: (s) => masteredIn(s, 2), reward: 10 },
    { id: 'codex8',     group: '직업', icon: 'book',    name: '도감 완성',      desc: '2차 직업 8종 모두 달성',     goal: 8,      val: (s) => masteredIn(s, 2), reward: 20 },
    { id: 'tier3',      group: '직업', icon: 'cap',     name: '세 번째 길',     desc: '3차 전직 달성',              goal: 1,      val: (s) => masteredIn(s, 3), reward: 10 },
    { id: 'tier3all',   group: '직업', icon: 'book',    name: '세 갈래의 지도', desc: '3차 직업 16종 모두 달성',    goal: 16,     val: (s) => masteredIn(s, 3), reward: 40 },
    { id: 'tier4',      group: '직업', icon: 'crown',   name: '정점에 서다',    desc: '4차 전직 달성',              goal: 1,      val: (s) => masteredIn(s, 4), reward: 20 },
    { id: 'elite8',     group: '직업', icon: 'book',    name: '전설의 수집가',  desc: '4차 직업 8종 달성',          goal: 8,      val: (s) => masteredIn(s, 4), reward: 30 },
    { id: 'elite32',    group: '직업', icon: 'crown',   name: '모든 왕의 길',   desc: '4차 직업 32종 모두 달성',    goal: 32,     val: (s) => masteredIn(s, 4), reward: 100 },
    // 장비
    { id: 'legend1',    group: '장비', icon: 'gem',     name: '찬란한 첫 장비', desc: '전설 장비 얻기',             goal: 1,      val: statOf('legends'), reward: 20 },
    { id: 'legend10',   group: '장비', icon: 'gem',     name: '전설 수집',      desc: '전설 장비 10개 얻기',        goal: 10,     val: statOf('legends'), reward: 50 },
    { id: 'hero3',      group: '장비', icon: 'shield',  name: '영웅의 차림',    desc: '영웅 등급 이상 장비를 3칸 모두 장착', goal: 3, val: (s) => equippedAtLeast(s, 3), reward: 20 },
    { id: 'sold100',    group: '장비', icon: 'pouch',   name: '장비 장사꾼',    desc: '장비 100개 판매',            goal: 100,    val: statOf('sold'), reward: 10 },
    // 기타
    { id: 'gold1m',     group: '기타', icon: 'coin',    name: '백만장자',       desc: '골드를 지금까지 100만 벌기', goal: 1e6,    val: statOf('gold'), reward: 10 },
    { id: 'gold1b',     group: '기타', icon: 'coin',    name: '억만장자',       desc: '골드를 지금까지 10억 벌기',  goal: 1e9,    val: statOf('gold'), reward: 20 },
    { id: 'gold1t',     group: '기타', icon: 'coin',    name: '조 단위 부자',   desc: '골드를 지금까지 1조 벌기',   goal: 1e12,   val: statOf('gold'), reward: 40 },
    { id: 'cast100',    group: '기타', icon: 'burst',   name: '마법사의 손',    desc: '스킬 100번 사용',            goal: 100,    val: statOf('casts'), reward: 10 },
    { id: 'cast2000',   group: '기타', icon: 'burst',   name: '스킬 달인',      desc: '스킬 2,000번 사용',          goal: 2000,   val: statOf('casts'), reward: 30 },
    { id: 'tap1000',    group: '기타', icon: 'hand',    name: '손맛',           desc: '화면을 1,000번 눌러 공격',   goal: 1000,   val: statOf('taps'), reward: 5 },
    { id: 'tap10000',   group: '기타', icon: 'hand',    name: '불타는 손가락',  desc: '화면을 10,000번 눌러 공격',  goal: 10000,  val: statOf('taps'), reward: 20 },
    { id: 'down10',     group: '기타', icon: 'heart',   name: '칠전팔기',       desc: '쓰러졌다가 10번 일어나기',   goal: 10,     val: statOf('downs'), reward: 5 },
    { id: 'potion1',    group: '기타', icon: 'heart',   name: '첫 물약',        desc: '상점에서 물약 사기',         goal: 1,      val: statOf('potions'), reward: 5 },
    { id: 'ad10',       group: '기타', icon: 'gem',     name: '광고 시청자',    desc: '광고 10번 보기',             goal: 10,     val: statOf('ads'), reward: 10 },
  ];
  // ---- 업적 확장: 같은 종류를 단계별로 늘린 것들 (번호는 종류+목표 수치) ----
  // fam(분류, 아이콘, 값, [[목표, 보상], ...], (목표, 몇 번째) => ({ id, name, desc }))
  const fam = (group, icon, val, tiers, mk) => tiers.map(([goal, reward], i) => Object.assign({ group, icon, val, goal, reward }, mk(goal, i)));
  const upg = (k) => (s) => s.upgrades[k];
  const goldMedals = (s) => Object.keys(s.mastered).filter((id) => dexTier(s, id) >= 3).length;
  const hours = (n) => n * 3600;
  const KO_UNITS = [['자', 1e24], ['해', 1e20], ['경', 1e16], ['조', 1e12], ['억', 1e8], ['만', 1e4]];
  const koNum = (n) => { for (const [u, v] of KO_UNITS) if (n >= v) return `${Math.round((n / v) * 10) / 10}${u}`; return String(n); };   // 1e18 → '100경'
  const NAMES = (arr) => (g, i) => arr[i];
  const NEW_ACHIEVEMENTS = [
    // 강화·성장
    ...fam('성장', 'sword', upg('weapon'), [[25, 12], [75, 32], [150, 160]], (g, i) => ({ id: 'weapon' + g, name: ['새 무기', '명검', '전설의 대장장이'][i], desc: `무기를 Lv.${g}까지` })),
    ...fam('성장', 'shield', upg('armor'), [[25, 12], [75, 32], [150, 160]], (g, i) => ({ id: 'armor' + g, name: ['든든한 갑옷', '철벽', '불괴'][i], desc: `갑옷을 Lv.${g}까지` })),
    ...fam('성장', 'pouch', upg('loot'), [[25, 12], [75, 32], [150, 160]], (g, i) => ({ id: 'loot' + g, name: ['약탈꾼', '도둑 길드', '황금 손'][i], desc: `약탈 솜씨를 Lv.${g}까지` })),
    ...fam('성장', 'party', upg('companion'), [[10, 8], [60, 60], [100, 100]], (g, i) => ({ id: 'party' + g, name: ['동료 몇 마리', '대가족의 우두머리', '고블린 군단'][i], desc: `동료 고블린 ${g}마리` })),
    ...fam('성장', 'boots', upg('speed'), [[10, 8], [20, 15]], (g, i) => ({ id: 'speed' + g, name: ['날쌘 손', '번개보다 빠른 손'][i], desc: `재빠른 손을 Lv.${g}까지` })),
    ...fam('성장', 'arrowup', (s) => s.level, [[20, 24], [90, 240], [100, 320]], (g, i) => ({ id: 'level' + g, name: ['중급자', '한계 돌파', '백 번째 레벨'][i], desc: `레벨 ${g} 달성` })),
    // 스테이지
    ...fam('스테이지', 'star', (s) => s.bestStage, [[40, 48], [60, 100], [80, 140], [110, 220], [130, 260], [170, 400], [200, 600]], (g, i) => ({ id: 'stage' + g, name: ['숲 너머', '벽을 넘어', '심연의 문턱', '끝없는 길', '경계 밖', '신화의 문', '전설의 끝'][i], desc: `스테이지 ${g} 도달` })),
    // 환생
    ...fam('환생', 'crown', (s) => s.prestiges, [[50, 400], [100, 800]], (g, i) => ({ id: 'prestige' + g, name: ['불멸의 왕', '영원의 왕'][i], desc: `환생 ${g}회` })),
    ...fam('환생', 'crown', (s) => s.tokens, [[500, 300], [1000, 500], [3000, 900]], (g, i) => ({ id: 'tokens' + g, name: ['증표의 산', '증표의 바다', '증표의 은하'][i], desc: `왕의 증표를 지금까지 ${g}개 모으기` })),
    // 직업
    { id: 'tier2', group: '직업', icon: 'cap', name: '갈림길', desc: '2차 전직 달성', goal: 1, val: (s) => masteredIn(s, 2), reward: 5 },
    { id: 'elite16', group: '직업', icon: 'book', name: '절반의 정점', desc: '4차 직업 16종 달성', goal: 16, val: (s) => masteredIn(s, 4), reward: 240 },
    ...fam('직업', 'medal', goldMedals, [[1, 15], [8, 50], [24, 120]], (g, i) => ({ id: 'medal' + g, name: ['첫 금메달', '메달 수집가', '금메달 컬렉터'][i], desc: `도감 금메달 ${g}개` })),
    // 장비: 등급별로 얻은 수
    ...fam('장비', 'shield', (s) => s.stats.epics, [[1, 10], [10, 25], [50, 50]], (g, i) => ({ id: 'epic' + g, name: ['보랏빛 첫 장비', '영웅의 수집', '영웅 창고'][i], desc: `영웅 이상 장비 ${g}개 얻기` })),
    ...fam('장비', 'shield', (s) => s.stats.rares, [[10, 5], [100, 15], [1000, 40]], (g, i) => ({ id: 'rare' + g, name: ['파란 장비', '희귀 사냥꾼', '희귀 장비 창고'][i], desc: `희귀 이상 장비 ${g}개 얻기` })),
    ...fam('장비', 'gem', statOf('legends'), [[50, 400], [200, 800]], (g, i) => ({ id: 'legend' + g, name: ['전설의 창고', '전설의 산'][i], desc: `전설 이상 장비 ${g}개 얻기` })),
    ...fam('장비', 'gem', statOf('uniques'), [[1, 40], [5, 80], [20, 150]], (g, i) => ({ id: 'unique' + g, name: ['유일한 존재', '유니크 수집가', '유니크 대부호'][i], desc: `유니크 이상 장비 ${g}개 얻기` })),
    ...fam('장비', 'crown', statOf('myths'), [[1, 100], [3, 250]], (g, i) => ({ id: 'myth' + g, name: ['신화가 되다', '신화의 수집가'][i], desc: `신화 장비 ${g}개 얻기` })),
    ...fam('장비', 'pouch', statOf('drops'), [[100, 5], [1000, 15], [10000, 40], [100000, 100]], (g, i) => ({ id: 'drops' + g, name: ['줍는 재미', '장비 사냥꾼', '드롭의 제왕', '끝없는 전리품'][i], desc: `장비를 ${g.toLocaleString('ko-KR')}개 얻기` })),
    ...fam('장비', 'pouch', statOf('sold'), [[1000, 80], [10000, 240]], (g, i) => ({ id: 'sold' + g, name: ['장비 도매상', '장비 재벌'][i], desc: `장비 ${g.toLocaleString('ko-KR')}개 판매` })),
    { id: 'legendset', group: '장비', icon: 'shield', name: '전설의 차림', desc: '전설 이상 장비를 3칸 모두 장착', goal: 3, val: (s) => equippedAtLeast(s, 4), reward: 40 },
    { id: 'uniqueset', group: '장비', icon: 'shield', name: '유니크 세트', desc: '유니크 이상 장비를 3칸 모두 장착', goal: 3, val: (s) => equippedAtLeast(s, 5), reward: 100 },
    { id: 'mythset', group: '장비', icon: 'crown', name: '신화의 차림', desc: '신화 장비를 3칸 모두 장착', goal: 3, val: (s) => equippedAtLeast(s, 6), reward: 250 },
    ...fam('수집', 'shield', statOf('shopBuys'), [[1, 10], [10, 30], [50, 80]], (g, i) => ({ id: 'shopbuy' + g, name: ['첫 특별 장비', '단골손님', '장비 상점의 VIP'][i], desc: `장비 상점에서 ${g}개 사기` })),
    ...fam('수집', 'gem', statOf('boxes'), [[1, 5], [10, 20], [50, 60]], (g, i) => ({ id: 'box' + g, name: ['첫 상자', '상자 수집가', '상자 중독'][i], desc: `장비 상자 ${g}개 열기` })),
    ...fam('수집', 'star', (s) => Object.keys(s.relics).length, [[1, 15], [5, 40], [9, 100]], (g, i) => ({ id: 'relic' + g, name: ['첫 유물', '유물 수집가', '유물 완성'][i], desc: `유물 ${g}종 보유` })),
    ...fam('수집', 'heart', statOf('potions'), [[10, 5], [50, 20], [200, 60]], (g, i) => ({ id: 'potion' + g, name: ['물약 애호가', '물약 중독', '연금술사'][i], desc: `물약 ${g}개 받기` })),
    // 재화
    ...fam('재화', 'coin', statOf('gold'), [[1e15, 240], [1e18, 320], [1e21, 400], [1e24, 600]], (g, i) => ({ id: 'gold1e' + Math.round(Math.log10(g)), name: ['천조 부자', '백경 부자', '해 단위 부자', '우주 부자'][i], desc: `골드를 지금까지 ${koNum(g)} 벌기` })),
    ...fam('재화', 'gem', statOf('spent'), [[100, 5], [1000, 20], [5000, 60], [20000, 150]], (g, i) => ({ id: 'spent' + g, name: ['첫 지출', '알뜰한 쇼핑', '큰손', '크리스탈 부자'][i], desc: `크리스탈을 ${g.toLocaleString('ko-KR')}개 쓰기` })),
    ...fam('재화', 'gem', statOf('ads'), [[50, 100], [200, 240], [1000, 600]], (g, i) => ({ id: 'ad' + g, name: ['광고 단골', '광고 마니아', '광고 명예의 전당'][i], desc: `광고 ${g}번 보기` })),
    // 활동
    ...fam('활동', 'burst', statOf('casts'), [[10000, 200], [50000, 500]], (g, i) => ({ id: 'cast' + g, name: ['스킬 장인', '스킬의 신'][i], desc: `스킬 ${g.toLocaleString('ko-KR')}번 사용` })),
    { id: 'tap100000', group: '활동', icon: 'hand', name: '손가락의 전설', desc: '화면을 100,000번 눌러 공격', goal: 100000, val: statOf('taps'), reward: 100 },
    ...fam('활동', 'heart', statOf('downs'), [[100, 40], [1000, 160]], (g, i) => ({ id: 'down' + g, name: ['백전백패', '불굴의 고블린'][i], desc: `쓰러졌다가 ${g.toLocaleString('ko-KR')}번 일어나기` })),
    ...fam('활동', 'scroll', (s) => s.stats.time, [[hours(1), 10], [hours(10), 30], [hours(100), 80], [hours(500), 200]], (g, i) => ({ id: 'time' + g / 3600, name: ['모험의 시작', '단골 모험가', '백 시간의 모험', '오백 시간의 전설'][i], desc: `모험을 ${g / 3600}시간 하기 (자리를 비운 시간 포함)` })),
    ...fam('활동', 'scroll', statOf('away'), [[hours(8), 10], [hours(100), 40], [hours(500), 120]], (g, i) => ({ id: 'away' + g / 3600, name: ['푹 쉬고 오세요', '방치의 달인', '방치의 신'][i], desc: `자리를 비운 동안의 보상을 ${g / 3600}시간어치 받기` })),
    ...fam('활동', 'star', statOf('days'), [[3, 5], [7, 15], [30, 50], [100, 120], [365, 300]], (g, i) => ({ id: 'days' + g, name: ['사흘째', '일주일의 모험', '한 달의 모험', '백 일의 모험', '일 년의 모험'][i], desc: `${g}일 접속하기 (하루에 한 번만 셈)` })),
    ...fam('활동', 'check', statOf('questClaims'), [[10, 10], [50, 30], [200, 80], [1000, 200]], (g, i) => ({ id: 'quest' + g, name: ['퀘스트 입문', '퀘스트 단골', '퀘스트 달인', '퀘스트의 신'][i], desc: `일일·주간·월간 퀘스트 보상 ${g}번 받기` })),
    ...fam('활동', 'check', statOf('dailyClears'), [[7, 20], [30, 60], [100, 150]], (g, i) => ({ id: 'dclear' + g, name: ['일주일 개근', '한 달 개근', '백 일 개근'][i], desc: `일일 퀘스트를 모두 끝낸 날 ${g}일` })),
    ...fam('활동', 'check', statOf('weeklyClears'), [[4, 30], [12, 80], [26, 150]], (g, i) => ({ id: 'wclear' + g, name: ['한 달 주간왕', '석 달 주간왕', '반년 주간왕'][i], desc: `주간 퀘스트를 모두 끝낸 주 ${g}번` })),
    ...fam('활동', 'check', statOf('monthlyClears'), [[1, 40], [6, 120], [12, 250]], (g, i) => ({ id: 'mclear' + g, name: ['한 달 완주', '반년 완주', '일 년 완주'][i], desc: `월간 퀘스트를 모두 끝낸 달 ${g}번` })),
  ];
  // 무료로 얻는 크리스탈이 너무 많아지지 않게, 새 업적의 보상은 위에 적은 값의 1/4로 준다 (최소 3개)
  for (const a of NEW_ACHIEVEMENTS) ACHIEVEMENTS.push(Object.assign(a, { reward: Math.max(3, Math.round(a.reward / 4)) }));
  const achieveMult = (s) => 1 + ACHIEVE_BONUS * Object.keys(s.achieved).length;
  // 받을 수 있는 업적 보상(달성했지만 아직 받지 않은 것)과, 받는 함수
  const unclaimedAchievements = (s) => ACHIEVEMENTS.filter((a) => s.achieved[a.id] && !s.achClaimed[a.id]);
  function claimAchievement(s, id) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a || !s.achieved[id] || s.achClaimed[id]) return 0;
    s.achClaimed[id] = true;
    s.crystals = Math.min(1e9, s.crystals + a.reward);
    return a.reward;
  }
  function claimAllAchievements(s) {
    let sum = 0;
    for (const a of unclaimedAchievements(s)) sum += claimAchievement(s, a.id);
    return sum;
  }

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


  // ---- 서버 출석 보상 ----
  // rec = 서버에 기록된 출석 { day(날짜 번호), streak(연속 일수) }. 그 기록이 오늘(today = 날짜 번호)의 것이고 아직 이 날짜의 보상을 안 받았으면 크리스탈을 준다.
  function claimAttend(s, rec, today) {
    if (!rec || rec.day !== today || s.attend.claimed >= rec.day) return 0;
    const reward = Social.attendReward(rec.streak, St.ATTEND_REWARDS);
    s.attend.claimed = rec.day;
    s.crystals = Math.min(1e9, s.crystals + reward);
    return reward;
  }

  // ---- 일일·주간·월간 퀘스트 ----
  // 기간이 시작될 때 목표 몇 개를 뽑고, 그 순간의 누적 기록을 기준점(base)으로 적어 둔다. 진행도 = 지금 기록 - 기준점이라서 이벤트마다 따로 셀 필요가 없다.
  // 기간은 한국 시간 기준: 일일은 자정, 주간은 월요일 0시, 월간은 1일 0시에 바뀐다. 날짜는 광고 횟수와 같은 '게임의 오늘'(서버 시각 기준, 시계를 돌려도 뒤로 가지 않음)을 쓴다.
  // 목표 크기는 지금까지 도달한 최고 스테이지에 따라 3단계 중 하나다 (초반에는 쉽게, 후반에는 크게).
  const QUEST_PERIODS = ['daily', 'weekly', 'monthly'];
  const QUEST_CFG = {
    daily:   { name: '일일', count: 5, reward: 5,  bonus: 10 },    // 하루에 5개(첫째는 '접속하기'), 하나당 5개, 모두 끝내면 보너스 10개와 물약
    weekly:  { name: '주간', count: 5, reward: 20, bonus: 40 },
    monthly: { name: '월간', count: 4, reward: 60, bonus: 120 },
  };
  const QUEST_DEFS = [
    { id: 'attend',   daily: [1, 1, 1], reward: { daily: 2 }, label: () => '오늘 접속하기', val: () => 1 },   // 접속만 해도 끝난다 (항상 첫째)
    { id: 'kills',    label: (g) => `몬스터 ${koNum(g)}마리 처치`,        val: (s) => s.totalKills,       daily: [300, 1500, 6000],  weekly: [3000, 15000, 60000],  monthly: [20000, 100000, 400000] },
    { id: 'boss',     label: (g) => `보스 ${koNum(g)}마리 처치`,          val: (s) => s.stats.bossKills,  daily: [10, 40, 150],      weekly: [60, 250, 900],        monthly: [300, 1200, 4000] },
    { id: 'stage',    label: (g) => `스테이지 ${koNum(g)}번 클리어`,      val: (s) => s.stats.stageUps,   daily: [30, 100, 400],     weekly: [300, 1000, 4000],     monthly: [1500, 5000, 20000] },
    { id: 'skill',    label: (g) => `스킬 ${koNum(g)}번 사용`,            val: (s) => s.stats.casts,      daily: [20, 60, 200],      weekly: [150, 500, 1500],      monthly: [700, 2500, 8000] },
    { id: 'tap',      label: (g) => `화면을 ${koNum(g)}번 눌러 공격`,     val: (s) => s.stats.taps,       daily: [50, 200, 600],     weekly: [400, 1500, 4500],     monthly: [2000, 7000, 20000] },
    { id: 'drop',     label: (g) => `장비 ${koNum(g)}개 얻기`,            val: (s) => s.stats.drops,      daily: [10, 40, 150],      weekly: [80, 300, 1000],       monthly: [400, 1500, 5000] },
    { id: 'epic',     label: (g) => `영웅 이상 장비 ${koNum(g)}개 얻기`,  val: (s) => s.stats.epics,      daily: [1, 2, 3],          weekly: [3, 8, 15],            monthly: [10, 25, 50] },
    { id: 'sell',     label: (g) => `장비 ${koNum(g)}개 팔기`,            val: (s) => s.stats.sold,       daily: [5, 20, 80],        weekly: [40, 150, 500],        monthly: [200, 700, 2500] },
    { id: 'level',    label: (g) => `레벨업 ${koNum(g)}번`,               val: (s) => s.stats.levelUps,   daily: [3, 8, 20],         weekly: [15, 40, 100],         monthly: [60, 150, 400] },
    { id: 'ad',       label: (g) => `광고 ${g}번 보기`,                   val: (s) => s.stats.ads,        daily: [1, 2, 3],          weekly: [5, 10, 15],           monthly: [20, 40, 60] },
    { id: 'prestige', label: (g) => `환생 ${g}번`,                        val: (s) => s.prestiges,        weekly: [1, 3, 6],          monthly: [5, 12, 25] },
    { id: 'shop',     label: (g) => `장비 상점에서 ${g}개 사기`,          val: (s) => s.stats.shopBuys,   weekly: [1, 2, 3],          monthly: [3, 6, 12] },
  ];
  const questDef = (id) => QUEST_DEFS.find((d) => d.id === id) || null;
  const questTier = (s) => (s.bestStage < 30 ? 0 : s.bestStage < 80 ? 1 : 2);
  const questReward = (period, def) => (def.reward && def.reward[period]) || QUEST_CFG[period].reward;

  // 게임의 '오늘'(YYYY-MM-DD)에서 각 기간의 이름표를 만든다: 일일 = 그 날, 주간 = 그 주 월요일 날짜, 월간 = 그 달
  function periodKeys(day) {
    const [y, m, d] = day.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();   // 0 일 ~ 6 토
    const mon = new Date(Date.UTC(y, m - 1, d - ((wd + 6) % 7)));
    return { daily: day, weekly: `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, '0')}-${String(mon.getUTCDate()).padStart(2, '0')}`, monthly: day.slice(0, 7) };
  }
  // 각 기간이 끝나기까지 남은 초 (지금의 서버 시각 ms 기준, 모르면 null)
  function periodSecsLeft(nowSrv) {
    if (!Number.isFinite(nowSrv)) return { daily: null, weekly: null, monthly: null };
    const k = new Date(nowSrv + 9 * 3600e3), dayMs = 86400e3;
    const start = Math.floor(k.getTime() / dayMs) * dayMs;
    const wd = new Date(start).getUTCDay();
    const nextWeek = start + (8 - (wd === 0 ? 7 : wd)) * dayMs;
    const nextMonth = Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + 1, 1);
    const left = (t) => Math.max(0, Math.ceil((t - k.getTime()) / 1000));
    return { daily: left(start + dayMs), weekly: left(nextWeek), monthly: left(nextMonth) };
  }
  // 그 기간의 목표를 뽑는다 (기간 이름표로 정해지는 계산: 같은 기간에는 항상 같은 목표 종류)
  function makeQuests(s, period, key) {
    const cfg = QUEST_CFG[period], tier = questTier(s);
    const pool = QUEST_DEFS.filter((d) => d[period] && d.id !== 'attend');
    const rng = seededRng([...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) + period.length * 1009);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const picked = (period === 'daily' ? [questDef('attend')] : []).concat(pool).slice(0, cfg.count);
    return { key, list: picked.map((d) => ({ id: d.id, goal: d[period][tier], base: d.id === 'attend' ? 0 : d.val(s) })), claimed: {}, bonus: false };
  }
  // 게임의 오늘(day)에 맞춰 세 기간의 목표를 새로 뽑을지 확인한다. 기간이 바뀌었으면 받지 않은 보상은 사라진다.
  function questSync(s, day) {
    const keys = periodKeys(day);
    let changed = false;
    for (const p of QUEST_PERIODS) {
      if (!s.quests[p] || s.quests[p].key !== keys[p]) {
        s.quests[p] = makeQuests(s, p, keys[p]);
        if (p === 'daily') s.stats.days += 1;   // 접속한 날 수
        changed = true;
      }
    }
    return changed;
  }
  // 한 기간의 현황 { key, items: [{ id, label, goal, cur, done, claimed, reward }], allClaimed, bonus: { reward, ready, claimed }, claimable }
  function questBoard(s, period) {
    const q = s.quests[period];
    if (!q) return null;
    const items = q.list.map((it) => {
      const def = questDef(it.id);
      const cur = def ? Math.min(it.goal, Math.max(0, def.val(s) - it.base)) : 0;
      return { id: it.id, label: def ? def.label(it.goal) : it.id, goal: it.goal, cur: it.id === 'attend' ? 1 : cur, done: it.id === 'attend' || cur >= it.goal, claimed: !!q.claimed[it.id], reward: def ? questReward(period, def) : 0 };
    });
    const allClaimed = items.length > 0 && items.every((x) => x.claimed);
    return { key: q.key, items, allClaimed, bonus: { reward: QUEST_CFG[period].bonus, ready: allClaimed && !q.bonus, claimed: q.bonus },
             claimable: items.filter((x) => x.done && !x.claimed).length + (allClaimed && !q.bonus ? 1 : 0) };
  }
  const questClaimable = (s) => QUEST_PERIODS.reduce((n, p) => n + (s.quests[p] ? questBoard(s, p).claimable : 0), 0);
  // 끝낸 목표 하나의 보상을 받는다. 받은 크리스탈 수(못 받으면 0)
  function claimQuest(s, period, id) {
    const b = QUEST_PERIODS.includes(period) ? questBoard(s, period) : null;
    const it = b && b.items.find((x) => x.id === id);
    if (!it || !it.done || it.claimed) return 0;
    s.quests[period].claimed[id] = true;
    s.crystals = Math.min(1e9, s.crystals + it.reward);
    s.stats.questClaims += 1;
    return it.reward;
  }
  // 그 기간의 목표를 모두 받았을 때 주는 보너스. 일일은 물약도 하나 준다. 결과: { crystals, potion } (못 받으면 null)
  function claimQuestBonus(s, period) {
    const b = QUEST_PERIODS.includes(period) ? questBoard(s, period) : null;
    if (!b || !b.bonus.ready) return null;
    s.quests[period].bonus = true;
    s.crystals = Math.min(1e9, s.crystals + b.bonus.reward);
    s.stats.questClaims += 1;
    s.stats[period === 'daily' ? 'dailyClears' : period === 'weekly' ? 'weeklyClears' : 'monthlyClears'] += 1;
    let potion = null;
    if (period === 'daily') { potion = rollPotion(); s.potions[potion.id] = Math.min(St.POTION_CAP, (s.potions[potion.id] || 0) + potion.dur); s.stats.potions += 1; }
    return { crystals: b.bonus.reward, potion };
  }

  // ---- 던전 (일일·주간·월간) ----
  // 기간마다 정해진 횟수만큼 도전한다. 도전 한 번 = 그 순간의 총 초당 피해 × budgetSec을 '피해 예산'으로,
  // 파동(보스) 순서대로 물리친다 (예산이 남으면 다음 파동까지, 모자라면 그 자리에서 멈춘다). 자세한 수치는 dungeon.js.
  function dungeonSync(s, day) {
    const keys = periodKeys(day);
    let changed = false;
    for (const p of Dg.DUNGEON_PERIODS) {
      if (!s.dungeons[p] || s.dungeons[p].key !== keys[p]) {
        const cfg = Dg.DUNGEONS[p];
        const rng = seededRng([...keys[p]].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11) + p.length * 733);
        s.dungeons[p] = { key: keys[p], used: 0, cleared: false, bonusClaimed: false, bestWaves: 0, bestBonus: 0, boss: cfg.boss[Math.floor(rng() * cfg.boss.length)] };
        changed = true;
      }
    }
    return changed;
  }
  const conquestMult = (s) => 1 + 0.1 * perkLv(s, 'conquest');   // 증표 상점 '던전 정복자'
  // 파동별 보스: 마지막 파동이 그 기간의 대표 보스이고, 앞 파동들은 같은 던전의 다른 보스들이 차례로 나온다.
  function dungeonWaveBosses(period, boss) {
    const cfg = Dg.DUNGEONS[period];
    const others = cfg.boss.filter((b) => b !== boss);
    return Array.from({ length: cfg.waves }, (_, w) => (w === cfg.waves - 1 ? boss : others[w % others.length]));
  }
  const dungeonBudget = (s, period, mgBonus = 0) => totalDps(s) * Dg.DUNGEONS[period].budgetSec * (1 + Math.max(0, Math.min(0.5, mgBonus)));
  // 미리 보기: 이 미니게임 보너스로 도전하면 파동 몇 개까지 물리치나 (실제 도전과 같은 계산)
  function dungeonForecast(s, period, mgBonus = 0) {
    let budget = dungeonBudget(s, period, mgBonus), waves = 0;
    for (let w = 0; w < Dg.DUNGEONS[period].waves; w++) {
      const need = dungeonBossHp(s, period, w);
      if (budget < need) break;
      budget -= need; waves += 1;
    }
    return waves;
  }
  // 던전은 '최고 스테이지의 일반 몬스터' 기준이다. 보스 스테이지(10의 배수) 배율까지 따라가면
  // 최고 기록이 110·120처럼 딱 보스 스테이지일 때만 던전이 체력 6배·골드 5배로 튀었다.
  const dgBaseHp = (s) => monsterMaxHp(s.bestStage) / (isBossStage(s.bestStage) ? BOSS_HP : 1);
  const dgBaseGold = (s) => monsterGold(s.bestStage) / (isBossStage(s.bestStage) ? BOSS_GOLD : 1);
  const dungeonBossHp = (s, period, wave) => Math.round(dgBaseHp(s) * Dg.DUNGEONS[period].hpMult * Math.pow(Dg.DUNGEONS[period].hpStep, wave));
  // 화면 표시용 현황
  function dungeonInfo(s, period) {
    const d = s.dungeons[period], cfg = Dg.DUNGEONS[period];
    if (!d || !cfg) return null;
    const cap = MG_BONUS_CAP[period] || 0;
    return { period, name: cfg.name, boss: d.boss, waves: cfg.waves, bestWaves: d.bestWaves, used: d.used, attempts: cfg.attempts,
             left: Math.max(0, cfg.attempts - d.used), cleared: d.cleared, bonusClaimed: d.bonusClaimed, bestBonus: d.bestBonus || 0,
             waveBosses: dungeonWaveBosses(period, d.boss),
             bossHp: Array.from({ length: cfg.waves }, (_, w) => dungeonBossHp(s, period, w)),
             budget: dungeonBudget(s, period, 0), budgetMax: dungeonBudget(s, period, cap), mgCap: cap,
             forecast: dungeonForecast(s, period, 0), forecastMax: dungeonForecast(s, period, cap),
             canSweep: d.cleared && cfg.attempts - d.used > 0 };
  }
  // 도전 한 번에 필요한 가방 자리: 파동마다 1개 + 아직 안 받은 완주 보상 1개 (자동 장착으로 밀려난 장비도 가방에 들어가므로 넉넉히 센다)
  const dungeonBagNeed = (s, period) => Dg.DUNGEONS[period].waves + (s.dungeons[period] && s.dungeons[period].bonusClaimed ? 0 : 1);
  const dungeonClaimable = (s) => Dg.DUNGEON_PERIODS.filter((p) => s.dungeons[p] && s.dungeons[p].used < Dg.DUNGEONS[p].attempts).length;
  // 도전 전 미니게임 결과 → 피해 예산 보너스 (0~상한). 미니게임은 minigame.js가 화면에서 진행하고, 결과 수치만 여기서 점수로 바꾼다.
  const MOLE_BONUS_CAP = 0.35, MOLE_BONUS_PER_HIT = 0.035;
  const moleBonus = (hits) => Math.min(MOLE_BONUS_CAP, Math.max(0, hits) * MOLE_BONUS_PER_HIT);
  const GAUGE_BONUS_CAP = 0.4, GAUGE_HIT_V = { crit: 0.09, hit: 0.045, miss: 0 };
  const gaugeBonus = (results) => Math.min(GAUGE_BONUS_CAP, results.reduce((a, r) => a + (GAUGE_HIT_V[r] || 0), 0));
  const PARRY_BONUS_CAP = 0.5;
  const parryBonus = (results) => {
    let combo = 0, total = 0;
    for (const ok of results) {
      if (ok) { combo += 1; total += 0.05 + Math.min(0.03, combo * 0.006); }
      else combo = 0;
    }
    return Math.min(PARRY_BONUS_CAP, total);
  };
  const MG_BONUS_CAP = { daily: MOLE_BONUS_CAP, weekly: GAUGE_BONUS_CAP, monthly: PARRY_BONUS_CAP };   // 던전별 미니게임 보너스 상한
  const PARTIAL_GOLD = 0.5;   // 못 물리친 파동: 깎은 체력 비율 × 파동 골드 보상 × 이 값만큼 위로 골드
  // 도전 한 번. bonus(0~0.5)는 미니게임 성과로 늘어난 피해 예산 배율.
  // 결과: { ok, reason? | wavesCleared, waves, fullClear, drops[], bonus?, left, budget, fights[{boss,hp,dealt,killed}], partialGold }
  // fights는 화면의 전투 연출용 기록이다 (보상은 이미 여기서 다 준다).
  // sweep=true: 소탕. 이번 기간에 완주한 적이 있어야 하고, 미니게임 대신 이번 기간 최고 미니게임 보너스를 쓴다.
  function challengeDungeon(s, period, mgBonus = 0, sweep = false) {
    const cfg = Dg.DUNGEONS[period];
    const d = s.dungeons[period];
    if (!cfg || !d) return { ok: false, reason: 'unknown' };
    if (d.used >= cfg.attempts) return { ok: false, reason: 'limit' };
    if (s.bestStage < cfg.minStage) return { ok: false, reason: 'locked', minStage: cfg.minStage };
    if (sweep && !d.cleared) return { ok: false, reason: 'nosweep' };
    // 상점과 같이 보상 장비가 들어갈 자리를 먼저 확인한다. 예전엔 한도를 넘겨 넣었는데, 복원할 때 한도에서 잘려서 장비가 사라졌다.
    const need = dungeonBagNeed(s, period);
    if (s.bag.length + need > bagLimit(s)) return { ok: false, reason: 'bag', need };
    const cap = MG_BONUS_CAP[period] || 0;
    const b = sweep ? (d.bestBonus || 0) : Math.max(0, Math.min(cap, num(mgBonus, 0)));
    if (!sweep && b > (d.bestBonus || 0)) d.bestBonus = b;
    d.used += 1;
    s.stats.dungeonRuns += 1;
    const startBudget = dungeonBudget(s, period, b);
    let budget = startBudget;
    let wavesCleared = 0, partialGold = 0;
    const drops = [], fights = [], bosses = dungeonWaveBosses(period, d.boss);
    for (let w = 0; w < cfg.waves; w++) {
      const need = dungeonBossHp(s, period, w);
      if (budget < need) {
        const frac = budget / need;
        partialGold = Math.floor(dgBaseGold(s) * cfg.reward.gold * goldMult(s) * frac * PARTIAL_GOLD);
        s.gold += partialGold;
        fights.push({ boss: bosses[w], hp: need, dealt: budget, killed: false });
        break;
      }
      budget -= need;
      wavesCleared += 1;
      fights.push({ boss: bosses[w], hp: need, dealt: need, killed: true });
      const it = rollItem(s, s.bestStage, true, rollFromOdds(cfg.odds));
      giveItem(s, it);   // 등급 기록(tallyRarity)은 giveItem 안에서 한다 — 예전엔 여기서 한 번 더 세서 업적이 두 배로 올랐다
      drops.push(it);
      s.gold += Math.ceil(dgBaseGold(s) * cfg.reward.gold * goldMult(s));
      s.crystals = Math.min(1e9, s.crystals + Math.round(cfg.reward.crystals * conquestMult(s)));
    }
    if (wavesCleared > d.bestWaves) d.bestWaves = wavesCleared;
    const fullClear = wavesCleared >= cfg.waves;
    if (fullClear) d.cleared = true;
    let bonus = null;
    if (fullClear && !d.bonusClaimed) {
      d.bonusClaimed = true;
      s.crystals = Math.min(1e9, s.crystals + Math.round(cfg.clear.crystals * conquestMult(s)));
      s.gold += Math.ceil(dgBaseGold(s) * cfg.clear.gold * goldMult(s));
      if (cfg.clear.tokens) s.tokens += cfg.clear.tokens;
      const it = rollItem(s, s.bestStage, true, rollFromOdds(cfg.clear.boxOdds));
      giveItem(s, it);
      bonus = { crystals: Math.round(cfg.clear.crystals * conquestMult(s)), gold: cfg.clear.gold, tokens: cfg.clear.tokens || 0, item: it };
    }
    s.stats.drops += drops.length;
    return { ok: true, wavesCleared, waves: cfg.waves, fullClear, drops, bonus, left: Math.max(0, cfg.attempts - d.used),
             budget: startBudget, mgBonus: b, fights, partialGold, sweep };
  }

  // ---- 무한의 탑 ---- (수치는 dungeon.js의 TOWER)
  const Tw = Dg.TOWER;
  const TOWER_BOSSES = Object.keys(Dg.BOSS_ART);   // 12종이 층마다 돌아가며 나온다
  const towerStage = (f) => Tw.stageBase + Tw.stagePerFloor * f;
  const towerHp = (f) => { const st = towerStage(f); return Math.round((monsterMaxHp(st) / (isBossStage(st) ? BOSS_HP : 1)) * Tw.hpMult); };
  const towerBoss = (f) => TOWER_BOSSES[(f - 1) % TOWER_BOSSES.length];
  const towerBudget = (s) => totalDps(s) * Tw.budgetSec;
  // 지금 한 번 오르면 몇 층을 넘나 (최대 maxClimb층, 맨 위 층까지)
  function towerForecast(s) {
    const b = towerBudget(s);
    let n = 0;
    while (n < Tw.maxClimb && s.tower.best + n < Tw.maxFloor && towerHp(s.tower.best + n + 1) <= b) n += 1;
    return n;
  }
  const towerBagNeed = (s, n) => { let k = 0; for (let f = s.tower.best + 1; f <= s.tower.best + n; f++) if (f % Tw.itemEvery === 0) k += 1; return k; };
  function towerInfo(s, day) {
    const next = Math.min(Tw.maxFloor, s.tower.best + 1);
    return { best: s.tower.best, next, nextBoss: towerBoss(next), nextHp: towerHp(next), budget: towerBudget(s), forecast: towerForecast(s),
             top: s.tower.best >= Tw.maxFloor, dailyReady: s.tower.best > 0 && s.tower.day !== day, daily: Math.round(Tw.daily(s.tower.best) * conquestMult(s)) };
  }
  // 오르기 한 번: 넘을 수 있는 층까지 오르고, 막히는 층에서 멈춘다 (져도 잃는 건 없다).
  // 결과: { ok, reason? | from, to, climbed, fights[{boss,hp,dealt,killed,floor,drop}], drops[], crystals, tokens, budget, more }
  function climbTower(s) {
    if (s.tower.best >= Tw.maxFloor) return { ok: false, reason: 'top' };
    if (s.bestStage < Tw.minStage) return { ok: false, reason: 'locked', minStage: Tw.minStage };
    const n = towerForecast(s), need = towerBagNeed(s, n);
    if (s.bag.length + need > bagLimit(s)) return { ok: false, reason: 'bag', need };
    const budget = towerBudget(s), from = s.tower.best, fights = [], drops = [];
    let crystals = 0, tokens = 0;
    for (let f = from + 1; f <= from + n; f++) {
      const hp = towerHp(f);
      let it = null;
      if (f % Tw.itemEvery === 0) {
        it = rollItem(s, towerStage(f), true, rollFromOdds(f % Tw.tokenEvery === 0 ? Tw.bigOdds : Tw.itemOdds));
        giveItem(s, it);
        drops.push(it);
      }
      if (f % Tw.tokenEvery === 0) tokens += Tw.tokens;
      crystals += Math.round(Tw.crystals(f) * conquestMult(s));
      fights.push({ boss: towerBoss(f), hp, dealt: hp, killed: true, floor: f, drop: it });
    }
    s.tower.best = from + n;
    const stop = s.tower.best + 1;
    if (n < Tw.maxClimb && stop <= Tw.maxFloor) {   // 막힌 층도 연출용으로 남긴다
      const hp = towerHp(stop);
      fights.push({ boss: towerBoss(stop), hp, dealt: Math.min(hp, budget), killed: false, floor: stop, drop: null });
    }
    s.crystals = Math.min(1e9, s.crystals + crystals);
    s.tokens += tokens;
    s.stats.drops += drops.length;
    return { ok: true, from, to: s.tower.best, climbed: n, fights, drops, crystals, tokens, budget, more: n === Tw.maxClimb && towerForecast(s) > 0 };
  }
  // 하루 한 번: 최고 층에 비례한 크리스탈
  function claimTowerDaily(s, day) {
    if (s.tower.best <= 0) return { ok: false, reason: 'none' };
    if (s.tower.day === day) return { ok: false, reason: 'claimed' };
    s.tower.day = day;
    const c = Math.round(Tw.daily(s.tower.best) * conquestMult(s));
    s.crystals = Math.min(1e9, s.crystals + c);
    return { ok: true, crystals: c };
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
    { name: '유니크', color: '#ff5d9a', w: 0.07, bossW: 0.8, gold: 1000 },   // 전설보다 위: 수치가 전설의 약 1.5배
    { name: '신화', color: '#39f0ff', w: 0.008, bossW: 0.1, gold: 3500 },    // 가장 위: 수치가 유니크의 약 1.5배
  ];
  const RARITY_PREFIX = ['낡은', '튼튼한', '빛나는', '고귀한', '찬란한', '유일한', '신화의'];
  const AUTO_SELL_MAX = 4;         // 자동 판매는 전설까지만 고를 수 있다 (유니크·신화는 어떤 경우에도 자동으로 팔리지 않는다)
  const DROP_CHANCE = 0.08;        // 일반 몬스터가 장비를 떨어뜨릴 확률
  const BOSS_DROP_CHANCE = 0.5;    // 보스
  const LUCK_PER_LV = 0.015;       // 증표 상점 '수집가' 레벨당 드롭 확률 추가(+1.5%p)
  const BAG_MAX = 24;              // 기본 가방 칸 수 (가방 확장으로 늘어난다). 가득 차면 새로 얻은 장비는 자동으로 팔린다
  const bagLimit = (s) => BAG_MAX + s.bagExtra + 3 * perkLv(s, 'bigbag');   // 증표 상점 '큰 가방'
  const GEAR_SCALE_STAGE = 40;     // 아이템 레벨이 이만큼 오를 때마다 수치가 기본값만큼 더 붙는다 (스테이지 40 = 2배)
  // 종류마다 올려 주는 능력(kind)과 등급별 기본 수치(%: 노말·고급·희귀·영웅·전설), 이름에 쓰는 명사
  const GEAR = {
    weapon:    { name: '무기',     icon: 'sword',  kinds: {
      dmg:   { label: '공격력',    base: [4, 7, 11, 17, 26, 40, 62],   nouns: [['club', '몽둥이'], ['dagger', '단검'], ['hatchet', '손도끼'], ['sword', '장검'], ['staff', '지팡이'],
                                                                         ['dragonblade', '용아검', 4], ['stormspear', '폭풍의 창', 4], ['soulscythe', '영혼의 낫', 4]] } } },
    armor:     { name: '방어구',   icon: 'shield', kinds: {
      hp:    { label: '최대 체력', base: [6, 10, 16, 24, 36, 55, 85],  nouns: [['leather', '가죽 갑옷'], ['chainmail', '쇠사슬 갑옷'], ['plate', '판금 갑옷'], ['robe', '로브'],
                                                                         ['dragonplate', '용린 갑옷', 4], ['celestialrobe', '천상의 로브', 4]] } } },
    accessory: { name: '액세서리', icon: 'gem',    kinds: {
      gold:  { label: '골드 획득', base: [6, 10, 15, 23, 34, 52, 80],  nouns: [['goldring', '황금 반지'], ['luckynecklace', '행운의 목걸이'], ['midasring', '미다스의 반지', 4]] },
      aps:   { label: '공격 속도', base: [2, 3.5, 5.5, 8, 12, 18, 27], nouns: [['galebracelet', '질풍의 팔찌'], ['featherearring', '깃털 귀걸이'], ['windwing', '바람 날개 장식', 4]] },
      comp:  { label: '동료 공격', base: [5, 9, 14, 21, 32, 48, 74],   nouns: [['charm', '동료의 부적'], ['friendring', '우정의 반지'], ['warhorn', '전쟁의 뿔나팔', 4]] },
      click: { label: '직접 공격', base: [8, 14, 22, 33, 50, 76, 116],  nouns: [['glove', '강타의 장갑'], ['armband', '용사의 완장'], ['titangauntlet', '거인의 건틀릿', 4]] } } },
  };
  const SLOT_KEYS = Object.keys(GEAR);
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);   // 'constructor' 같은 이름을 걸러내려고 in/[] 대신 쓴다

  // 테스트에서 드롭을 고정하려고 난수 함수를 바꿀 수 있게 한다
  let rnd = Math.random;
  function setRandom(fn) { rnd = fn || Math.random; }

  const kindDef = (it) => GEAR[it.slot].kinds[it.kind];
  const itemNoun = (it) => { const nouns = kindDef(it).nouns; return nouns[it.n % nouns.length]; };   // [디자인 id, 이름, 최소 등급?]
  // 등급 r에서 나올 수 있는 디자인 번호 하나 (세 번째 값이 있는 디자인은 그 등급 이상에서만 — 전설 이상 전용 디자인)
  function pickNoun(def, r, rand) {
    const ok = def.nouns.map((x, i) => i).filter((i) => (def.nouns[i][2] || 0) <= r);
    return ok[Math.floor(rand() * ok.length)];
  }
  const itemName = (it) => (it.sp ? St.specialOf(it.sp.k).prefix + ' ' : '') + RARITY_PREFIX[it.r] + ' ' + itemNoun(it)[1];   // 특별 옵션이 있으면 이름 앞에 붙는다 (예: 사냥꾼의 고귀한 장검)
  // 장비 그림 이름 (images/gear/<디자인 id>). 같은 이름의 장비는 같은 모양이고 등급은 테두리 색으로 구분한다.
  const itemDesign = (it) => itemNoun(it)[0];
  const GEAR_DESIGNS = [];
  for (const slot of Object.keys(GEAR)) for (const kind of Object.keys(GEAR[slot].kinds)) for (const [id] of GEAR[slot].kinds[kind].nouns) GEAR_DESIGNS.push(id);
  const round1 = (x) => Math.round(x * 10) / 10;
  // 무작위 편차: 예전엔 ±15%라 같은 등급·종류·레벨이어도 최대 35%까지 차이 나서 너무 들쭉날쭉했다 → ±5%.
  // 저장 검사(maxItemVal)는 예전 장비를 깎지 않도록 옛 상한(+15%)을 그대로 쓴다.
  const ITEM_SPREAD = 0.05;
  const maxItemVal = (slot, kind, r, ilvl) => round1(GEAR[slot].kinds[kind].base[r] * (1 + ilvl / GEAR_SCALE_STAGE) * 1.15) + 0.1;
  const itemBaseVal = (it) => GEAR[it.slot].kinds[it.kind].base[it.r] * (1 + it.ilvl / GEAR_SCALE_STAGE);
  const itemQuality = (it) => it.val / itemBaseVal(it) - 1;   // 기준 수치 대비 편차 (-0.05 ~ +0.05, 예전 장비는 ±0.15까지)
  const sellValue = (it) => Math.ceil(monsterGold(it.ilvl) * RARITIES[it.r].gold);

  // ---- 장비 강화(재련): 같은 칸의 다른 장비를 재료로 써서 수치를 올린다. 등급·레벨은 그대로, 실제 효과만 세진다. ----
  // 최대 15강까지, 낮은 단계는 100% 성공하지만 높은 단계로 갈수록 실패 확률이 생긴다. 실패해도 골드와 재료는 그대로 사라진다(위험 요소).
  const ENH_MAX = 15, ENH_STEP = 0.08;   // 강화 1단계당 +8%, 최대 15단계(+120%)
  const ENH_CHANCE = [1, 1, 1, 1, 1, 0.85, 0.85, 0.7, 0.7, 0.55, 0.55, 0.4, 0.3, 0.2, 0.15];   // lv → lv+1 성공 확률 (배열 순서 = 지금 레벨)
  // 증표 상점 '장인의 손길': 100% 미만 단계에만 +3%p씩
  const enhChance = (lv, s) => { const c = ENH_CHANCE[Math.max(0, Math.min(ENH_CHANCE.length - 1, lv))]; return c >= 1 ? 1 : Math.min(1, c + (s ? 0.03 * perkLv(s, 'artisan') : 0)); };
  // ---- 장비 초월(✦): 15강을 채운 장비를 한 단계 더. 단계마다 효과 +25%, 장비 레벨 상한 +100. 실패 없음. ----
  const STAR_MAX = 5, STAR_STEP = 0.25, STAR_LV = 100;
  const enhVal = (it) => it.val * (1 + ENH_STEP * (it.enh || 0)) * (1 + STAR_STEP * (it.star || 0));   // 실제로 적용되는 수치 (강화·초월 반영)
  const starDust = (it) => Math.ceil(1500 * ((it.star || 0) + 1) * [0.5, 0.6, 0.8, 1, 1.3, 1.7, 2.2][it.r]);
  // 재료: 같은 칸, 같은 등급 이상인 가방 장비 1개
  const starMaterials = (s, it) => s.bag.filter((x) => x.id !== it.id && x.slot === it.slot && x.r >= it.r && !x.lock);
  // 결과: { ok, reason? | star, dust }  reason: 'target' | 'enh' 15강이 아님 | 'max' | 'material' | 'dust'
  function starItem(s, targetId, materialId) {
    const it = findItem(s, targetId);
    if (!it) return { ok: false, reason: 'target' };
    if ((it.enh || 0) < ENH_MAX) return { ok: false, reason: 'enh' };
    if ((it.star || 0) >= STAR_MAX) return { ok: false, reason: 'max' };
    const mi = s.bag.findIndex((x) => x.id === materialId);
    if (mi < 0 || !starMaterials(s, it).includes(s.bag[mi])) return { ok: false, reason: 'material' };
    const dust = starDust(it);
    if (s.dust < dust) return { ok: false, reason: 'dust', dust };
    const before = maxHp(s);
    s.dust -= dust;
    s.bag.splice(mi, 1);
    it.star = (it.star || 0) + 1;
    if (SLOT_KEYS.some((k) => s.equip[k] === it)) s.hp += Math.max(0, maxHp(s) - before);
    return { ok: true, star: it.star, dust };
  }
  const enhCost = (it) => Math.ceil(sellValue(it) * (2 + (it.enh || 0) * 0.8));   // 강화할수록, 실패 위험이 클수록 골드가 더 든다
  const findItem = (s, id) => SLOT_KEYS.map((k) => s.equip[k]).find((x) => x && x.id === id) || s.bag.find((x) => x.id === id) || null;
  // 결과: { ok, reason? | cost, chance, success, enh }  reason: 'target' 없는 장비 | 'max' 이미 최대 강화 | 'material' 쓸 수 없는 재료 | 'gold' 골드 부족
  function enhanceItem(s, targetId, materialId) {
    const target = findItem(s, targetId);
    if (!target) return { ok: false, reason: 'target' };
    const lv = target.enh || 0;
    if (lv >= ENH_MAX) return { ok: false, reason: 'max' };
    const mi = s.bag.findIndex((x) => x.id === materialId);
    if (mi < 0 || s.bag[mi].id === targetId || s.bag[mi].slot !== target.slot || s.bag[mi].lock) return { ok: false, reason: 'material' };
    const cost = enhCost(target);
    if (s.gold < cost) return { ok: false, reason: 'gold', cost };
    const chance = enhChance(lv, s);
    s.gold -= cost;
    s.bag.splice(mi, 1);
    const success = rnd() < chance;
    if (success) target.enh = lv + 1;
    return { ok: true, cost, chance, success, enh: target.enh };
  }

  function rollRarity(boss, s) {
    const key = boss ? 'bossW' : 'w';
    const rare = s ? 1 + specialV(s, 'rare') : 1;   // 유물 '네잎클로버': 희귀 이상의 가중치가 커진다
    const weight = (i) => RARITIES[i][key] * (i >= 2 ? rare : 1);
    let total = 0;
    for (let i = 0; i < RARITIES.length; i++) total += weight(i);
    let x = rnd() * total;
    for (let i = 0; i < RARITIES.length; i++) {
      x -= weight(i);
      if (x < 0) return i;
    }
    return RARITIES.length - 1;
  }

  // stage에서 얻는 장비 하나를 굴린다. forceSlot을 주면 칸(무기·방어구·액세서리)을 고정한다 (뽑기 상점용)
  function rollItem(s, stage, boss, forceRarity, forceSlot) {
    const r = forceRarity !== undefined ? forceRarity : rollRarity(boss, s);
    const slot = forceSlot || SLOT_KEYS[Math.floor(rnd() * SLOT_KEYS.length)];
    const kinds = Object.keys(GEAR[slot].kinds);
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const def = GEAR[slot].kinds[kind];
    const val = round1(def.base[r] * (1 + stage / GEAR_SCALE_STAGE) * (1 - ITEM_SPREAD + rnd() * 2 * ITEM_SPREAD));   // ±5% 무작위
    s.itemSeq += 1;
    return { id: s.itemSeq, slot, kind, r, ilvl: stage, val, n: pickNoun(def, r, rnd), enh: 0 };
  }

  const dropChance = (s, boss) => ((boss ? BOSS_DROP_CHANCE : DROP_CHANCE) + LUCK_PER_LV * perkLv(s, 'luck') + specialV(s, 'luck')) * (1 + potionV(s, 'luck'));
  // 얻은 장비의 등급을 업적용 누적 기록에 센다 (드롭·상자·장비 상점 모두)
  function tallyRarity(s, it) {
    if (it.r >= 2) s.stats.rares += 1;
    if (it.r >= 3) s.stats.epics += 1;
    if (it.r >= 4) s.stats.legends += 1;
    if (it.r >= 5) s.stats.uniques += 1;
    if (it.r >= 6) s.stats.myths += 1;
  }
  // it을 그 칸에 껴 봤을 때의 종합 전투력(초당 피해). 비교가 끝나면 원래 장비로 되돌린다.
  function equipPower(s, it) {
    const prev = s.equip[it.slot];
    s.equip[it.slot] = it;
    const p = totalDps(s);
    s.equip[it.slot] = prev;
    return p;
  }
  // 더 좋은 장비인지: 같은 능력(칸+kind)이면 수치로 바로 비교하고, 능력 종류가 다르면(예: 액세서리의 골드 vs 공격 속도)
  // 수치를 직접 비교할 수 없으니 종합 전투력(totalDps)을 실제로 계산해서 비교한다.
  // 특별 옵션이 있는 장비는 옵션 없는 장비에게 자리를 뺏기지 않고, 옵션 있는 쪽은 수치(또는 전투력)가 90%만 돼도 자리를 얻는다.
  const isUpgrade = (s, it) => {
    const cur = s.equip[it.slot];
    if (!cur) return true;
    if (cur.sp && !it.sp) return false;
    if (cur.kind === it.kind) return enhVal(it) > enhVal(cur) || (!!it.sp && !cur.sp && enhVal(it) >= enhVal(cur) * 0.9);
    return equipPower(s, it) >= equipPower(s, cur) * (it.sp && !cur.sp ? 0.9 : 1);
  };

  // 장비를 가방에 넣는다. 자동 판매 등급 이하이거나 가방이 가득 차면 판다(자동 분해면 가루로). 결과: 'bag' | 'sold' | 'dusted'
  function stow(s, it) {
    if ((it.r <= s.autoSell && it.r <= AUTO_SELL_MAX && !it.sp) || s.bag.length >= bagLimit(s)) {
      if (s.autoDust) { s.dust = Math.min(DUST_CAP, s.dust + dustGain(s, it)); s.stats.sold += 1; return 'dusted'; }
      s.gold += sellValue(it);
      s.stats.sold += 1;
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
    s.stats.drops += 1;
    tallyRarity(s, it);
    ev.push({ type: 'drop', item: it, action, gold: action === 'sold' ? sellValue(it) : 0, dust: action === 'dusted' ? dustGain(s, it) : 0 });
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
  // ---- 장비 잠금: 잠근 장비는 판매·분해·정리·강화/초월 재료에서 빠진다 (언제든 풀 수 있다) ----
  function toggleLock(s, id) {
    const it = findItem(s, id);
    if (!it) return null;
    if (it.lock) delete it.lock; else it.lock = true;
    return !!it.lock;
  }
  function sellBagItem(s, id) {
    const i = s.bag.findIndex((x) => x.id === id);
    if (i < 0 || s.bag[i].lock) return -1;
    const g = sellValue(s.bag[i]);
    s.gold += g;
    s.stats.sold += 1;
    s.bag.splice(i, 1);
    return g;
  }
  // 가방에서 등급이 maxRarity 이하인 장비를 모두 판다 (장착 중인 것은 그대로)
  function sellBagUpTo(s, maxRarity) {
    let n = 0, gold = 0;
    s.bag = s.bag.filter((it) => {
      if (it.r > maxRarity || it.lock) return true;
      gold += sellValue(it); n += 1;
      return false;
    });
    s.gold += gold;
    s.stats.sold += n;
    return { n, gold };
  }
  // 여러 개를 골라서 판다. 가방에 없는 번호는 무시한다. { n, gold }
  // ---- 분해와 장비 레벨 ----
  // 분해: 가방 장비를 가루로 바꾼다. 등급·레벨·강화 단계가 높을수록 많이 나온다.
  // 레벨 올리기: 가루로 장비 레벨(ilvl)을 1씩 올린다. 수치는 레벨 비율만큼 오르고, 처음 굴린 무작위 편차(±5%)는 그대로 남는다.
  // 상한은 내 최고 스테이지라서, 예전에 얻은 좋은 장비를 지금 진행도까지 끌어올려 계속 쓸 수 있다.
  const DUST_CAP = 1e15;
  const DUST_R = [1, 2, 5, 12, 30, 80, 200];        // 등급별 기본 가루
  const LV_COST_R = [0.5, 0.6, 0.8, 1, 1.3, 1.7, 2.2];   // 등급별 레벨 올리기 비용 배율
  const dustValue = (it) => Math.ceil(DUST_R[it.r] * (1 + it.ilvl / 50) * (1 + 0.5 * (it.enh || 0)) + 0.6 * 1500 * [0.5, 0.6, 0.8, 1, 1.3, 1.7, 2.2][it.r] * ((it.star || 0) * ((it.star || 0) + 1)) / 2);   // 초월에 쓴 가루(starDust 누적)는 60% 돌려받는다
  // 장비 레벨 상한: 최고 스테이지 + 100, 초월 한 단계마다 +100 더
  const ITEM_LV_MAX = 99999, ITEM_LV_BONUS = 100;
  const dustGain = (s, it) => Math.ceil(dustValue(it) * (1 + 0.1 * perkLv(s, 'alchemy')));   // 실제로 받는 가루 (증표 상점 '가루 연금술')
  const itemLevelCap = (s, it) => Math.min(ITEM_LV_MAX, Math.max(1, s.bestStage) + ITEM_LV_BONUS + STAR_LV * ((it && it.star) || 0));
  const lvStepCost = (r, lv) => Math.ceil((2 + lv / 10) * LV_COST_R[r]);   // lv → lv+1
  function levelUpCost(it, n) { let c = 0; for (let i = 0; i < n; i++) c += lvStepCost(it.r, it.ilvl + i); return c; }
  // 지금 가루로 최대 몇 레벨까지 올릴 수 있나 (want 이하, 상한까지)
  function levelUpPlan(s, it, want) {
    const room = Math.max(0, itemLevelCap(s, it) - it.ilvl);
    let n = 0, cost = 0;
    while (n < Math.min(want, room)) { const c = lvStepCost(it.r, it.ilvl + n); if (cost + c > s.dust) break; cost += c; n += 1; }
    return { n, cost, room, next: room > 0 ? lvStepCost(it.r, it.ilvl) : 0 };
  }
  // 결과: { ok, reason? | levels, cost, ilvl }  reason: 'target' | 'cap' 최고 스테이지까지 올림 | 'dust' 가루 부족
  function levelUpItem(s, id, want = 1) {
    const it = findItem(s, id);
    if (!it) return { ok: false, reason: 'target' };
    const plan = levelUpPlan(s, it, Math.max(1, Math.floor(num(want, 1))));
    if (plan.room <= 0) return { ok: false, reason: 'cap' };
    if (plan.n <= 0) return { ok: false, reason: 'dust', need: plan.next };
    const before = maxHp(s);
    const from = it.ilvl;
    it.ilvl += plan.n;
    it.val = Math.min(maxItemVal(it.slot, it.kind, it.r, it.ilvl) - 0.1, round1(it.val * (1 + it.ilvl / GEAR_SCALE_STAGE) / (1 + from / GEAR_SCALE_STAGE)));
    s.dust -= plan.cost;
    if (SLOT_KEYS.some((k) => s.equip[k] === it)) s.hp += Math.max(0, maxHp(s) - before);   // 낀 방어구면 늘어난 체력만큼 채운다
    return { ok: true, levels: plan.n, cost: plan.cost, ilvl: it.ilvl };
  }
  function dismantleItems(s, ids) {
    const set = new Set(ids);
    let n = 0, dust = 0;
    s.bag = s.bag.filter((it) => {
      if (!set.has(it.id) || it.lock) return true;
      dust += dustGain(s, it); n += 1;
      return false;
    });
    s.dust = Math.min(DUST_CAP, s.dust + dust);
    s.stats.sold += n;
    return { n, dust };
  }
  function sellBagItems(s, ids) {
    const set = new Set(ids);
    let n = 0, gold = 0;
    s.bag = s.bag.filter((it) => {
      if (!set.has(it.id) || it.lock) return true;
      gold += sellValue(it); n += 1;
      return false;
    });
    s.gold += gold;
    s.stats.sold += n;
    return { n, gold };
  }
  // 지금 낀 장비(같은 칸·같은 능력)보다 수치가 같거나 낮아서 쓸모없어진 가방 장비. 다른 능력의 장비는 비교할 수 없어서 포함하지 않는다.
  const isWeaker = (s, it) => { const cur = s.equip[it.slot]; return !it.sp && !!cur && cur.kind === it.kind && enhVal(it) <= enhVal(cur); };   // 특별 옵션 장비는 정리 대상이 아니다
  const bagWeaker = (s) => s.bag.filter((it) => !it.lock && isWeaker(s, it));
  // 장착한 장비가 kind 능력에 주는 배율 (1 = 효과 없음, 강화 반영)
  const gearMult = (s, kind) => {
    let v = 0;
    for (const slot of SLOT_KEYS) { const it = s.equip[slot]; if (it && it.kind === kind) v += enhVal(it); }
    return 1 + v / 100;
  };

  // ---- 유물 (크리스탈 상점의 특별 옵션 장비) ----
  const relicDef = (id) => St.RELICS.find((r) => r.id === id) || null;
  // 지금 장착한 유물들이 key 효과에 주는 값의 합 (없으면 0)
  function relicV(s, key) {
    let v = 0;
    for (const id of s.relicEq) {
      const r = s.relics[id] && relicDef(id);
      if (r) for (const o of r.opts) if (o.k === key) v += o.v;
    }
    return v;
  }
  // 유물과 장착한 특수 장비(장비 상점에서 산 특별 옵션 장비)가 key 효과에 주는 값의 합
  function specialV(s, key) {
    let v = relicV(s, key);
    const pk = PERK_SPECIAL[key];
    if (pk) v += perkLv(s, pk[0]) * pk[1];   // 증표 상점 강화
    for (const slot of SLOT_KEYS) { const it = s.equip[slot]; if (it && it.sp && it.sp.k === key) v += it.sp.v; }
    return v;
  }
  // 유물을 낀다/뺀다. 낄 수 있는 칸은 RELIC_SLOTS개. 결과: 'on' | 'off' | 'full' | 'none'(안 가진 유물)
  function toggleRelic(s, id) {
    if (!s.relics[id] || !relicDef(id)) return 'none';
    const i = s.relicEq.indexOf(id);
    if (i >= 0) { s.relicEq.splice(i, 1); s.hp = Math.min(s.hp, maxHp(s)); return 'off'; }
    if (s.relicEq.length >= St.RELIC_SLOTS) return 'full';
    s.relicEq.push(id);
    return 'on';
  }

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
    tallyRarity(s, it);
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
  const unownedRelics = (s) => St.RELICS.filter((r) => !s.relics[r.id]);
  function buyProduct(s, id) {
    const box = St.byId(St.BOXES, id), util = St.byId(St.UTILITIES, id);
    const starter = id === St.STARTER.id ? St.STARTER : null;
    const relic = St.byId(St.RELICS, id);
    const slotDraw = St.byId(St.SLOT_DRAWS, id);
    const relicDraw = id === St.RELIC_DRAW.id ? St.RELIC_DRAW : null;
    const product = box || util || starter || relic || slotDraw || relicDraw;
    if (!product) return { ok: false, reason: 'unknown' };
    if (s.crystals < product.price) return { ok: false, reason: 'crystals', product };
    const needSpace = box ? box.count : starter ? starter.items.count : slotDraw ? 1 : 0;
    if (needSpace && s.bag.length + needSpace > bagLimit(s)) return { ok: false, reason: 'bag', product };
    if (util && s.bagExtra >= St.BAG_EXTRA_MAX) return { ok: false, reason: 'max', product };
    if (starter && s.bought.starter) return { ok: false, reason: 'owned', product };
    if (relic && s.relics[id]) return { ok: false, reason: 'owned', product };
    if (relicDraw && unownedRelics(s).length === 0) return { ok: false, reason: 'owned', product };

    s.crystals -= product.price;
    s.stats.spent += product.price;
    if (box || slotDraw) s.stats.boxes += 1;
    const items = [];
    let picked = null;
    if (relic) { s.relics[id] = true; if (s.relicEq.length < St.RELIC_SLOTS) s.relicEq.push(id); }   // 빈 칸이 있으면 바로 낀다
    else if (relicDraw) {
      const pool = unownedRelics(s);
      picked = pool[Math.floor(rnd() * pool.length)];
      s.relics[picked.id] = true;
      if (s.relicEq.length < St.RELIC_SLOTS) s.relicEq.push(picked.id);
    }
    let pityHit = false;
    // 신화 보장: 쓴 크리스탈을 쌓고, 가득 차면 이번 첫 장비를 신화로 바꾼다. 신화가 나오면(보장이든 운이든) 다시 0부터.
    const pityRarity = (odds) => {
      if (!pityHit && s.mythPity >= St.MYTH_PITY) { pityHit = true; s.mythPity = 0; return 6; }
      const r = rollFromOdds(odds);
      if (r === 6) s.mythPity = 0;
      return r;
    };
    if (box || slotDraw) s.mythPity = Math.min(St.MYTH_PITY, s.mythPity + product.price);
    if (box) for (let i = 0; i < box.count; i++) { const it = rollItem(s, shopItemLevel(s), false, pityRarity(box.odds)); giveItem(s, it); items.push(it); }
    else if (slotDraw) { const it = rollItem(s, shopItemLevel(s), false, pityRarity(slotDraw.odds), slotDraw.slot); giveItem(s, it); items.push(it); }
    else if (util) s.bagExtra += St.BAG_STEP;
    else if (starter) {
      const it = rollItem(s, shopItemLevel(s), false, starter.items.rarity); giveItem(s, it); items.push(it);
      for (const pid of starter.potions) { const p = St.byId(St.POTIONS, pid); s.potions[pid] = Math.min(St.POTION_CAP, (s.potions[pid] || 0) + p.dur); }
      s.bought.starter = true;
    }
    return { ok: true, product, items, picked, pityHit };
  }

  // ---- 광고 보상: 광고를 끝까지 보면 크리스탈 10개와 물약 1개, 하루 3번까지 ----
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
  // 광고를 끝까지 봤을 때 부른다. 하루 횟수가 남았으면 크리스탈과 물약을 준다. 결과: { ok, reason?, left, crystals, potion }
  // 물약 하나를 가중치대로 고른다 (용사의 비약은 드물다)
  function rollPotion() {
    let x = rnd() * St.POTIONS.reduce((a, p) => a + p.w, 0);
    for (const p of St.POTIONS) { x -= p.w; if (x < 0) return p; }
    return St.POTIONS[0];
  }
  function claimAd(s, day) {
    const st = adStatus(s, day);
    if (st.left <= 0) return { ok: false, reason: 'limit', left: 0, crystals: 0, potion: null };
    s.adLog = { day, n: st.used + 1 };
    s.stats.ads += 1;
    s.crystals += St.AD_CRYSTALS;
    const potion = rollPotion();
    s.potions[potion.id] = Math.min(St.POTION_CAP, (s.potions[potion.id] || 0) + potion.dur);
    s.stats.potions += 1;
    return { ok: true, left: st.left - 1, crystals: St.AD_CRYSTALS, potion };
  }

  // ---- 장비 상점: 특별 옵션이 붙은 영웅·전설 장비를 정해진 시간마다 새로 들여온다 ----
  // 진열은 (시간 구간 번호, 새로고침 횟수, 장비 레벨)만으로 정해지는 계산이라, 같은 구간에서는 언제 열어도 같은 물건이 나오고 저장할 필요도 없다.
  // 구간은 서버 시각으로 센다 (광고 횟수와 같은 이유: 기기 시계를 바꿔서 새 물건을 뽑지 못하게). 서버 시각을 못 받으면 새 구간으로 넘어가지 않는다.
  function seededRng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shopSync(s, serverNow, localNow) {
    const ms = St.GEAR_SHOP.refreshSec * 1000, online = Number.isFinite(serverNow);
    const win = online ? Math.floor(serverNow / ms) : (s.shop.win || Math.floor(localNow / ms));
    if (win > s.shop.win) s.shop = { win, reroll: 0, lvl: shopItemLevel(s), bought: [] };
    return { win: s.shop.win, online, secsLeft: online ? Math.max(0, Math.ceil(((s.shop.win + 1) * ms - serverNow) / 1000)) : null };
  }
  // 지금 진열된 물건 [{ i, item, price, sold }]. item에는 아직 번호(id)가 없다.
  function shopStock(s) {
    const { win, reroll, lvl, bought } = s.shop;
    if (!win) return [];
    const order = St.SPECIALS.map((_, i) => i);
    const rs = seededRng(win * 9973 + reroll * 131 + 7);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rs() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }   // 옵션이 서로 겹치지 않게 섞는다
    return Array.from({ length: St.GEAR_SHOP.count }, (_, i) => {
      const rng = seededRng(win * 9973 + reroll * 131 + i * 17 + 3);
      const roll = rng(), GS = St.GEAR_SHOP;
      const r = roll < GS.mythChance ? 6 : roll < GS.mythChance + GS.uniqueChance ? 5 : roll < GS.mythChance + GS.uniqueChance + GS.legendChance ? 4 : 3;
      const slot = SLOT_KEYS[(i + win + reroll) % SLOT_KEYS.length];   // 무기·방어구·액세서리가 2개씩 나온다
      const kinds = Object.keys(GEAR[slot].kinds), kind = kinds[Math.floor(rng() * kinds.length)], def = GEAR[slot].kinds[kind];
      const sp = St.SPECIALS[order[i % order.length]], [lo, hi] = r >= 4 ? sp.legend : sp.hero;
      const item = { slot, kind, r, ilvl: lvl, n: pickNoun(def, r, rng),
                     val: round1(def.base[r] * (1 + lvl / GEAR_SCALE_STAGE) * (1 + rng() * ITEM_SPREAD)),   // 드롭(±5%)과 달리 기본값 이상으로 나온다
                     sp: { k: sp.k, v: Math.round((lo + rng() * (hi - lo)) * 1000) / 1000 } };
      return { i, item, price: St.GEAR_SHOP.price[r], sold: bought.includes(i) };
    });
  }
  // 진열된 i번째 장비를 산다. 결과: { ok, reason?, item?, action? }  reason: 'none' 없는 물건 | 'sold' 이미 삼 | 'crystals' 크리스탈 부족 | 'bag' 가방 부족
  function buyShopItem(s, i) {
    const offer = shopStock(s)[i];
    if (!offer) return { ok: false, reason: 'none' };
    if (offer.sold) return { ok: false, reason: 'sold' };
    if (s.crystals < offer.price) return { ok: false, reason: 'crystals' };
    if (s.bag.length >= bagLimit(s)) return { ok: false, reason: 'bag' };   // 자리가 없으면 새 장비도, 밀려난 장비도 둘 곳이 없다
    s.crystals -= offer.price;
    s.stats.spent += offer.price;
    s.stats.shopBuys += 1;
    s.itemSeq += 1;
    const item = Object.assign({ id: s.itemSeq }, offer.item);
    const action = giveItem(s, item);
    s.shop.bought.push(i);
    return { ok: true, item, action, price: offer.price };
  }
  // 크리스탈을 내고 진열을 바로 새로 바꾼다 (한 구간에 rerollMax번까지)
  function rerollShop(s) {
    if (s.shop.reroll >= St.GEAR_SHOP.rerollMax) return { ok: false, reason: 'max' };
    if (s.crystals < St.GEAR_SHOP.rerollCost) return { ok: false, reason: 'crystals' };
    s.crystals -= St.GEAR_SHOP.rerollCost;
    s.stats.spent += St.GEAR_SHOP.rerollCost;
    s.shop.reroll += 1;
    s.shop.bought = [];
    return { ok: true };
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
      adv5: null,        // 5차 직업 (마지막 갈래. 이후로는 '초월' 랭크만 붙는다)
      transcend: 0,      // 5차 직업을 초월한 랭크 (0~2). 갈래는 없고 수치만 더 강해진다
      mastered: {},      // 2~5차 전직을 달성한 직업 도감 (환생해도 유지)
      achieved: {},      // 달성한 업적 (환생해도 유지)
      achClaimed: {},    // 크리스탈 보상을 받은 업적 (환생해도 유지)
      quests: { daily: null, weekly: null, monthly: null },   // 일일·주간·월간 퀘스트 { key 기간 이름표, list [{ id, goal, base }], claimed, bonus } (환생해도 유지)
      tower: { best: 0, day: '' },   // 무한의 탑: 최고 층, 일일 보상을 받은 날짜 (환생해도 유지)
      dungeons: { daily: null, weekly: null, monthly: null },   // 일일·주간·월간 던전 { key, used, cleared, bonusClaimed, bestWaves, boss } (환생해도 유지)
      stats: { bossKills: 0, gold: 0, drops: 0, rares: 0, epics: 0, legends: 0, uniques: 0, myths: 0, sold: 0, casts: 0, downs: 0, taps: 0, ads: 0, potions: 0,
               stageUps: 0, levelUps: 0, shopBuys: 0, boxes: 0, spent: 0, days: 0, time: 0, away: 0, questClaims: 0, dailyClears: 0, weeklyClears: 0, monthlyClears: 0, dungeonRuns: 0 },   // 업적용 누적 기록 (환생해도 유지)
      runT: 0,           // 이번 판을 키운 시간(초). 환생 보상이 시간에 따라 달라진다
      rescueT: 0,        // 유물 '불사조의 깃털'이 다시 쓸 수 있을 때까지 남은 시간 (저장하지 않음)
      dex: {},           // 도감 기록: 2차 직업별 { best 최고 스테이지, kills 처치 수, runs 전직 횟수 } (환생해도 유지)
      perks: {},         // 증표 상점에서 산 영구 강화 { id: 레벨 } (환생해도 유지)
      equip: { weapon: null, armor: null, accessory: null },   // 장착한 장비 (환생해도 유지)
      bag: [],           // 가방 (환생해도 유지)
      itemSeq: 0,        // 장비 번호를 매기는 카운터
      autoEquip: true,   // 더 좋은 장비를 얻으면 자동으로 장착
      mythPity: 0,       // 신화 보장: 상자·뽑기에 쓴 크리스탈 누적 (St.MYTH_PITY가 되면 다음 장비는 신화)
      dust: 0,           // 장비 가루: 장비를 분해해 얻고, 장비 레벨을 올리는 데 쓴다 (환생해도 유지)
      autoDust: false,   // 자동 판매 대신 자동 분해 (골드 대신 가루)
      autoSell: 0,       // 이 등급 이하는 얻자마자 자동 판매 (-1 없음, 0 노말, 1 고급, 2 희귀, 3 영웅, 4 전설). 특별 옵션 장비와 유니크·신화는 팔리지 않는다
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
      relics: {},        // 산 유물 { id: true } (환생해도 유지)
      relicEq: [],       // 장착한 유물 (최대 RELIC_SLOTS개)
      shop: { win: 0, reroll: 0, lvl: 0, bought: [] },   // 장비 상점: 지금 시간 구간 번호·새로고침 횟수·장비 레벨·이번 구간에 산 칸 (진열 자체는 여기서 계산한다)
      bought: {},        // 1회 한정 상품을 샀는지 { starter: true }
      orders: [],        // 크리스탈 충전 주문 번호 (같은 주문이 두 번 지급되지 않게 최근 것만 기억)
      skillCd: {},       // 스킬별 남은 쿨타임(초). 저장은 되지만 불러올 때 새로 시작한다 (표시·계산용)
      buffs: {},         // 지금 걸려 있는 스킬 효과 { haste|might|guard|greed|lifesteal|stun|barrier: { t 남은 시간, v 위력(방벽은 남은 방벽량) } }
      dot: null,         // 몬스터에게 걸린 지속 피해 { t 남은 시간, dps 초당 피해, variant } (몬스터가 바뀌면 사라진다)
      hits: 0,           // 표시용: 지금까지 고블린이 때린 횟수. 화면이 타격 연출을 넣는 시점을 알려고 쓴다 (저장하지 않음)
      savedAt: now || 0,
      nick: '',          // 랭킹에 보이는 닉네임 (비어 있으면 랭킹에 참여하지 않는다)
      attend: { claimed: 0 },   // 서버 출석 보상을 마지막으로 받은 날짜 번호 (같은 날 두 번 받지 않게)
      srvSavedAt: 0,     // 마지막 저장 때 알던 서버 시각(ms, 모르면 0). 자리를 비운 시간을 서버 시각으로 재려고 쓴다
    };
    s.hp = maxHp(s);
    spawnMonster(s);
    return s;
  }

  // ---- 능력치 계산 ----
  // 왕의 증표 1개당 공격력·골드 보너스. 전직을 한 단계 할 때마다 증표의 힘이 RESONANCE만큼 더 깨어난다 (4차 직업이면 ×1.32).
  const TOKEN_BONUS = 0.32, RESONANCE = 0.08;
  const resonance = (s) => 1 + RESONANCE * classPath(s).length;
  const tokenMult = (s) => 1 + TOKEN_BONUS * resonance(s) * s.tokens;
  // 증표는 체력에도 깃든다 (증표 효과의 0.4제곱). 예전에는 공격력·골드만 커져서, 증표를 많이 모으면 몬스터가 한 번에 죽는데도 고블린이 1초 만에 쓰러져
  // 스테이지 90 근처에서 더 나아가지 못했다 (증표를 2배로 늘려도 스테이지가 거의 안 올랐다). tools/simulate.js로 확인.
  const HP_TOKEN_EXP = 0.4;
  const tokenHpMult = (s) => Math.pow(tokenMult(s), HP_TOKEN_EXP);
  const dexRecord = (s, id) => s.dex[id] || { best: 0, kills: 0, runs: 0 };
  const dexStages = (id) => DEX_STAGES[TIER_OF[id]] || [];
  // 도감 등급 0(없음)~3(금): 그 직업으로 도달한 최고 스테이지 기준
  const dexTier = (s, id) => dexStages(id).filter((st) => dexRecord(s, id).best >= st).length;
  // 직업 하나가 주는 공격력·골드 보너스 (예: 0.05 = +5%)
  const masteryOf = (s, id) => (MASTERY_BASE[TIER_OF[id]] || 0) * (1 + MEDAL_BONUS * dexTier(s, id));
  function masteryMult(s) {
    let m = 0;
    for (const id of Object.keys(s.mastered)) m += masteryOf(s, id);
    return 1 + m * (1 + 0.2 * perkLv(s, 'codex'));   // 증표 상점 '도감 공명'
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
  const offlineCap = (s) => OFFLINE_CAP + 3600 * (perkLv(s, 'rest') + specialV(s, 'offline'));
  const kinglyMult = (s) => 1 + 0.05 * perkLv(s, 'kingly');
  const transcendMult = (s) => 1 + TRANSCEND_BONUS * (s.transcend || 0);   // 5차 직업을 초월한 랭크마다 공격력·골드 배율
  const ascendMult = (s) => 1 + 0.02 * perkLv(s, 'ascend');   // 증표 상점 5단계: 끝없이 살 수 있는 강화
  // 1~4차 직업의 배율을 모두 곱한 값 (해당 항목이 없으면 1)
  function statMult(s, key) {
    let m = 1;
    const awaken = 1 + 0.1 * perkLv(s, 'awaken');   // 증표 상점 '직업 각성': 장점(1보다 큰 배율)만 강해지고 단점은 그대로다
    for (const f of PATH_FIELDS) { const id = s[f]; if (id) { const v = NODE[id].mult[key] || 1; m *= v > 1 ? Math.pow(v, awaken) : v; } }
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
  const maxHp = (s) => (50 + 12 * (s.level - 1)) * (1 + 0.25 * s.upgrades.armor) * mile(s.upgrades.armor) * statMult(s, 'hp') * (1 + 0.1 * perkLv(s, 'vitality')) * gearMult(s, 'hp') * tokenHpMult(s) * (1 + 0.03 * perkLv(s, 'titanbody'));
  // 투지: 직업의 체력 배율이 1보다 크면 그 0.8제곱만큼 공격력도 오른다. 몬스터 공격에는 '내 최대 체력의 6%' 상한이 있어서
  // 체력이 높아도 이득이 거의 없는데, 전사 계열은 체력을 얻는 대신 공격력을 잃어 다른 계열보다 3배쯤 약했다 (2026-09-24 실측).
  const gritMult = (s) => Math.pow(Math.max(1, statMult(s, 'hp')), 0.8);
  const hitDmg = (s) =>
    baseDmg(s) * gritMult(s) * (1 + 0.25 * s.upgrades.weapon) * mile(s.upgrades.weapon) * tokenMult(s) * masteryMult(s) * achieveMult(s) * statMult(s, 'dmg') * (1 + 0.1 * perkLv(s, 'might')) * kinglyMult(s) * transcendMult(s) * ascendMult(s) * gearMult(s, 'dmg') * (1 + buffV(s, 'might') + potionV(s, 'might'));
  const attacksPerSec = (s) => (1 + SPEED_PER_LV * s.upgrades.speed) * statMult(s, 'aps') * gearMult(s, 'aps') * (1 + buffV(s, 'haste') + potionV(s, 'haste')) * (1 + 0.03 * perkLv(s, 'swift'));
  // 직업의 공격 속도 배율은 동료에게도 절반만큼 적용된다 (동료가 전체 피해의 대부분이라, 연사 직업이 내 공격만 빨라져서는 다른 직업보다 한참 약했다)
  const partySpeed = (s) => 1 + 0.5 * (statMult(s, 'aps') - 1);
  const companionDps = (s) => s.upgrades.companion * mile(s.upgrades.companion) * hitDmg(s) * 0.35 * statMult(s, 'comp') * (1 + 0.1 * perkLv(s, 'bond')) * gearMult(s, 'comp') * (1 + specialV(s, 'comp')) * (1 + SPEED_PARTY * s.upgrades.speed) * partySpeed(s) * (1 + 0.03 * perkLv(s, 'legion'));
  const goldMult = (s) =>
    (1 + 0.15 * s.upgrades.loot) * mile(s.upgrades.loot) * tokenMult(s) * masteryMult(s) * achieveMult(s) * statMult(s, 'gold') * (1 + 0.1 * perkLv(s, 'greed')) * kinglyMult(s) * transcendMult(s) * ascendMult(s) * gearMult(s, 'gold') * (1 + potionV(s, 'gold')) * (1 + specialV(s, 'gold'));
  const totalDps = (s) => hitDmg(s) * attacksPerSec(s) + companionDps(s);
  // 레벨 60부터는 필요 경험치가 레벨마다 8%씩 더 는다 (5차 전직이 첫날 1.5시간 만에 열리던 것을 둘째 날쯤으로)
  const expNeeded = (s) => Math.ceil(15 * Math.pow(1.3, s.level - 1) * Math.pow(1.08, Math.max(0, s.level - 60)));

  const isBossStage = (stage) => stage % BOSS_EVERY === 0;
  // 몬스터의 성장: 체력은 스테이지마다 ×1.25, 공격력은 ×1.19. 보스는 체력·공격력이 더 크다.
  // 스테이지 50부터는 성장이 완만해진다 (체력 ×1.22, 공격력 ×1.15). 예전에는 끝까지 ×1.25·×1.19라서 스테이지 80 근처에서 몬스터가 강화한 고블린보다 훨씬 빨리 세져 벽이 되었다.
  // 값은 tools/simulate.js로 비교해 정했다 (같은 조건에서 3판째 80 → 90, 8판째 97 → 114).
  // 스테이지 120부터는 체력이 ×1.18씩만 는다 (2026-09-24 tools/balance.js 실측: ×1.22 그대로면 첫날 이후 며칠 동안 하루 +5~10 스테이지로 거의 멈췄다)
  const LATE_FROM = 120, HP_LATE_GROWTH = 1.18;
  const BOSS_HP = 6, BOSS_ATK = 1.5, HP_GROWTH = 1.25, ATK_GROWTH = 1.19, SOFT_FROM = 50, HP_SOFT_GROWTH = 1.22, ATK_SOFT_GROWTH = 1.15;
  const monsterMaxHp = (stage) =>
    Math.round(24 * Math.pow(HP_GROWTH, Math.min(stage, SOFT_FROM) - 1) * Math.pow(HP_SOFT_GROWTH, Math.max(0, Math.min(stage, LATE_FROM) - SOFT_FROM)) * Math.pow(HP_LATE_GROWTH, Math.max(0, stage - LATE_FROM))) * (isBossStage(stage) ? BOSS_HP : 1);
  const monsterAtk = (stage) =>
    2 * Math.pow(ATK_GROWTH, Math.min(stage, SOFT_FROM) - 1) * Math.pow(ATK_SOFT_GROWTH, Math.max(0, stage - SOFT_FROM)) * (isBossStage(stage) ? BOSS_ATK : 1);
  const monsterGold = (stage) =>
    Math.ceil(4 * Math.pow(1.21, stage - 1)) * (isBossStage(stage) ? BOSS_GOLD : 1);
  const BOSS_GOLD = 5;
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
  const deepest = (s) => s.adv5 || s.adv4 || s.adv3 || s.adv || s.cls || null;
  // 지금까지 고른 직업 경로 [1차, 2차, ...]
  const classPath = (s) => PATH_FIELDS.map((f) => s[f]).filter(Boolean);
  // 화면에 그릴 고블린 종류 (가장 높은 단계 직업 > 견습)
  const lookId = (s) => deepest(s) || 'novice';
  const classTitle = (s) => { const id = deepest(s); return id ? NODE[id].name + '★'.repeat(s.transcend || 0) : '견습 고블린'; };

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

  // ---- 초월 (5차 이후, 갈래 없이 랭크만 오른다) ----
  const transcendReady = (s) => !!s.adv5 && s.transcend < TRANSCEND_LEVEL.length && s.level >= TRANSCEND_LEVEL[s.transcend];
  function ascend(s) {
    if (!transcendReady(s)) return false;
    s.transcend += 1;
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
      case 'bounty': amount = Math.ceil(monsterGold(s.stage) * goldMult(s) * sk.power); s.gold += amount; s.stats.gold += amount; break;
      case 'frenzy': setBuff('haste', sk.power, sk.dur); setBuff('might', sk.power, sk.dur); amount = sk.power; break;
      default: setBuff(sk.kind, sk.power, sk.dur); amount = sk.power;   // haste·might·guard·greed·lifesteal
    }
    s.stats.casts += 1;
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
      s.skillCd[sk.id] -= dt / (1 - Math.min(0.6, specialV(s, 'cdr')));   // 유물: 쿨타임 감소
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
      s.stats.levelUps += 1;
      s.hp += 12;   // 레벨업 시 늘어난 기본 체력만큼 회복
      ev.push({ type: 'levelup', level: s.level });
      const st = promoStage(s);
      if (st && s.level === PROMO_LEVEL[st]) ev.push({ type: 'promoReady', stage: st });
      if (s.adv5 && s.transcend < TRANSCEND_LEVEL.length && s.level === TRANSCEND_LEVEL[s.transcend]) ev.push({ type: 'transcendReady', rank: s.transcend + 1 });
    }
  }

  function onKill(s, ev) {
    const gold = Math.ceil(monsterGold(s.stage) * goldMult(s) * (1 + buffV(s, 'greed')));
    s.gold += gold;
    s.stats.gold += gold;
    if (s.isBoss) s.stats.bossKills += 1;
    s.totalKills += 1;
    s.killsInStage += 1;
    for (const f of PATH_FIELDS) if (s[f] && f !== 'cls') dexEntry(s, s[f]).kills += 1;   // 고른 2~4차 직업 모두 기록
    ev.push({ type: 'kill', gold, boss: s.isBoss });
    gainExp(s, Math.ceil(monsterExp(s.stage) * (1 + potionV(s, 'exp') + specialV(s, 'exp'))), ev);   // 지혜의 물약, 유물 '학자의 안경'
    if (rnd() < dropChance(s, s.isBoss)) receiveItem(s, rollItem(s, s.stage, s.isBoss), ev);

    if (s.isBoss || s.killsInStage >= KILLS_PER_STAGE) {
      s.stage += 1;
      s.stats.stageUps += 1;
      s.killsInStage = 0;
      if (s.stage > s.runBest) s.runBest = s.stage;
      if (s.stage > s.bestStage) s.bestStage = s.stage;
      for (const f of PATH_FIELDS) if (s[f] && f !== 'cls') { const d = dexEntry(s, s[f]); if (s.stage > d.best) d.best = s.stage; }
      ev.push({ type: 'stage', stage: s.stage });
    }
    spawnMonster(s);
  }

  // 피해를 준다. 몬스터가 죽고도 피해가 남으면 그 남은 피해가 다음 몬스터에게 이어진다 (한 번에 MAX_CHAIN마리까지).
  // 예전에는 남은 피해가 버려져서, 고블린이 몬스터 체력의 30배를 때려도 한 틱(0.1초)에 한 마리씩만 잡았다.
  // 그동안 몬스터는 계속 때리므로 강해져도 스테이지 80~90에서 고블린이 1초 만에 쓰러졌다.
  const MAX_CHAIN = 40;
  const MONSTER_DPS_CAP = 0.06;
  function dealDamage(s, amount, ev) {
    for (let n = 0; n < MAX_CHAIN && amount > 0 && s.monsterHp > 0; n++) {
      const mult = s.isBoss ? 1 + specialV(s, 'boss') : 1;   // 유물 '사냥꾼의 뿔피리'
      const eff = amount * mult, done = Math.min(eff, s.monsterHp);
      s.dealt += done;
      const ls = buffV(s, 'lifesteal');
      if (ls > 0) s.hp = Math.min(maxHp(s), s.hp + done * ls);   // 흡혈 스킬
      if (eff < s.monsterHp) { s.monsterHp -= eff; return; }
      amount -= s.monsterHp / mult;
      s.monsterHp = 0;
      onKill(s, ev);
    }
  }

  // dt초 만큼 전투를 진행하고 발생한 사건 목록을 돌려준다
  function tick(s, dt) {
    const ev = [];
    s.runT += dt;
    s.stats.time += dt;
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
    s.hp = Math.min(max, s.hp + max * 0.02 * statMult(s, 'regen') * (1 + specialV(s, 'regen')) * dt);   // 초당 최대 체력의 2% 회복
    const guard = Math.min(0.7, buffV(s, 'guard') + specialV(s, 'guard') + (s.isBoss ? specialV(s, 'bossguard') : 0));   // 스킬 '방어' + 유물 '수호자의 방패'·'사냥꾼의 뿔피리'
    // 몬스터가 초당 주는 피해는 내 최대 체력의 6%까지만 (한 번 맞는다고 바로 쓰러지지 않고 최소 16초는 버틴다). 스테이지 140 근처에서는 몬스터의 공격이 체력보다 커서 한 대만 맞아도 쓰러졌다.
    let dmg = buffV(s, 'stun') > 0 ? 0 : Math.min(monsterAtk(s.stage), max * MONSTER_DPS_CAP) * dt * (1 - guard);   // 기절한 몬스터는 공격하지 못한다
    const barrier = s.buffs.barrier;
    if (barrier && dmg > 0) {   // 방벽이 피해를 먼저 대신 맞는다
      const absorbed = Math.min(barrier.v, dmg);
      barrier.v -= absorbed; dmg -= absorbed;
      if (barrier.v <= 0) delete s.buffs.barrier;
    }
    s.hp -= dmg;

    s.rescueT = Math.max(0, s.rescueT - dt);
    if (s.hp <= 0 && s.rescueT <= 0 && specialV(s, 'rescue') > 0) {   // 유물 '불사조의 깃털': 쓰러질 순간 45초에 한 번 체력 40%로 버틴다
      s.hp = max * 0.4;
      s.rescueT = 45;
    }
    if (s.hp <= 0) {
      s.hp = 0;
      s.downT = DOWN_TIME * (1 - Math.min(0.8, specialV(s, 'revive')));   // 유물 '불사조의 깃털'
      s.stats.downs += 1;
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
    s.stats.taps += 1;
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

  // ---- 자리를 비운 시간(오프라인 보상) ----
  // 얼마나 비웠는지는 기기 시계만 믿지 않는다: 마지막으로 저장할 때 알고 있던 서버 시각(srvSavedAt)과 지금의 서버 시각(nowSrv)이 모두 있으면 그 차이를 쓴다.
  // (기기 시계를 앞으로 돌려 8시간 보상을 받거나, 시계가 틀어져 손해를 보는 일을 막는다.) 서버 시각을 모르면 기기 시계의 차이를 쓴다.
  // 결과: { seconds(보상으로 인정하는 시간, 한도 적용), raw(한도 적용 전), source: 'server'|'device', jumped(기기 시계와 서버 시각이 2분 넘게 어긋남), capped(한도에 걸림) }
  const CLOCK_SKEW_SEC = 120;
  function resolveAway(s, nowWall, nowSrv, maxSeconds) {
    const dev = (nowWall - s.savedAt) / 1000;
    const useServer = Number.isFinite(nowSrv) && s.srvSavedAt > 0;
    const raw = useServer ? (nowSrv - s.srvSavedAt) / 1000 : dev;
    const cap = Math.min(offlineCap(s), Number.isFinite(maxSeconds) ? Math.max(0, maxSeconds) : Infinity);
    const seconds = Math.max(0, Math.min(raw, cap));
    return { seconds, raw: Math.max(0, raw), source: useServer ? 'server' : 'device', jumped: useServer && Math.abs(dev - raw) > CLOCK_SKEW_SEC, capped: raw > cap };
  }
  // seconds초만큼 실제 전투를 되감아 돌려서 결과를 돌려준다
  function applyAway(s, seconds) {
    const before = { gold: s.gold, kills: s.totalKills, stage: s.stage, level: s.level };
    const ev = simulate(s, seconds);
    s.stats.away += seconds;
    s.dealt = 0;
    const drops = ev.filter((e) => e.type === 'drop');
    return {
      seconds: Math.floor(seconds),
      gold: Math.floor(s.gold - before.gold),
      kills: s.totalKills - before.kills,
      stageFrom: before.stage,
      stageTo: s.stage,
      levelFrom: before.level,
      levelTo: s.level,
      drops: drops.length,
      dropsSold: drops.filter((e) => e.action === 'sold' || e.action === 'dusted').length,
      dropBest: drops.reduce((m, e) => Math.max(m, e.item.r), -1),
    };
  }
  // 저장된 시각(savedAt)부터 지금까지 비운 시간의 보상을 준다. 30초 미만이면 null. 끝나면 저장 시각을 지금으로 옮겨 같은 시간을 두 번 받지 않게 한다.
  // maxSeconds: 이번에 받을 수 있는 최대 시간 (백그라운드에서 여러 번 깨어난 시간을 합쳐 한도를 지키려고 부르는 쪽이 정한다)
  function applyOffline(s, now, nowSrv, maxSeconds) {
    const a = resolveAway(s, now, nowSrv, maxSeconds);
    s.savedAt = now;
    s.srvSavedAt = Number.isFinite(nowSrv) ? Math.floor(nowSrv) : 0;
    if (!(a.seconds >= OFFLINE_MIN)) return null;
    return Object.assign(applyAway(s, a.seconds), { source: a.source, jumped: a.jumped, capped: a.capped, raw: Math.floor(a.raw) });
  }

  // ---- 환생 ----
  // 환생 보상: 이번 판에서 도달한 스테이지(5스테이지당 증표 1개)에, 이번 판을 키운 시간을 곱한다.
  // 이유: 증표가 생기면 앞 스테이지가 몇 초 만에 지나가서, 짧게 환생을 반복하는 쪽이 오래 키우는 것보다 증표를 5배 가까이 더 벌었다 (tools/simulate.js로 확인).
  // 10분(PRESTIGE_FULL_SEC) 이상 키운 판은 100%, 그보다 짧으면 시간에 비례한다. 유물 '왕의 인장'은 증표를 더 준다.
  const PRESTIGE_FULL_SEC = 600;
  const prestigeInfo = (s) => {
    if (s.runBest < PRESTIGE_MIN_STAGE) return { base: 0, timeF: 0, gain: 0, secsLeft: 0 };
    // 판 최고 스테이지의 1.3제곱 ÷ 50: 초반 환생은 조금 적게(54 → 4개, 예전 10개), 멀리 갈수록 더 많이(250 → 26개).
    // 예전(÷5)은 첫 환생 직후 공격력이 5배로 뛰어 첫날 스테이지 160까지 치솟고 그 뒤로는 거의 멈췄다 (tools/balance.js).
    const base = Math.floor(Math.pow(s.runBest, 1.3) / 50), timeF = Math.min(1, s.runT / PRESTIGE_FULL_SEC);
    return { base, timeF, gain: Math.max(1, Math.floor(base * timeF * (1 + specialV(s, 'token')))), secsLeft: Math.max(0, Math.ceil(PRESTIGE_FULL_SEC - s.runT)) };
  };
  const prestigeGain = (s) => prestigeInfo(s).gain;
  const canPrestige = (s) => prestigeGain(s) > 0;

  function prestige(s) {
    const gain = prestigeGain(s);
    if (gain <= 0) return 0;
    s.tokens += gain;
    s.prestiges += 1;
    s.runT = 0;
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
    s.adv5 = null;
    s.transcend = 0;
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
  // now: 저장 시각(기기 시계), nowSrv: 그때 알던 서버 시각(모르면 생략). 둘을 함께 적어 두었다가, 다음에 열 때 비운 시간을 서버 시각으로 잰다.
  function serialize(s, now, nowSrv) {
    s.savedAt = now;
    s.srvSavedAt = Number.isFinite(nowSrv) ? Math.floor(nowSrv) : 0;   // 서버 시각을 모르면 0: 기기 시계로 잰다 (옛 서버 시각이 남아 어긋나지 않게)
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
    s.gold = clamp(num(o.gold, 0), 0, GOLD_CAP);
    s.level = clamp(Math.floor(num(o.level, 1)), 1, LEVEL_CAP);
    s.exp = clamp(num(o.exp, 0), 0, BIG_CAP);
    s.stage = clamp(Math.floor(num(o.stage, 1)), 1, STAGE_CAP);
    s.killsInStage = clamp(Math.floor(num(o.killsInStage, 0)), 0, KILLS_PER_STAGE);
    s.runBest = clamp(Math.floor(num(o.runBest, s.stage)), s.stage, STAGE_CAP);
    s.bestStage = clamp(Math.floor(num(o.bestStage, s.runBest)), s.runBest, STAGE_CAP);
    s.totalKills = clamp(Math.floor(num(o.totalKills, 0)), 0, 1e15);
    s.tokens = clamp(Math.floor(num(o.tokens, 0)), 0, TOKEN_CAP);
    s.prestiges = clamp(Math.floor(num(o.prestiges, 0)), 0, 1e9);
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
    s.transcend = s.adv5 ? clamp(Math.floor(num(o.transcend, 0)), 0, TRANSCEND_LEVEL.length) : 0;   // 5차 직업이 없으면 초월 랭크도 인정하지 않는다
    for (const a of ACHIEVEMENTS) {
      if (o.achieved && o.achieved[a.id] === true) s.achieved[a.id] = true;
      if (s.achieved[a.id] && o.achClaimed && o.achClaimed[a.id] === true) s.achClaimed[a.id] = true;   // 달성하지 않은 업적의 보상은 받은 것으로 칠 수 없다
    }
    for (const k of Object.keys(s.stats)) s.stats[k] = clamp(num(o.stats && o.stats[k], 0), 0, 1e300);
    s.runT = clamp(num(o.runT, PRESTIGE_FULL_SEC), 0, 1e9);
    s.srvSavedAt = clamp(Math.floor(num(o.srvSavedAt, 0)), 0, 1e14);
    s.nick = typeof o.nick === 'string' ? Social.sanitizeNick(o.nick) : '';
    s.attend = { claimed: clamp(Math.floor(num(o.attend && o.attend.claimed, 0)), 0, 1e6) };
    for (const p of QUEST_PERIODS) {   // 퀘스트: 이름표와 목표 종류·수치를 검사하고, 받은 기록은 남아 있는 목표만 인정한다
      const q = o.quests && o.quests[p];
      const keyOk = q && typeof q.key === 'string' && (p === 'monthly' ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(q.key);
      if (!keyOk || !Array.isArray(q.list)) continue;
      const list = [], seenQ = {};
      for (const it of q.list.slice(0, QUEST_CFG[p].count)) {
        const def = it && typeof it.id === 'string' ? questDef(it.id) : null;
        if (!def || !def[p] && def.id !== 'attend' || seenQ[def.id]) continue;
        seenQ[def.id] = true;
        list.push({ id: def.id, goal: clamp(num(it.goal, 1), 1, 1e12), base: clamp(num(it.base, 0), 0, 1e300) });
      }
      const claimed = {};
      for (const it of list) if (q.claimed && q.claimed[it.id] === true) claimed[it.id] = true;
      s.quests[p] = { key: q.key, list, claimed, bonus: q.bonus === true && list.length > 0 && list.every((x) => claimed[x.id]) };
    }   // 예전 저장에는 없으므로 손해 보지 않게 가득 찬 것으로 시작한다
    if (o.tower && typeof o.tower === 'object') {   // 무한의 탑: 층은 범위 안으로, 날짜는 모양을 검사한다
      s.tower.best = clamp(Math.floor(num(o.tower.best, 0)), 0, Tw.maxFloor);
      s.tower.day = typeof o.tower.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.tower.day) ? o.tower.day : '';
    }
    for (const p of Dg.DUNGEON_PERIODS) {   // 던전: 이름표를 검사하고, 도전 횟수·물리친 파동은 그 기간의 한도를 넘지 않게 자른다
      const d = o.dungeons && o.dungeons[p], cfg = Dg.DUNGEONS[p];
      const keyOk = d && typeof d.key === 'string' && (p === 'monthly' ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(d.key);
      if (!keyOk) continue;
      const bestWaves = clamp(Math.floor(num(d.bestWaves, 0)), 0, cfg.waves);
      s.dungeons[p] = {
        key: d.key,
        used: clamp(Math.floor(num(d.used, 0)), 0, cfg.attempts),
        bestWaves,
        cleared: d.cleared === true && bestWaves >= cfg.waves,
        bonusClaimed: d.bonusClaimed === true,
        bestBonus: clamp(num(d.bestBonus, 0), 0, MG_BONUS_CAP[p] || 0),
        boss: typeof d.boss === 'string' && cfg.boss.includes(d.boss) ? d.boss : cfg.boss[0],
      };
    }
    for (const k of ADV_IDS) {
      const d = o.dex && o.dex[k];
      if (d && typeof d === 'object') {
        s.dex[k] = { best: clamp(Math.floor(num(d.best, 0)), 0, STAGE_CAP), kills: clamp(Math.floor(num(d.kills, 0)), 0, 1e15), runs: clamp(Math.floor(num(d.runs, 0)), 0, 99999) };
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
      const ilvl = clamp(Math.floor(num(x.ilvl, 1)), 1, ITEM_LV_MAX);
      const it = { id: clamp(Math.floor(num(x.id, 0)), 1, 1e12), slot: x.slot, kind: x.kind, r, ilvl,
                   val: clamp(num(x.val, 0), 0, maxItemVal(x.slot, x.kind, r, ilvl)), n: clamp(Math.floor(num(x.n, 0)), 0, 99),
                   enh: clamp(Math.floor(num(x.enh, 0)), 0, ENH_MAX) };
      const star = clamp(Math.floor(num(x.star, 0)), 0, STAR_MAX);
      if (star > 0 && it.enh >= ENH_MAX) it.star = star;   // 초월은 15강 장비에만
      if (x.lock === true) it.lock = true;
      const spDef = r >= 3 && x.sp && typeof x.sp === 'object' ? St.specialOf(x.sp.k) : null;   // 특별 옵션은 영웅 이상에만, 정해진 종류와 범위 안에서만
      if (spDef) it.sp = { k: spDef.k, v: clamp(num(x.sp.v, 0), 0, spDef.legend[1]) };
      return it;
    };
    const seen = {};
    const fresh = (x) => { const it = cleanItem(x); if (!it || seen[it.id]) return null; seen[it.id] = true; return it; };   // 번호가 겹치는 장비는 버린다
    for (const slot of SLOT_KEYS) {
      const it = o.equip && fresh(o.equip[slot]);
      if (it && it.slot === slot) s.equip[slot] = it;
    }
    const bagExtraSaved = Math.min(St.BAG_EXTRA_MAX, Math.floor(clamp(Math.floor(num(o.bagExtra, 0)), 0, St.BAG_EXTRA_MAX) / St.BAG_STEP) * St.BAG_STEP);
    // 가방은 '지금 한도'가 아니라 '늘릴 수 있는 최대 한도'까지 복원한다. 증표 상점 '큰 가방'을 초기화하면 한도가 줄어드는데,
    // 지금 한도로 자르면 넘친 장비가 사라졌다 (tools/fuzz.js가 찾음). 넘친 동안은 새 장비가 가방에 안 들어갈 뿐이다.
    if (Array.isArray(o.bag)) for (const x of o.bag.slice(0, BAG_MAX + bagExtraSaved + 3 * PERKS.bigbag.max)) { const it = fresh(x); if (it) s.bag.push(it); }
    let maxId = 0;
    for (const it of [...s.bag, ...SLOT_KEYS.map((k) => s.equip[k]).filter(Boolean)]) maxId = Math.max(maxId, it.id);
    s.itemSeq = Math.max(maxId, clamp(Math.floor(num(o.itemSeq, 0)), 0, 1e12));
    s.autoEquip = o.autoEquip !== false;
    s.autoSell = clamp(Math.floor(num(o.autoSell, 0)), -1, AUTO_SELL_MAX);
    s.dust = clamp(Math.floor(num(o.dust, 0)), 0, DUST_CAP);
    s.mythPity = clamp(Math.floor(num(o.mythPity, 0)), 0, St.MYTH_PITY);
    s.autoDust = o.autoDust === true;
    // 상점 관련 값: 이상한 값은 범위 안으로 보정하고, 없는 물약·상품은 버린다
    s.crystals = clamp(Math.floor(num(o.crystals, 0)), 0, 1e9);
    for (const p of St.POTIONS) { const t = num(o.potions && o.potions[p.id], 0); if (t > 0) s.potions[p.id] = Math.min(St.POTION_CAP, t); }
    if (typeof o.adClock === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.adClock)) s.adClock = o.adClock;
    const ad = o.adLog;
    if (ad && typeof ad.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ad.day)) s.adLog = { day: ad.day, n: clamp(Math.floor(num(ad.n, 0)), 0, St.AD_DAILY_LIMIT) };
    s.bagExtra = Math.min(St.BAG_EXTRA_MAX, Math.floor(clamp(Math.floor(num(o.bagExtra, 0)), 0, St.BAG_EXTRA_MAX) / St.BAG_STEP) * St.BAG_STEP);
    if (o.bought && o.bought.starter === true) s.bought.starter = true;
    for (const r of St.RELICS) if (o.relics && o.relics[r.id] === true) s.relics[r.id] = true;
    if (o.shop && typeof o.shop === 'object') {
      const sh = o.shop, GS = St.GEAR_SHOP;
      s.shop = { win: clamp(Math.floor(num(sh.win, 0)), 0, 1e7), reroll: clamp(Math.floor(num(sh.reroll, 0)), 0, GS.rerollMax), lvl: clamp(Math.floor(num(sh.lvl, 0)), 0, STAGE_CAP),
                 bought: Array.isArray(sh.bought) ? [...new Set(sh.bought.filter((i) => Number.isInteger(i) && i >= 0 && i < GS.count))] : [] };
    }
    if (Array.isArray(o.relicEq)) for (const id of o.relicEq) if (s.relics[id] && !s.relicEq.includes(id) && s.relicEq.length < St.RELIC_SLOTS) s.relicEq.push(id);
    if (Array.isArray(o.orders)) s.orders = o.orders.filter((x) => typeof x === 'string' && /^[\w-]{1,64}$/.test(x)).slice(-50);
    if (tokenBalance(s) < 0) s.perks = {};   // 번 것보다 많이 쓴 저장 데이터는 산 강화를 모두 되돌린다
    s.hp = Math.min(maxHp(s), Math.max(1, num(o.hp, maxHp(s))));
    spawnMonster(s);
    s.monsterHp = Math.min(s.monsterMax, Math.max(1, num(o.monsterHp, s.monsterMax)));
    return s;
  }

  // ---- 표시용 ----
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

  // ---- GM 치트 (특정 계정에서만 화면에 노출된다. 여기 함수 자체는 게임 규칙을 우회하는 용도라 값 범위만 안전하게 자른다) ----
  const GM_EMAILS = ['hongsunsik1@gmail.com'];
  const isGM = (email) => !!email && GM_EMAILS.includes(email);
  function gmAddCrystals(s, n) { s.crystals = clamp(Math.floor(s.crystals + n), 0, 1e9); }
  function gmAddTokens(s, n) { s.tokens = clamp(Math.floor(s.tokens + n), 0, TOKEN_CAP); }
  const GOLD_CAP = BIG_CAP;   // 저장 복원이 허용하는 골드 상한 (deserialize와 같다)
  function gmAddGold(s, n) { s.gold = clamp(s.gold + n, 0, GOLD_CAP); }
  function gmMaxGold(s) { s.gold = GOLD_CAP; }
  function gmAddDust(s, n) { s.dust = clamp(Math.floor(s.dust + n), 0, DUST_CAP); }
  // 던전 초기화: 일일·주간·월간 도전 횟수·완주 보상·최고 기록을 처음 상태로, 탑 오늘 보상도 다시 받을 수 있게
  function gmResetDungeons(s) {
    for (const p of Dg.DUNGEON_PERIODS) { const d = s.dungeons[p]; if (d) Object.assign(d, { used: 0, cleared: false, bonusClaimed: false, bestWaves: 0, bestBonus: 0 }); }
    s.tower.day = '';
  }
  function gmSetLevel(s, lv) { s.level = clamp(Math.floor(lv), 1, LEVEL_CAP); s.hp = maxHp(s); }
  function gmSetStage(s, stage) {
    const st = clamp(Math.floor(stage), 1, STAGE_CAP);
    s.stage = st; s.killsInStage = 0;
    s.runBest = Math.max(s.runBest, st); s.bestStage = Math.max(s.bestStage, st);
    s.hp = maxHp(s);
    spawnMonster(s);
  }
  function gmMaxUpgrades(s, add) { for (const k of UPGRADE_KEYS) s.upgrades[k] = clamp(s.upgrades[k] + add, 0, UPGRADES[k].max); s.hp = maxHp(s); }
  function gmUnlockRelics(s) { for (const r of St.RELICS) s.relics[r.id] = true; }

  const api = {
    UPGRADES, UPGRADE_KEYS, MILESTONE_EVERY, MILESTONE_MULT, mile, CLASSES, ADVANCED, ADVANCED3, ADVANCED4, ADVANCED5, PROMO_LEVEL, KILLS_PER_STAGE, DOWN_TIME, PRESTIGE_MIN_STAGE, OFFLINE_CAP,
    createState, tick, simulate, clickAttack, resolveAway, applyAway, applyOffline, CLOCK_SKEW_SEC,
    upgradeCost, canBuy, buy, planBuy, buyMany,
    prestigeGain, prestigeInfo, PRESTIGE_FULL_SEC, canPrestige, prestige,
    serialize, deserialize,
    TOKEN_BONUS, maxHp, hitDmg, attacksPerSec, companionDps, totalDps, goldMult, expNeeded, tokenMult,
    monsterAtk, monsterGold, monsterInfo, biomeOf, roundOf, BIOME_LEN, NORMAL_SLOTS, isBossStage, lookId, classTitle,
    STORE: St, potionV, dayKey, creditCrystals, buyProduct, shopSync, shopStock, buyShopItem, rerollShop, specialV, adToday, adStatus, claimAd, shopItemLevel, unownedRelics,
    SKILL_KINDS: Sk.KINDS, SKILL_NAMES: Sk.SKILLS, describeSkill: Sk.describeSkill, MELEE_STYLES: Sk.MELEE_STYLES, ATTACK_STYLE: Sk.ATTACK_STYLE,
    skillsOf, attackStyle, styleOfClass, buffV, canCast, skillFor: (id) => Sk.makeSkill(id, TIER_OF[id]),
    NODES: NODE, nextPromo, promoStage, promoOptions, promote, statMult, masteryMult,
    TRANSCEND_LEVEL, TRANSCEND_BONUS, transcendReady, ascend, transcendMult, ascendMult,
    ACHIEVEMENTS, ACHIEVE_BONUS, achieveMult, checkAchievements, unclaimedAchievements, claimAchievement, claimAllAchievements,
    relicV, relicDef, toggleRelic, resonance, RESONANCE, tokenHpMult,
    PATH_FIELDS, ADV_IDS, advIdsOfTier, classTier, parentOf, childrenOf, classPath, deepest, DEX_STAGES, DEX_MEDALS, MASTERY_BASE, MEDAL_BONUS, dexStages, masteryOf, dexRecord, dexTier,
    RARITIES, GEAR, SLOT_KEYS, BAG_MAX, bagLimit, DROP_CHANCE, BOSS_DROP_CHANCE, LUCK_PER_LV,
    GEAR_DESIGNS, itemDesign, setRandom, itemName, sellValue, rollItem, dropChance, isUpgrade, receiveItem, equipItem, unequipItem, sellBagItem, sellBagUpTo, sellBagItems, isWeaker, bagWeaker, gearMult,
    toggleLock, ENH_MAX, ENH_STEP, STAR_MAX, STAR_STEP, STAR_LV, starDust, starMaterials, starItem, enhVal, enhCost, enhChance, enhanceItem, findItem, equipPower,
    claimAttend, QUEST_PERIODS, QUEST_CFG, QUEST_DEFS, periodKeys, periodSecsLeft, questSync, questBoard, questClaimable, claimQuest, claimQuestBonus,
    DUNGEON_PERIODS: Dg.DUNGEON_PERIODS, DUNGEONS: Dg.DUNGEONS, BOSS_ART: Dg.BOSS_ART, dungeonSync, dungeonInfo, dungeonClaimable, dungeonBossHp, challengeDungeon, dungeonForecast, dungeonWaveBosses, dungeonBagNeed, MG_BONUS_CAP,
    itemQuality, ITEM_SPREAD, ITEM_LV_BONUS, dustValue, dustGain, itemLevelCap, levelUpCost, levelUpPlan, levelUpItem, dismantleItems,
    TOWER: Dg.TOWER, towerHp, towerBoss, towerForecast, towerInfo, climbTower, claimTowerDaily,
    moleBonus, gaugeBonus, parryBonus,
    PERKS, PERK_KEYS, HEADSTART_LV, perkLv, perkCost, perkSpent, tokenBalance, perkMissing, perkUnlocked, canBuyPerk, buyPerk, respecPerks, offlineCap,
    fmt, fmtTime,
    isGM, gmAddCrystals, gmAddTokens, gmAddGold, gmMaxGold, gmAddDust, gmResetDungeons, GOLD_CAP, STAGE_CAP, LEVEL_CAP, TOKEN_CAP, DUST_CAP, ITEM_LV_MAX, gmSetLevel, gmSetStage, gmMaxUpgrades, gmUnlockRelics,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
