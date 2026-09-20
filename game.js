// 고블린 키우기 - 게임 로직 (DOM과 무관한 순수 함수 모음)
(function (root) {
  const SAVE_VERSION = 1;
  const OFFLINE_CAP = 8 * 3600;   // 오프라인 보상은 최대 8시간까지
  const OFFLINE_MIN = 30;         // 이 시간(초) 이상 자리를 비웠을 때만 오프라인 보상 계산
  const KILLS_PER_STAGE = 5;      // 일반 스테이지는 몬스터 5마리를 잡으면 클리어
  const BOSS_EVERY = 5;           // 5의 배수 스테이지는 보스 1마리
  const DOWN_TIME = 3;            // 쓰러진 뒤 부활까지 걸리는 시간(초)
  const PRESTIGE_MIN_STAGE = 10;  // 환생 가능한 최소 스테이지
  const CLICK_MULT = 3;           // 직접 때리기는 한 번에 공격력의 3배

  // 강화 목록. cost(lv) = base * growth^lv (lv는 현재 레벨 = 다음 레벨업 비용)
  const UPGRADES = {
    weapon:    { name: '무기',      icon: '🗡️', base: 10, growth: 1.30, max: Infinity,
                 effect: (lv) => `공격력 +${lv * 25}%` },
    armor:     { name: '갑옷',      icon: '🛡️', base: 10, growth: 1.30, max: Infinity,
                 effect: (lv) => `최대 체력 +${lv * 25}%` },
    speed:     { name: '재빠른 손', icon: '⚡', base: 40, growth: 1.50, max: 30,
                 effect: (lv) => `초당 공격 ${(1 + lv * 0.1).toFixed(1)}회` },
    companion: { name: '동료 고블린', icon: '👥', base: 60, growth: 1.55, max: Infinity,
                 effect: (lv) => `동료 ${lv}마리가 자동 공격` },
    loot:      { name: '약탈 솜씨', icon: '💰', base: 40, growth: 1.45, max: Infinity,
                 effect: (lv) => `골드 획득 +${lv * 15}%` },
  };
  const UPGRADE_KEYS = Object.keys(UPGRADES);

  // ---- 직업 ----
  // 1차 전직은 Lv.10, 2차 전직은 Lv.20부터 가능. 환생하면 직업이 초기화된다.
  // mult 항목: dmg 공격력, hp 최대 체력, aps 공격 속도, gold 골드, comp 동료 공격, regen 체력 회복, click 직접 때리기
  const PROMO_LEVEL = { base: 10, adv: 20 };
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
  const MASTERY_BONUS = 0.05;   // 2차 전직을 달성한 직업 1개당 공격력·골드 +5% (환생해도 유지)

  // 지역은 10스테이지마다 바뀌고, 지역마다 나오는 몬스터와 보스가 다르다.
  const BIOME_COUNT = 6;
  const MONSTER_TABLE = [
    { normals: [['🐀', '들쥐'], ['🐗', '멧돼지'], ['🐺', '늑대'], ['🐍', '독뱀'], ['🕷️', '숲거미']],
      bosses:  [['🐻', '광폭 곰'], ['🧌', '숲의 트롤']] },
    { normals: [['🦇', '박쥐'], ['🕷️', '동굴거미'], ['🐍', '지하뱀'], ['🧟', '광부 좀비'], ['👻', '동굴 유령']],
      bosses:  [['🦂', '전갈 대왕'], ['🧌', '동굴 트롤']] },
    { normals: [['🦂', '전갈'], ['🐍', '사막뱀'], ['🦎', '도마뱀'], ['🦅', '독수리'], ['🧟', '미라']],
      bosses:  [['🐲', '모래 용'], ['👹', '사막 오거']] },
    { normals: [['🐺', '서리늑대'], ['🦌', '설원 순록'], ['⛄', '눈사람'], ['🐧', '펭귄 전사'], ['🐻', '설원 곰']],
      bosses:  [['🐲', '얼음 용'], ['🧌', '설인']] },
    { normals: [['🔥', '불꽃 정령'], ['🦎', '화염 도마뱀'], ['🐍', '용암뱀'], ['🦂', '불전갈'], ['👹', '꼬마 도깨비']],
      bosses:  [['🐲', '화염 용'], ['👹', '마왕']] },
    { normals: [['🧟', '좀비'], ['👻', '유령'], ['🦇', '흡혈 박쥐'], ['💀', '해골 병사'], ['🧛', '뱀파이어']],
      bosses:  [['💀', '해골 군주'], ['🐲', '뼈 용']] },
  ];

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
      tokens: 0,         // 환생으로 얻은 왕의 증표 (공격력·골드 +25%씩)
      prestiges: 0,
      cls: null,         // 1차 직업 (전사·궁수·마법사·도적)
      adv: null,         // 2차 직업
      mastered: {},      // 2차 전직을 달성한 직업 도감 (환생해도 유지)
      hp: 0,
      monsterHp: 0,
      monsterMax: 0,
      isBoss: false,
      downT: 0,
      atkT: 0,
      dealt: 0,          // 표시용: 최근에 준 피해량 (저장하지 않음)
      savedAt: now || 0,
    };
    s.hp = maxHp(s);
    spawnMonster(s);
    return s;
  }

  // ---- 능력치 계산 ----
  const tokenMult = (s) => 1 + 0.25 * s.tokens;
  const masteryMult = (s) => 1 + MASTERY_BONUS * Object.keys(s.mastered).length;
  // 1차·2차 직업의 배율을 곱한 값 (해당 항목이 없으면 1)
  function statMult(s, key) {
    const b = s.cls && CLASSES[s.cls];
    const a = s.adv && ADVANCED[s.adv];
    return ((b && b.mult[key]) || 1) * ((a && a.mult[key]) || 1);
  }
  const baseDmg = (s) => 3 + 1.5 * (s.level - 1);
  const maxHp = (s) => (50 + 12 * (s.level - 1)) * (1 + 0.25 * s.upgrades.armor) * statMult(s, 'hp');
  const hitDmg = (s) =>
    baseDmg(s) * (1 + 0.25 * s.upgrades.weapon) * tokenMult(s) * masteryMult(s) * statMult(s, 'dmg');
  const attacksPerSec = (s) => (1 + 0.1 * s.upgrades.speed) * statMult(s, 'aps');
  const companionDps = (s) => s.upgrades.companion * hitDmg(s) * 0.35 * statMult(s, 'comp');
  const goldMult = (s) =>
    (1 + 0.15 * s.upgrades.loot) * tokenMult(s) * masteryMult(s) * statMult(s, 'gold');
  const totalDps = (s) => hitDmg(s) * attacksPerSec(s) + companionDps(s);
  const expNeeded = (s) => Math.ceil(15 * Math.pow(1.3, s.level - 1));

  const isBossStage = (stage) => stage % BOSS_EVERY === 0;
  const monsterMaxHp = (stage) =>
    Math.round(12 * Math.pow(1.28, stage - 1)) * (isBossStage(stage) ? 6 : 1);
  const monsterAtk = (stage) =>
    2 * Math.pow(1.2, stage - 1) * (isBossStage(stage) ? 1.5 : 1);
  const monsterGold = (stage) =>
    Math.ceil(4 * Math.pow(1.22, stage - 1)) * (isBossStage(stage) ? 5 : 1);
  const monsterExp = (stage) =>
    Math.ceil(3 * Math.pow(1.15, stage - 1)) * (isBossStage(stage) ? 4 : 1);

  const biomeOf = (stage) => Math.floor((stage - 1) / 10) % BIOME_COUNT;

  // 이 스테이지에 나오는 몬스터 { emoji, name }
  function monsterInfo(stage) {
    const t = MONSTER_TABLE[biomeOf(stage)];
    const pick = isBossStage(stage)
      ? t.bosses[(stage / BOSS_EVERY - 1) % t.bosses.length]
      : t.normals[(stage - 1) % t.normals.length];
    return { emoji: pick[0], name: pick[1] };
  }

  // 화면에 그릴 고블린 종류 (2차 직업 > 1차 직업 > 견습)
  const lookId = (s) => s.adv || s.cls || 'novice';
  const classTitle = (s) =>
    (s.adv && ADVANCED[s.adv].name) || (s.cls && CLASSES[s.cls].name) || '견습 고블린';

  // ---- 전직 ----
  // 지금 할 수 있는 전직 단계: 'base' | 'adv' | null
  function promoStage(s) {
    if (!s.cls) return s.level >= PROMO_LEVEL.base ? 'base' : null;
    if (!s.adv) return s.level >= PROMO_LEVEL.adv ? 'adv' : null;
    return null;
  }
  function promoOptions(s) {
    const st = promoStage(s);
    if (st === 'base') return Object.keys(CLASSES);
    if (st === 'adv') return CLASSES[s.cls].adv.slice();
    return [];
  }
  function promote(s, id) {
    if (promoOptions(s).indexOf(id) < 0) return false;
    const oldMax = maxHp(s);
    if (promoStage(s) === 'base') s.cls = id;
    else { s.adv = id; s.mastered[id] = true; }
    s.hp = Math.min(maxHp(s), s.hp + Math.max(0, maxHp(s) - oldMax));   // 늘어난 체력만큼 회복
    return true;
  }

  // ---- 강화 ----
  function upgradeCost(s, key) {
    const u = UPGRADES[key];
    return Math.ceil(u.base * Math.pow(u.growth, s.upgrades[key]));
  }

  function canBuy(s, key) {
    return s.upgrades[key] < UPGRADES[key].max && s.gold >= upgradeCost(s, key);
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
      if ((s.level === PROMO_LEVEL.base && !s.cls) || (s.level === PROMO_LEVEL.adv && s.cls && !s.adv)) {
        ev.push({ type: 'promoReady', stage: promoStage(s) });
      }
    }
  }

  function onKill(s, ev) {
    const gold = Math.ceil(monsterGold(s.stage) * goldMult(s));
    s.gold += gold;
    s.totalKills += 1;
    s.killsInStage += 1;
    ev.push({ type: 'kill', gold, boss: s.isBoss });
    gainExp(s, monsterExp(s.stage), ev);

    if (s.isBoss || s.killsInStage >= KILLS_PER_STAGE) {
      s.stage += 1;
      s.killsInStage = 0;
      if (s.stage > s.runBest) s.runBest = s.stage;
      if (s.stage > s.bestStage) s.bestStage = s.stage;
      ev.push({ type: 'stage', stage: s.stage });
    }
    spawnMonster(s);
  }

  function dealDamage(s, amount, ev) {
    if (amount <= 0 || s.monsterHp <= 0) return;
    s.dealt += Math.min(amount, s.monsterHp);
    s.monsterHp -= amount;
    if (s.monsterHp <= 0) onKill(s, ev);
  }

  // dt초 만큼 전투를 진행하고 발생한 사건 목록을 돌려준다
  function tick(s, dt) {
    const ev = [];
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
      dealDamage(s, hitDmg(s), ev);
    }

    const max = maxHp(s);
    s.hp = Math.min(max, s.hp + max * 0.02 * statMult(s, 'regen') * dt);   // 초당 최대 체력의 2% 회복
    s.hp -= monsterAtk(s.stage) * dt;

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
    return ev;
  }

  // 직접 때리기: 공격력의 3배 피해. 쓰러진 상태에서는 못 한다.
  function clickAttack(s) {
    if (s.downT > 0) return { dmg: 0, events: [] };
    const ev = [];
    const dmg = hitDmg(s) * CLICK_MULT * statMult(s, 'click');
    dealDamage(s, dmg, ev);
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
    const elapsed = Math.min((now - s.savedAt) / 1000, OFFLINE_CAP);
    if (!(elapsed >= OFFLINE_MIN)) return null;
    const before = { gold: s.gold, kills: s.totalKills, stage: s.stage, level: s.level };
    simulate(s, elapsed);
    s.dealt = 0;
    return {
      seconds: Math.floor(elapsed),
      gold: Math.floor(s.gold - before.gold),
      kills: s.totalKills - before.kills,
      stageFrom: before.stage,
      stageTo: s.stage,
      levelFrom: before.level,
      levelTo: s.level,
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
    s.cls = null;   // 직업은 초기화 (도감은 유지)
    s.adv = null;
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
    s.cls = typeof o.cls === 'string' && CLASSES[o.cls] ? o.cls : null;
    s.adv = s.cls && typeof o.adv === 'string' && ADVANCED[o.adv] && ADVANCED[o.adv].parent === s.cls ? o.adv : null;
    for (const k of Object.keys(ADVANCED)) if (o.mastered && o.mastered[k] === true) s.mastered[k] = true;
    if (s.adv) s.mastered[s.adv] = true;
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
    UPGRADES, UPGRADE_KEYS, CLASSES, ADVANCED, PROMO_LEVEL, MASTERY_BONUS, KILLS_PER_STAGE, DOWN_TIME, PRESTIGE_MIN_STAGE, OFFLINE_CAP,
    createState, tick, simulate, clickAttack, applyOffline,
    upgradeCost, canBuy, buy,
    prestigeGain, canPrestige, prestige,
    serialize, deserialize,
    maxHp, hitDmg, attacksPerSec, companionDps, totalDps, goldMult, expNeeded, tokenMult,
    monsterAtk, monsterGold, monsterInfo, biomeOf, isBossStage, lookId, classTitle,
    promoStage, promoOptions, promote, statMult, masteryMult,
    fmt, fmtTime,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
