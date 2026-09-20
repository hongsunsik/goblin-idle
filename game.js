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

  // 고블린 진화 단계 (레벨 기준)
  const TIERS = [
    { level: 1,  name: '새끼 고블린',  scale: 1.0, extra: '' },
    { level: 5,  name: '고블린',       scale: 1.15, extra: '🪓' },
    { level: 10, name: '고블린 전사',  scale: 1.3, extra: '⚔️' },
    { level: 20, name: '고블린 대장',  scale: 1.45, extra: '🏴‍☠️' },
    { level: 35, name: '고블린 왕',    scale: 1.6, extra: '👑' },
  ];

  const MONSTERS = ['🐀', '🦇', '🐍', '🕷️', '🐺', '🐗', '🧟', '👻'];
  const BOSSES = ['🦂', '🐻', '🧌', '🐲', '👹', '💀'];

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
  const baseDmg = (s) => 3 + 1.5 * (s.level - 1);
  const maxHp = (s) => (50 + 12 * (s.level - 1)) * (1 + 0.25 * s.upgrades.armor);
  const hitDmg = (s) => baseDmg(s) * (1 + 0.25 * s.upgrades.weapon) * tokenMult(s);
  const attacksPerSec = (s) => 1 + 0.1 * s.upgrades.speed;
  const companionDps = (s) => s.upgrades.companion * hitDmg(s) * 0.35;
  const goldMult = (s) => (1 + 0.15 * s.upgrades.loot) * tokenMult(s);
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

  function monsterEmoji(stage) {
    if (isBossStage(stage)) return BOSSES[(stage / BOSS_EVERY - 1) % BOSSES.length];
    return MONSTERS[(stage - 1) % MONSTERS.length];
  }

  function tierOf(level) {
    let t = TIERS[0];
    for (const x of TIERS) if (level >= x.level) t = x;
    return t;
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
      const oldTier = tierOf(s.level).name;
      s.level += 1;
      s.hp += 12;   // 레벨업 시 늘어난 기본 체력만큼 회복
      ev.push({ type: 'levelup', level: s.level });
      const newTier = tierOf(s.level).name;
      if (newTier !== oldTier) ev.push({ type: 'evolve', name: newTier });
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
    s.hp = Math.min(max, s.hp + max * 0.02 * dt);   // 초당 최대 체력의 2% 회복
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
    const dmg = hitDmg(s) * CLICK_MULT;
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
    UPGRADES, UPGRADE_KEYS, TIERS, KILLS_PER_STAGE, DOWN_TIME, PRESTIGE_MIN_STAGE, OFFLINE_CAP,
    createState, tick, simulate, clickAttack, applyOffline,
    upgradeCost, canBuy, buy,
    prestigeGain, canPrestige, prestige,
    serialize, deserialize,
    maxHp, hitDmg, attacksPerSec, companionDps, totalDps, goldMult, expNeeded, tokenMult,
    monsterAtk, monsterGold, monsterEmoji, isBossStage, tierOf,
    fmt, fmtTime,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
