// 무작위 행동 퍼저: 게임 로직(game.js)에 온갖 행동을 무작위 순서로 수만 번 시키고, 매번 규칙(불변식)이 지켜지는지 검사한다.
// 사용법: node tools/fuzz.js [판 수(기본 6)] [판당 행동 수(기본 1500)]  (기본값으로 약 1분)
// 검사: 숫자가 NaN/무한대/음수가 되지 않는다, 가방 한도, 장착 칸, 강화 단계 범위, 저장→복원 후 같은 상태.
const G = require('../game.js');
const St = require('../store.js');
const RUNS = +process.argv[2] || 6, STEPS = +process.argv[3] || 1500;
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const problems = new Map();
function report(kind, detail) { if (!problems.has(kind)) problems.set(kind, detail); }

function checkNums(obj, where, depth = 0) {
  if (depth > 5 || obj === null || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && !Number.isFinite(v)) report(`숫자가 NaN/무한대: ${where}.${k}`, v);
    else if (typeof v === 'object') checkNums(v, where + '.' + k, depth + 1);
  }
}
function invariants(s, step, last) {
  checkNums(s, 's');
  for (const k of ['gold', 'crystals', 'tokens', 'exp', 'level', 'stage', 'bestStage', 'runBest']) if (s[k] < 0) report(`${k}가 음수`, { step, last, v: s[k] });
  if (s.bestStage < s.runBest) report('bestStage < runBest', { step, last });
  if (s.bag.length > G.bagLimit(s)) report('가방 한도 초과', { step, last, n: s.bag.length, lim: G.bagLimit(s) });
  const ids = new Set();
  for (const it of [...s.bag, ...Object.values(s.equip || {}).filter(Boolean)]) {
    if (ids.has(it.id)) report('같은 장비 id가 두 군데', { step, last, id: it.id });
    ids.add(it.id);
    if ((it.enh || 0) < 0 || (it.enh || 0) > 15) report('강화 단계 범위 밖', { step, last, enh: it.enh });
  }
  for (const [slot, it] of Object.entries(s.equip || {})) if (it && it.slot !== slot) report('다른 칸 장비를 장착', { step, last, slot, it: it.slot });
  if (s.hp > G.maxHp(s) * 1.0001) report('체력이 최대 체력 초과', { step, last, hp: s.hp, max: G.maxHp(s) });
}
// 키 순서만 다른 것은 같은 것으로 본다
// 순간 값(공격 타이머·표시용 피해·타격 수·스킬 효과·쿨타임·쓰러짐·지속 피해)은 다시 켜면 초기화하는 설계이고, 장비의 enh 0은 없는 것과 같다
const TRANSIENT = new Set(['atkT', 'hits', 'dealt', 'buffs', 'skillCd', 'downT', 'rescueT', 'dot', 'hp']);   // hp: 쓰러진 채 저장하면 1로 되살려 복원한다
const canon = (v, top) => (Array.isArray(v) ? v.map((x) => canon(x)) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).filter((k) => !(top && TRANSIENT.has(k)) && !(k === 'enh' && !v[k])).sort().map((k) => [k, canon(v[k])])) : v);
function roundTrip(s, step, last) {
  const a = JSON.stringify(canon(JSON.parse(G.serialize(s, 1e12)), true));
  const back = G.deserialize(G.serialize(s, 1e12));
  if (!back) { report('저장한 데이터를 복원 못 함', { step, last }); return; }
  const b = JSON.stringify(canon(JSON.parse(G.serialize(back, 1e12)), true));
  if (a !== b) {
    const A = JSON.parse(a), B = JSON.parse(b);
    const diff = Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
    const k = diff[0];
    let before = A[k], after = B[k];
    if (Array.isArray(before)) { const i = before.findIndex((x, j) => JSON.stringify(x) !== JSON.stringify(after[j])); before = { i, len: A[k].length, v: before[i] }; after = { len: B[k].length, v: after[i] }; }
    report('저장→복원하면 값이 바뀜: ' + k, { step, last, key: k, before: JSON.stringify(before).slice(0, 400), after: JSON.stringify(after).slice(0, 400) });
  }
}

