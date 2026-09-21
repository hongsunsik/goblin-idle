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
                   mult: { hp: 1.6, regen: 1.5, dmg: 1.15 } },
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
  // 4단계: 전직과 이어지는 강화. 직업을 끝까지 키울수록 증표의 가치가 커진다.
  PERKS.awaken = { name: '직업 각성', icon: 'cap', tier: 4, max: 5, base: 4, req: [['kingly', 1]],
                   per: '직업 능력의 장점 효과 +10% 강화', now: (lv) => `직업 능력의 장점 효과 +${lv * 10}% 강화` };
  PERKS.codex = { name: '도감 공명', icon: 'book', tier: 4, max: 5, base: 4, req: [['kingly', 1]],
                  per: '직업 도감 보너스 +20%', now: (lv) => `직업 도감 보너스 +${lv * 20}%` };
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
  // val(s)이 goal에 닿으면 달성. 달성할 때마다 공격력·골드가 영구히 +1%이고 (환생해도 유지), 기록 탭에서 크리스탈 보상을 받을 수 있다.
  // group은 기록 탭에서 묶어 보여 주는 분류, reward는 보상 크리스탈.
  const ACHIEVE_BONUS = 0.01;
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
  const itemName = (it) => (it.sp ? St.specialOf(it.sp.k).prefix + ' ' : '') + RARITY_PREFIX[it.r] + ' ' + itemNoun(it)[1];   // 특별 옵션이 있으면 이름 앞에 붙는다 (예: 사냥꾼의 고귀한 장검)
  // 장비 그림 이름 (images/gear/<디자인 id>). 같은 이름의 장비는 같은 모양이고 등급은 테두리 색으로 구분한다.
  const itemDesign = (it) => itemNoun(it)[0];
  const GEAR_DESIGNS = [];
  for (const slot of Object.keys(GEAR)) for (const kind of Object.keys(GEAR[slot].kinds)) for (const [id] of GEAR[slot].kinds[kind].nouns) GEAR_DESIGNS.push(id);
  const round1 = (x) => Math.round(x * 10) / 10;
  const maxItemVal = (slot, kind, r, ilvl) => round1(GEAR[slot].kinds[kind].base[r] * (1 + ilvl / GEAR_SCALE_STAGE) * 1.15) + 0.1;
  const sellValue = (it) => Math.ceil(monsterGold(it.ilvl) * RARITIES[it.r].gold);

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

  // stage에서 얻는 장비 하나를 굴린다
  function rollItem(s, stage, boss, forceRarity) {
    const r = forceRarity !== undefined ? forceRarity : rollRarity(boss, s);
    const slot = SLOT_KEYS[Math.floor(rnd() * SLOT_KEYS.length)];
    const kinds = Object.keys(GEAR[slot].kinds);
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const def = GEAR[slot].kinds[kind];
    const val = round1(def.base[r] * (1 + stage / GEAR_SCALE_STAGE) * (0.85 + rnd() * 0.3));   // ±15% 무작위
    s.itemSeq += 1;
    return { id: s.itemSeq, slot, kind, r, ilvl: stage, val, n: Math.floor(rnd() * def.nouns.length) };
  }

  const dropChance = (s, boss) => ((boss ? BOSS_DROP_CHANCE : DROP_CHANCE) + LUCK_PER_LV * perkLv(s, 'luck') + specialV(s, 'luck')) * (1 + potionV(s, 'luck'));
  // 같은 능력을 올려 주면서 수치가 더 큰 장비이거나, 칸이 비어 있으면 '더 좋은' 장비
  // 특별 옵션이 있는 장비는 옵션 없는 장비에게 자리를 뺏기지 않고, 옵션 있는 쪽은 수치가 90%만 돼도 자리를 얻는다.
  const isUpgrade = (s, it) => {
    const cur = s.equip[it.slot];
    if (!cur) return true;
    if (cur.kind !== it.kind || (cur.sp && !it.sp)) return false;
    return it.val > cur.val || (!!it.sp && !cur.sp && it.val >= cur.val * 0.9);
  };

  // 장비를 가방에 넣는다. 자동 판매 등급 이하이거나 가방이 가득 차면 판다. 결과: 'bag' | 'sold'
  function stow(s, it) {
    if (it.r <= s.autoSell || s.bag.length >= bagLimit(s)) {
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
    if (it.r >= 4) s.stats.legends += 1;
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
    s.stats.sold += 1;
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
    s.stats.sold += n;
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
    s.stats.sold += n;
    return { n, gold };
  }
  // 지금 낀 장비(같은 칸·같은 능력)보다 수치가 같거나 낮아서 쓸모없어진 가방 장비. 다른 능력의 장비는 비교할 수 없어서 포함하지 않는다.
  const isWeaker = (s, it) => { const cur = s.equip[it.slot]; return !it.sp && !!cur && cur.kind === it.kind && it.val <= cur.val; };   // 특별 옵션 장비는 정리 대상이 아니다
  const bagWeaker = (s) => s.bag.filter((it) => isWeaker(s, it));
  // 장착한 장비가 kind 능력에 주는 배율 (1 = 효과 없음)
  const gearMult = (s, kind) => {
    let v = 0;
    for (const slot of SLOT_KEYS) { const it = s.equip[slot]; if (it && it.kind === kind) v += it.val; }
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
    const box = St.byId(St.BOXES, id), util = St.byId(St.UTILITIES, id);
    const starter = id === St.STARTER.id ? St.STARTER : null;
    const relic = St.byId(St.RELICS, id);
    const product = box || util || starter || relic;
    if (!product) return { ok: false, reason: 'unknown' };
    if (s.crystals < product.price) return { ok: false, reason: 'crystals', product };
    const needSpace = box ? box.count : starter ? starter.items.count : 0;
    if (needSpace && s.bag.length + needSpace > bagLimit(s)) return { ok: false, reason: 'bag', product };
    if (util && s.bagExtra >= St.BAG_EXTRA_MAX) return { ok: false, reason: 'max', product };
    if (starter && s.bought.starter) return { ok: false, reason: 'owned', product };
    if (relic && s.relics[id]) return { ok: false, reason: 'owned', product };

    s.crystals -= product.price;
    const items = [];
    if (relic) { s.relics[id] = true; if (s.relicEq.length < St.RELIC_SLOTS) s.relicEq.push(id); }   // 빈 칸이 있으면 바로 낀다
    else if (box) for (let i = 0; i < box.count; i++) { const it = rollItem(s, shopItemLevel(s), false, rollFromOdds(box.odds)); giveItem(s, it); items.push(it); }
    else if (util) s.bagExtra += St.BAG_STEP;
    else if (starter) {
      const it = rollItem(s, shopItemLevel(s), false, starter.items.rarity); giveItem(s, it); items.push(it);
      for (const pid of starter.potions) { const p = St.byId(St.POTIONS, pid); s.potions[pid] = Math.min(St.POTION_CAP, (s.potions[pid] || 0) + p.dur); }
      s.bought.starter = true;
    }
    return { ok: true, product, items };
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
      const r = rng() < St.GEAR_SHOP.legendChance ? 4 : 3;
      const slot = SLOT_KEYS[(i + win + reroll) % SLOT_KEYS.length];   // 무기·방어구·액세서리가 2개씩 나온다
      const kinds = Object.keys(GEAR[slot].kinds), kind = kinds[Math.floor(rng() * kinds.length)], def = GEAR[slot].kinds[kind];
      const sp = St.SPECIALS[order[i % order.length]], [lo, hi] = r === 4 ? sp.legend : sp.hero;
      const item = { slot, kind, r, ilvl: lvl, n: Math.floor(rng() * def.nouns.length),
                     val: round1(def.base[r] * (1 + lvl / GEAR_SCALE_STAGE) * (1 + rng() * 0.15)),   // 드롭(±15%)과 달리 기본값 이상으로 나온다
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
      mastered: {},      // 2~4차 전직을 달성한 직업 도감 (환생해도 유지)
      achieved: {},      // 달성한 업적 (환생해도 유지)
      achClaimed: {},    // 크리스탈 보상을 받은 업적 (환생해도 유지)
      stats: { bossKills: 0, gold: 0, drops: 0, legends: 0, sold: 0, casts: 0, downs: 0, taps: 0, ads: 0, potions: 0 },   // 업적용 누적 기록 (환생해도 유지)
      runT: 0,           // 이번 판을 키운 시간(초). 환생 보상이 시간에 따라 달라진다
      rescueT: 0,        // 유물 '불사조의 깃털'이 다시 쓸 수 있을 때까지 남은 시간 (저장하지 않음)
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
  const maxHp = (s) => (50 + 12 * (s.level - 1)) * (1 + 0.25 * s.upgrades.armor) * mile(s.upgrades.armor) * statMult(s, 'hp') * (1 + 0.1 * perkLv(s, 'vitality')) * gearMult(s, 'hp') * tokenHpMult(s);
  const hitDmg = (s) =>
    baseDmg(s) * (1 + 0.25 * s.upgrades.weapon) * mile(s.upgrades.weapon) * tokenMult(s) * masteryMult(s) * achieveMult(s) * statMult(s, 'dmg') * (1 + 0.1 * perkLv(s, 'might')) * kinglyMult(s) * gearMult(s, 'dmg') * (1 + buffV(s, 'might') + potionV(s, 'might'));
  const attacksPerSec = (s) => (1 + SPEED_PER_LV * s.upgrades.speed) * statMult(s, 'aps') * gearMult(s, 'aps') * (1 + buffV(s, 'haste') + potionV(s, 'haste'));
  // 직업의 공격 속도 배율은 동료에게도 절반만큼 적용된다 (동료가 전체 피해의 대부분이라, 연사 직업이 내 공격만 빨라져서는 다른 직업보다 한참 약했다)
  const partySpeed = (s) => 1 + 0.5 * (statMult(s, 'aps') - 1);
  const companionDps = (s) => s.upgrades.companion * mile(s.upgrades.companion) * hitDmg(s) * 0.35 * statMult(s, 'comp') * (1 + 0.1 * perkLv(s, 'bond')) * gearMult(s, 'comp') * (1 + specialV(s, 'comp')) * (1 + SPEED_PARTY * s.upgrades.speed) * partySpeed(s);
  const goldMult = (s) =>
    (1 + 0.15 * s.upgrades.loot) * mile(s.upgrades.loot) * tokenMult(s) * masteryMult(s) * achieveMult(s) * statMult(s, 'gold') * (1 + 0.1 * perkLv(s, 'greed')) * kinglyMult(s) * gearMult(s, 'gold') * (1 + potionV(s, 'gold')) * (1 + specialV(s, 'gold'));
  const totalDps = (s) => hitDmg(s) * attacksPerSec(s) + companionDps(s);
  const expNeeded = (s) => Math.ceil(15 * Math.pow(1.3, s.level - 1));

  const isBossStage = (stage) => stage % BOSS_EVERY === 0;
  // 몬스터의 성장: 체력은 스테이지마다 ×1.25, 공격력은 ×1.19. 보스는 체력·공격력이 더 크다.
  // 스테이지 50부터는 성장이 완만해진다 (체력 ×1.22, 공격력 ×1.15). 예전에는 끝까지 ×1.25·×1.19라서 스테이지 80 근처에서 몬스터가 강화한 고블린보다 훨씬 빨리 세져 벽이 되었다.
  // 값은 tools/simulate.js로 비교해 정했다 (같은 조건에서 3판째 80 → 90, 8판째 97 → 114).
  const BOSS_HP = 6, BOSS_ATK = 1.5, HP_GROWTH = 1.25, ATK_GROWTH = 1.19, SOFT_FROM = 50, HP_SOFT_GROWTH = 1.22, ATK_SOFT_GROWTH = 1.15;
  const monsterMaxHp = (stage) =>
    Math.round(24 * Math.pow(HP_GROWTH, Math.min(stage, SOFT_FROM) - 1) * Math.pow(HP_SOFT_GROWTH, Math.max(0, stage - SOFT_FROM))) * (isBossStage(stage) ? BOSS_HP : 1);
  const monsterAtk = (stage) =>
    2 * Math.pow(ATK_GROWTH, Math.min(stage, SOFT_FROM) - 1) * Math.pow(ATK_SOFT_GROWTH, Math.max(0, stage - SOFT_FROM)) * (isBossStage(stage) ? BOSS_ATK : 1);
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
      s.hp += 12;   // 레벨업 시 늘어난 기본 체력만큼 회복
      ev.push({ type: 'levelup', level: s.level });
      const st = promoStage(s);
      if (st && s.level === PROMO_LEVEL[st]) ev.push({ type: 'promoReady', stage: st });
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
      dropsSold: drops.filter((e) => e.action === 'sold').length,
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
    const base = Math.floor(s.runBest / 5), timeF = Math.min(1, s.runT / PRESTIGE_FULL_SEC);
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
    for (const a of ACHIEVEMENTS) {
      if (o.achieved && o.achieved[a.id] === true) s.achieved[a.id] = true;
      if (s.achieved[a.id] && o.achClaimed && o.achClaimed[a.id] === true) s.achClaimed[a.id] = true;   // 달성하지 않은 업적의 보상은 받은 것으로 칠 수 없다
    }
    for (const k of Object.keys(s.stats)) s.stats[k] = clamp(num(o.stats && o.stats[k], 0), 0, 1e300);
    s.runT = clamp(num(o.runT, PRESTIGE_FULL_SEC), 0, 1e9);
    s.srvSavedAt = clamp(Math.floor(num(o.srvSavedAt, 0)), 0, 1e14);   // 예전 저장에는 없으므로 손해 보지 않게 가득 찬 것으로 시작한다
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
      const it = { id: clamp(Math.floor(num(x.id, 0)), 1, 1e12), slot: x.slot, kind: x.kind, r, ilvl,
                   val: clamp(num(x.val, 0), 0, maxItemVal(x.slot, x.kind, r, ilvl)), n: clamp(Math.floor(num(x.n, 0)), 0, 99) };
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
    for (const r of St.RELICS) if (o.relics && o.relics[r.id] === true) s.relics[r.id] = true;
    if (o.shop && typeof o.shop === 'object') {
      const sh = o.shop, GS = St.GEAR_SHOP;
      s.shop = { win: clamp(Math.floor(num(sh.win, 0)), 0, 1e7), reroll: clamp(Math.floor(num(sh.reroll, 0)), 0, GS.rerollMax), lvl: clamp(Math.floor(num(sh.lvl, 0)), 0, 999),
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
    createState, tick, simulate, clickAttack, resolveAway, applyAway, applyOffline, CLOCK_SKEW_SEC,
    upgradeCost, canBuy, buy, planBuy, buyMany,
    prestigeGain, prestigeInfo, PRESTIGE_FULL_SEC, canPrestige, prestige,
    serialize, deserialize,
    TOKEN_BONUS, maxHp, hitDmg, attacksPerSec, companionDps, totalDps, goldMult, expNeeded, tokenMult,
    monsterAtk, monsterGold, monsterInfo, biomeOf, roundOf, BIOME_LEN, NORMAL_SLOTS, isBossStage, lookId, classTitle,
    STORE: St, potionV, dayKey, creditCrystals, buyProduct, shopSync, shopStock, buyShopItem, rerollShop, specialV, adToday, adStatus, claimAd, shopItemLevel,
    SKILL_KINDS: Sk.KINDS, SKILL_NAMES: Sk.SKILLS, describeSkill: Sk.describeSkill, MELEE_STYLES: Sk.MELEE_STYLES, ATTACK_STYLE: Sk.ATTACK_STYLE,
    skillsOf, attackStyle, styleOfClass, buffV, canCast, skillFor: (id) => Sk.makeSkill(id, TIER_OF[id]),
    NODES: NODE, nextPromo, promoStage, promoOptions, promote, statMult, masteryMult,
    ACHIEVEMENTS, ACHIEVE_BONUS, achieveMult, checkAchievements, unclaimedAchievements, claimAchievement, claimAllAchievements,
    relicV, relicDef, toggleRelic, resonance, RESONANCE, tokenHpMult,
    PATH_FIELDS, ADV_IDS, advIdsOfTier, classTier, parentOf, childrenOf, classPath, deepest, DEX_STAGES, DEX_MEDALS, MASTERY_BASE, MEDAL_BONUS, dexStages, masteryOf, dexRecord, dexTier,
    RARITIES, GEAR, SLOT_KEYS, BAG_MAX, bagLimit, DROP_CHANCE, BOSS_DROP_CHANCE, LUCK_PER_LV,
    GEAR_DESIGNS, itemDesign, setRandom, itemName, sellValue, rollItem, dropChance, isUpgrade, receiveItem, equipItem, unequipItem, sellBagItem, sellBagUpTo, sellBagItems, isWeaker, bagWeaker, gearMult,
    PERKS, PERK_KEYS, HEADSTART_LV, perkLv, perkCost, perkSpent, tokenBalance, perkMissing, perkUnlocked, canBuyPerk, buyPerk, respecPerks, offlineCap,
    fmt, fmtTime,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