const PRODUCTS = [...St.BOXES, ...St.UTILITIES, ...(St.RELICS || []), ...(St.SLOT_DRAWS || []), St.RELIC_DRAW, St.STARTER].filter(Boolean).map((p) => p.id);
for (let run = 0; run < RUNS; run++) {
  const rnd = seeded(run + 1);
  G.setRandom(rnd);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const s = G.createState(0);
  let day = 0;
  const today = () => { const d = new Date(Date.UTC(2026, 8, 22 + day)); return d.toISOString().slice(0, 10); };
  const actions = {
    play: () => { G.simulate(s, 1 + rnd() * 30); },
    playLong: () => { G.simulate(s, 120 + rnd() * 600); },
    click: () => { for (let i = 0; i < 5; i++) G.clickAttack(s); },
    buy: () => { const k = pick(G.UPGRADE_KEYS); if (G.canBuy(s, k)) G.buy(s, k); },
    buyMany: () => { G.buyMany(s, pick(G.UPGRADE_KEYS), pick([1, 10, 999])); },
    promote: () => { const o = G.promoOptions(s); if (o && o.length) G.promote(s, pick(o).id || pick(o)); },
    prestige: () => { if (G.canPrestige(s) && rnd() < 0.3) G.prestige(s); },
    perk: () => { const id = pick(G.PERK_KEYS); if (G.canBuyPerk(s, id)) G.buyPerk(s, id); },
    respec: () => { if (rnd() < 0.05) G.respecPerks(s); },
    crystals: () => { G.creditCrystals(s, pick([10, 100, 1000]), 'fuzz'); },
    product: () => { G.buyProduct(s, pick(PRODUCTS)); },
    shop: () => { G.shopSync(s, 1e12 + day * 864e5, 1e12 + day * 864e5); G.buyShopItem(s, Math.floor(rnd() * 4)); },
    reroll: () => { G.rerollShop(s); },
    equip: () => { if (s.bag.length) G.equipItem(s, pick(s.bag).id); },
    unequip: () => { G.unequipItem(s, pick(['weapon', 'armor', 'accessory'])); },
    sell: () => { if (s.bag.length) G.sellBagItem(s, pick(s.bag).id); },
    sellUpTo: () => { G.sellBagUpTo(s, Math.floor(rnd() * 4)); },
    enhance: () => {
      const all = [...s.bag, ...Object.values(s.equip).filter(Boolean)];
      if (all.length < 2) return;
      const t = pick(all), mats = s.bag.filter((x) => x.slot === t.slot && x.id !== t.id);
      if (mats.length) { s.gold += G.enhCost(t) || 0; G.enhanceItem(s, t.id, pick(mats).id); }
    },
    relic: () => { const ids = Object.keys(s.relics || {}); if (ids.length) G.toggleRelic(s, pick(ids)); },
    ascend: () => { if (G.transcendReady(s)) G.ascend(s); },
    achieve: () => { G.claimAllAchievements(s); },
    newDay: () => { day += 1; },
    quest: () => { G.questSync(s, today()); const b = G.questBoard(s, today()); if (b) for (const p of Object.keys(b)) for (const q of (b[p].list || [])) G.claimQuest(s, p, q.id); },
    dungeon: () => { G.dungeonSync(s, today()); G.challengeDungeon(s, pick(G.DUNGEON_PERIODS), rnd() * 0.6, rnd() < 0.3); },
    ad: () => { G.claimAd(s, today()); },
    offline: () => { const now = 1e12 + day * 864e5; s.savedAt = now - rnd() * 864e5; G.applyOffline(s, now, now, 8 * 3600); },
    gm: () => { if (rnd() < 0.02) G.gmSetStage(s, Math.floor(rnd() * 200)); },
  };
  const names = Object.keys(actions);
  let last = '';
  for (let step = 0; step < STEPS; step++) {
    last = pick(names);
    try { actions[last](); } catch (e) { report(`예외: ${last}: ${e.message}`, { run, step, stack: e.stack.split('\n').slice(0, 3).join(' | ') }); }
    invariants(s, step, last);
    if (step % 50 === 0) roundTrip(s, step, last);
  }
  roundTrip(s, STEPS, last);
}
if (!problems.size) console.log(`${RUNS}판 × ${STEPS}행동: 문제 없음`);
else { console.log(`문제 ${problems.size}종류`); for (const [k, v] of problems) console.log('-', k, JSON.stringify(v)); process.exitCode = 1; }
