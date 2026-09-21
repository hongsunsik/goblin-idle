// 게임 로직 자체 점검: node tools/test.js  (화면·브라우저 없이 game.js만 검사한다)
const assert = require('assert');
const G = require('../game.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  통과  ' + name); }
  catch (e) { console.error('  실패  ' + name + '\n        ' + e.message); process.exitCode = 1; }
}

// 강화를 사면서 until(s)이 참이 될 때까지 진행시킨다
function play(s, until, maxSec = 4 * 3600) {
  for (let t = 0; t < maxSec && !until(s); t++) {
    G.simulate(s, 1);
    for (const k of G.UPGRADE_KEYS) G.buyMany(s, k, Infinity);
    G.checkAchievements(s);
  }
  return s;
}

console.log('업적');
test('새 게임은 달성한 업적이 없고 배율이 1이다', () => {
  const s = G.createState(0);
  assert.deepStrictEqual(s.achieved, {});
  assert.strictEqual(G.achieveMult(s), 1);
});

test('조건을 채우면 업적이 한 번만 달성된다', () => {
  const s = G.createState(0);
  s.totalKills = 100;
  const first = G.checkAchievements(s);
  assert.deepStrictEqual(first.map((e) => e.id), ['kill100']);
  assert.strictEqual(G.checkAchievements(s).length, 0, '이미 달성한 업적은 다시 알리지 않는다');
});

test('달성할 때마다 공격력과 골드가 +2%씩 늘어난다', () => {
  const s = G.createState(0);
  const dmg0 = G.hitDmg(s), gold0 = G.goldMult(s);
  s.achieved.kill100 = true; s.achieved.stage10 = true;
  assert.ok(Math.abs(G.hitDmg(s) / dmg0 - 1.04) < 1e-9);
  assert.ok(Math.abs(G.goldMult(s) / gold0 - 1.04) < 1e-9);
});

test('전투 중 처치 수 업적이 사건(achieve)으로 나온다', () => {
  const s = G.createState(0);
  s.totalKills = 99;
  const ev = G.simulate(s, 60);
  assert.ok(ev.some((e) => e.type === 'achieve' && e.id === 'kill100'));
});

test('환생해도 업적이 유지되고 첫 환생 업적이 달성된다', () => {
  const s = G.createState(0);
  s.achieved.kill100 = true;
  s.runBest = 12;
  assert.ok(G.prestige(s) > 0);
  const ids = G.checkAchievements(s).map((e) => e.id);
  assert.ok(s.achieved.kill100);
  assert.deepStrictEqual(ids, ['prestige1']);
});

test('저장하고 불러와도 업적이 그대로다', () => {
  const s = G.createState(0);
  s.achieved.kill100 = true; s.achieved.stage30 = true;
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.achieved, s.achieved);
});

test('없는 업적이나 잘못된 값이 든 저장 데이터는 걸러낸다', () => {
  const s = G.createState(0);
  const o = JSON.parse(G.serialize(s, 1));
  o.achieved = { kill100: true, hacked: true, stage10: 'yes', kill1000: 1 };
  const back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(back.achieved, { kill100: true });
});

test('업적 저장 항목이 없는 예전 저장 데이터도 불러온다', () => {
  const s = G.createState(0);
  const o = JSON.parse(G.serialize(s, 1));
  delete o.achieved;
  const back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(back.achieved, {});
});

test('업적 id는 서로 다르고 목표가 양수다', () => {
  const ids = G.ACHIEVEMENTS.map((a) => a.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(G.ACHIEVEMENTS.every((a) => a.goal > 0 && typeof a.val(G.createState(0)) === 'number'));
});

console.log('직업 도감');
test('2차 전직하면 도감에 기록이 생기고 처치 수와 최고 스테이지가 오른다', () => {
  const s = G.createState(0);
  s.level = 20; G.promote(s, 'mage'); G.promote(s, 'pyromancer');
  assert.strictEqual(G.dexRecord(s, 'pyromancer').runs, 1);
  s.monsterHp = 1; G.clickAttack(s);   // 몬스터 1마리 처치
  assert.strictEqual(G.dexRecord(s, 'pyromancer').kills, 1);
  s.stage = 21; s.killsInStage = 4; s.monsterHp = 1; G.clickAttack(s);   // 스테이지를 넘긴다
  assert.strictEqual(G.dexRecord(s, 'pyromancer').best, 22);
});

test('도감 등급은 최고 스테이지 20/35/50에서 오르고 직업 보너스를 늘린다', () => {
  const s = G.createState(0);
  s.mastered.knight = true;
  const base = G.masteryMult(s);
  assert.ok(Math.abs(base - (1 + G.MASTERY_BONUS)) < 1e-9);
  s.dex.knight = { best: 35, kills: 0, runs: 1 };
  assert.strictEqual(G.dexTier(s, 'knight'), 2);
  assert.ok(Math.abs(G.masteryMult(s) - (base + 2 * G.TIER_BONUS)) < 1e-9);
  s.dex.knight.best = 60;
  assert.strictEqual(G.dexTier(s, 'knight'), 3);
});

test('도감 기록은 환생해도 남고 저장·복원된다', () => {
  const s = G.createState(0);
  s.dex.knight = { best: 40, kills: 123, runs: 2 }; s.mastered.knight = true; s.runBest = 12;
  G.prestige(s);
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.dex.knight, { best: 40, kills: 123, runs: 2 });
});

test('도감 기록의 이상한 값은 범위 안으로 보정하고 없는 직업은 버린다', () => {
  const s = G.createState(0);
  const o = JSON.parse(G.serialize(s, 1));
  o.dex = { knight: { best: -5, kills: 'x', runs: 1e99 }, hacker: { best: 9, kills: 9, runs: 9 } };
  const back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(Object.keys(back.dex), ['knight']);
  assert.deepStrictEqual(back.dex.knight, { best: 0, kills: 0, runs: 99999 });
});

console.log('증표 상점');
const richState = (tokens) => { const s = G.createState(0); s.tokens = tokens; return s; };

test('증표가 모자라면 살 수 없고, 사면 가격이 레벨에 따라 오른다', () => {
  const s = richState(0);
  assert.strictEqual(G.buyPerk(s, 'might'), false);
  s.tokens = 10;
  assert.strictEqual(G.perkCost(s, 'might'), 1);
  G.buyPerk(s, 'might');
  assert.strictEqual(G.perkCost(s, 'might'), 2);
  assert.strictEqual(G.tokenBalance(s), 9);
  G.buyPerk(s, 'might');
  assert.strictEqual(G.tokenBalance(s), 7);   // 1 + 2개를 씀
});

test('먼저 올려야 하는 강화가 있으면 열리기 전에는 살 수 없다', () => {
  const s = richState(100);
  assert.strictEqual(G.canBuyPerk(s, 'click'), false);
  assert.deepStrictEqual(G.perkMissing(s, 'click'), [['might', 3]]);
  for (let i = 0; i < 3; i++) G.buyPerk(s, 'might');
  assert.strictEqual(G.canBuyPerk(s, 'click'), true);
});

test('최대 레벨에서는 더 살 수 없다', () => {
  const s = richState(10000);
  for (let i = 0; i < 20; i++) G.buyPerk(s, 'might');
  assert.strictEqual(G.perkLv(s, 'might'), G.PERKS.might.max);
});

test('증표를 써도 증표 보너스(공격력·골드)는 줄지 않는다', () => {
  const s = richState(10);
  const before = G.tokenMult(s);
  G.buyPerk(s, 'might'); G.buyPerk(s, 'greed');
  assert.strictEqual(G.tokenMult(s), before);
});

test('용사의 힘·탐욕·강철 체력이 각각 10%씩 능력치를 올린다', () => {
  const s = richState(50);
  const d = G.hitDmg(s), g = G.goldMult(s), h = G.maxHp(s);
  G.buyPerk(s, 'might'); G.buyPerk(s, 'greed'); G.buyPerk(s, 'vitality');
  assert.ok(Math.abs(G.hitDmg(s) / d - 1.1) < 1e-9);
  assert.ok(Math.abs(G.goldMult(s) / g - 1.1) < 1e-9);
  assert.ok(Math.abs(G.maxHp(s) / h - 1.1) < 1e-9);
});

test('강타는 직접 공격 피해를 25%씩 올린다', () => {
  const s = richState(100);
  for (let i = 0; i < 3; i++) G.buyPerk(s, 'might');
  s.monsterHp = s.monsterMax = 1e12;
  const a = G.clickAttack(s).dmg;
  G.buyPerk(s, 'click');
  const b = G.clickAttack(s).dmg;
  assert.ok(Math.abs(b / a - 1.25) < 1e-9);
});

test('빠른 출발은 환생 뒤 무기·갑옷을 높은 레벨로 시작하게 한다', () => {
  const s = richState(100);
  for (let i = 0; i < 5; i++) G.buyPerk(s, 'might');
  G.buyPerk(s, 'headstart'); G.buyPerk(s, 'headstart');
  s.runBest = 12;
  G.prestige(s);
  assert.strictEqual(s.upgrades.weapon, 2 * G.HEADSTART_LV);
  assert.strictEqual(s.upgrades.armor, 2 * G.HEADSTART_LV);
  assert.strictEqual(s.upgrades.speed, 0);
  assert.strictEqual(G.perkLv(s, 'headstart'), 2, '산 강화는 환생해도 남는다');
});

test('든든한 휴식은 오프라인 보상 한도를 1시간씩 늘린다', () => {
  const s = richState(100);
  for (let i = 0; i < 3; i++) G.buyPerk(s, 'greed');
  G.buyPerk(s, 'rest'); G.buyPerk(s, 'rest');
  assert.strictEqual(G.offlineCap(s), 10 * 3600);
  s.savedAt = 0;
  assert.strictEqual(G.applyOffline(s, 100 * 3600 * 1000).seconds, 10 * 3600);
});

test('초기화하면 쓴 증표를 모두 돌려받는다', () => {
  const s = richState(20);
  for (let i = 0; i < 4; i++) G.buyPerk(s, 'might');
  const spent = G.perkSpent(s);
  assert.strictEqual(G.respecPerks(s), spent);
  assert.strictEqual(G.tokenBalance(s), 20);
  assert.deepStrictEqual(s.perks, {});
});

test('산 강화는 저장·복원되고, 번 것보다 많이 쓴 조작 데이터는 되돌린다', () => {
  const s = richState(20);
  for (let i = 0; i < 3; i++) G.buyPerk(s, 'might');
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.perks, { might: 3 });
  const o = JSON.parse(G.serialize(s, 1));
  o.tokens = 1; o.perks = { might: 10, greed: 10 };
  assert.deepStrictEqual(G.deserialize(JSON.stringify(o)).perks, {});
});

test('없는 강화와 최대치를 넘는 레벨은 걸러낸다', () => {
  const o = JSON.parse(G.serialize(richState(1e6), 1));
  o.perks = { might: 999, cheat: 5, greed: -3 };
  assert.deepStrictEqual(G.deserialize(JSON.stringify(o)).perks, { might: G.PERKS.might.max });
});

console.log('장비');
// 결과가 매번 같도록 씨앗이 있는 난수를 쓴다
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mkItem = (o) => Object.assign({ id: 1, slot: 'weapon', kind: 'dmg', r: 0, ilvl: 1, val: 10, n: 0 }, o);

test('등급이 높을수록 나올 확률이 낮다 (일반 몬스터, 20만 번)', () => {
  G.setRandom(seeded(1));
  const s = G.createState(0), n = [0, 0, 0, 0, 0];
  for (let i = 0; i < 200000; i++) n[G.rollItem(s, 10, false).r] += 1;
  for (let r = 1; r < 5; r++) assert.ok(n[r] < n[r - 1], `등급 ${r}(${n[r]})이 등급 ${r - 1}(${n[r - 1]})보다 많다`);
  const pct = n.map((x) => (x / 2000));
  assert.ok(Math.abs(pct[0] - 62) < 1.5 && Math.abs(pct[4] - 0.5) < 0.3, pct.join(', '));
  G.setRandom();
});

test('보스는 노말이 안 나오고 상위 등급이 일반 몬스터보다 훨씬 잘 나온다', () => {
  G.setRandom(seeded(2));
  const s = G.createState(0), b = [0, 0, 0, 0, 0], m = [0, 0, 0, 0, 0];
  for (let i = 0; i < 100000; i++) { b[G.rollItem(s, 10, true).r] += 1; m[G.rollItem(s, 10, false).r] += 1; }
  assert.strictEqual(b[0], 0);
  assert.ok(b[4] > m[4] * 4 && b[3] > m[3] * 3, `보스 전설 ${b[4]} / 일반 ${m[4]}`);
  G.setRandom();
});

test('드롭 확률은 일반 8%·보스 50%이고 수집가가 레벨당 1.5%p씩 올린다', () => {
  const s = richState(100);
  assert.strictEqual(G.dropChance(s, false), 0.08);
  assert.strictEqual(G.dropChance(s, true), 0.5);
  G.buyPerk(s, 'greed'); G.buyPerk(s, 'greed'); G.buyPerk(s, 'luck'); G.buyPerk(s, 'luck');
  assert.ok(Math.abs(G.dropChance(s, false) - 0.11) < 1e-9);
});

test('실제로 몬스터를 잡았을 때 드롭 비율이 8% 근처다 (2만 마리)', () => {
  G.setRandom(seeded(3));
  const s = G.createState(0); s.autoSell = 4;   // 전부 자동 판매되게 해서 가방이 차지 않게 한다
  let drops = 0;
  for (let i = 0; i < 20000; i++) {
    s.stage = 1; s.killsInStage = 0; s.monsterHp = 1;
    drops += G.clickAttack(s).events.filter((e) => e.type === 'drop').length;
  }
  const rate = drops / 20000;
  assert.ok(Math.abs(rate - 0.08) < 0.01, `드롭률 ${(rate * 100).toFixed(2)}%`);
  G.setRandom();
});

test('같은 등급이어도 더 높은 스테이지에서 나온 장비의 수치가 더 크다', () => {
  G.setRandom(() => 0.5);   // 항상 중간값 → 수치 차이는 스테이지 때문만
  const s = G.createState(0);
  const lo = G.rollItem(s, 1, true), hi = G.rollItem(s, 79, true);
  assert.strictEqual(lo.r, hi.r);
  assert.ok(Math.abs(hi.val / lo.val - (1 + 79 / 40) / (1 + 1 / 40)) < 0.05, `${lo.val} → ${hi.val}`);
  G.setRandom();
});

test('장착한 장비가 무기·방어구·액세서리 종류대로 능력을 올린다', () => {
  const s = G.createState(0);
  const d = G.hitDmg(s), h = G.maxHp(s), g = G.goldMult(s), a = G.attacksPerSec(s);
  s.equip.weapon = mkItem({ slot: 'weapon', kind: 'dmg', val: 20 });
  s.equip.armor = mkItem({ id: 2, slot: 'armor', kind: 'hp', val: 30 });
  s.equip.accessory = mkItem({ id: 3, slot: 'accessory', kind: 'gold', val: 50 });
  assert.ok(Math.abs(G.hitDmg(s) / d - 1.2) < 1e-9);
  assert.ok(Math.abs(G.maxHp(s) / h - 1.3) < 1e-9);
  assert.ok(Math.abs(G.goldMult(s) / g - 1.5) < 1e-9);
  assert.strictEqual(G.attacksPerSec(s), a, '골드 액세서리는 공격 속도에 영향이 없다');
  s.equip.accessory = mkItem({ id: 3, slot: 'accessory', kind: 'aps', val: 10 });
  assert.ok(Math.abs(G.attacksPerSec(s) / a - 1.1) < 1e-9);
});

test('직접 공격·동료 액세서리도 각각 해당 능력만 올린다', () => {
  const s = G.createState(0); s.upgrades.companion = 5;
  s.monsterHp = s.monsterMax = 1e12;
  const click0 = G.clickAttack(s).dmg, comp0 = G.companionDps(s);
  s.equip.accessory = mkItem({ slot: 'accessory', kind: 'click', val: 40 });
  assert.ok(Math.abs(G.clickAttack(s).dmg / click0 - 1.4) < 1e-9);
  assert.strictEqual(G.companionDps(s), comp0);
  s.equip.accessory = mkItem({ slot: 'accessory', kind: 'comp', val: 40 });
  assert.ok(Math.abs(G.companionDps(s) / comp0 - 1.4) < 1e-9);
});

test('빈 칸이면 노말도 자동 장착하고, 더 좋은 장비가 나오면 바꾸며 밀려난 것은 가방으로 간다', () => {
  const s = G.createState(0); const ev = [];
  G.receiveItem(s, mkItem({ id: 1, val: 5 }), ev);
  assert.strictEqual(ev[0].action, 'equipped');
  assert.strictEqual(s.equip.weapon.id, 1);
  s.autoSell = -1;
  G.receiveItem(s, mkItem({ id: 2, val: 9, r: 2 }), ev);
  assert.strictEqual(s.equip.weapon.id, 2);
  assert.deepStrictEqual(s.bag.map((x) => x.id), [1]);
  G.receiveItem(s, mkItem({ id: 3, val: 7 }), ev);   // 더 나쁨 → 장착하지 않는다
  assert.strictEqual(s.equip.weapon.id, 2);
  assert.strictEqual(ev[2].action, 'bag');
});

test('종류가 다른 액세서리는 자동으로 갈아 끼우지 않는다', () => {
  const s = G.createState(0); s.autoSell = -1;
  s.equip.accessory = mkItem({ id: 1, slot: 'accessory', kind: 'gold', val: 5 });
  G.receiveItem(s, mkItem({ id: 2, slot: 'accessory', kind: 'aps', val: 50 }), []);
  assert.strictEqual(s.equip.accessory.id, 1);
  assert.strictEqual(s.bag.length, 1);
});

test('자동 장착을 끄면 빈 칸이어도 가방으로 간다', () => {
  const s = G.createState(0); s.autoEquip = false; s.autoSell = -1;
  G.receiveItem(s, mkItem({ id: 1 }), []);
  assert.strictEqual(s.equip.weapon, null);
  assert.strictEqual(s.bag.length, 1);
});

test('자동 판매 등급 이하는 얻자마자 팔려 골드가 되고, 그보다 높은 등급은 가방에 남는다', () => {
  const s = G.createState(0); s.autoSell = 1;   // 고급 이하
  s.equip.weapon = mkItem({ id: 9, val: 999 });    // 칸을 채워 자동 장착이 끼어들지 않게 한다
  const ev = [];
  G.receiveItem(s, mkItem({ id: 1, r: 1 }), ev);
  G.receiveItem(s, mkItem({ id: 2, r: 2 }), ev);
  assert.strictEqual(ev[0].action, 'sold');
  assert.ok(s.gold > 0);
  assert.strictEqual(ev[1].action, 'bag');
  assert.deepStrictEqual(s.bag.map((x) => x.id), [2]);
});

test('가방이 가득 차면 새 장비는 자동으로 팔린다', () => {
  const s = G.createState(0); s.autoSell = -1; s.equip.weapon = mkItem({ id: 999, val: 999 });
  for (let i = 1; i <= G.BAG_MAX; i++) s.bag.push(mkItem({ id: i, r: 2 }));
  const ev = [];
  G.receiveItem(s, mkItem({ id: 100, r: 3 }), ev);
  assert.strictEqual(ev[0].action, 'sold');
  assert.strictEqual(s.bag.length, G.BAG_MAX);
});

test('가방에서 장착하면 기존 장비가 가방으로 돌아가고, 해제·판매도 된다', () => {
  const s = G.createState(0);
  s.equip.weapon = mkItem({ id: 1 });
  s.bag.push(mkItem({ id: 2, val: 30 }), mkItem({ id: 3, slot: 'armor', kind: 'hp' }));
  assert.ok(G.equipItem(s, 2));
  assert.strictEqual(s.equip.weapon.id, 2);
  assert.deepStrictEqual(s.bag.map((x) => x.id).sort(), [1, 3]);
  assert.ok(G.unequipItem(s, 'weapon'));
  assert.strictEqual(s.equip.weapon, null);
  const gold0 = s.gold;
  assert.ok(G.sellBagItem(s, 3) > 0);
  assert.ok(s.gold > gold0);
  assert.strictEqual(G.sellBagItem(s, 3), -1, '이미 판 장비는 다시 팔 수 없다');
});

test('가방이 가득 차 있으면 장비를 해제할 수 없다', () => {
  const s = G.createState(0); s.equip.weapon = mkItem({ id: 1 });
  for (let i = 2; i < 2 + G.BAG_MAX; i++) s.bag.push(mkItem({ id: i }));
  assert.strictEqual(G.unequipItem(s, 'weapon'), false);
  assert.ok(s.equip.weapon);
});

test('일괄 판매는 지정한 등급 이하만 팔고 장착한 장비는 건드리지 않는다', () => {
  const s = G.createState(0); s.equip.weapon = mkItem({ id: 1, r: 0 });
  s.bag.push(mkItem({ id: 2, r: 0 }), mkItem({ id: 3, r: 1 }), mkItem({ id: 4, r: 2 }), mkItem({ id: 5, r: 4 }));
  const r = G.sellBagUpTo(s, 1);
  assert.strictEqual(r.n, 2);
  assert.deepStrictEqual(s.bag.map((x) => x.id), [4, 5]);
  assert.ok(s.equip.weapon);
  assert.strictEqual(s.gold, r.gold);
});

test('갑옷을 장착하면 늘어난 체력만큼 바로 회복한다', () => {
  const s = G.createState(0); s.hp = 10;
  s.bag.push(mkItem({ id: 1, slot: 'armor', kind: 'hp', val: 100 }));
  const max0 = G.maxHp(s);
  G.equipItem(s, 1);
  assert.ok(Math.abs(s.hp - (10 + max0)) < 1e-6);
});

test('장비와 설정은 환생해도 남고 저장·복원된다', () => {
  const s = G.createState(0); s.autoEquip = false; s.autoSell = 2;
  s.equip.armor = mkItem({ id: 4, slot: 'armor', kind: 'hp', r: 3, ilvl: 30, val: 40 });
  s.bag.push(mkItem({ id: 7, r: 2, ilvl: 12, val: 9.5 })); s.itemSeq = 7; s.runBest = 12;
  G.prestige(s);
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.equip.armor, s.equip.armor);
  assert.deepStrictEqual(back.bag, s.bag);
  assert.strictEqual(back.autoEquip, false);
  assert.strictEqual(back.autoSell, 2);
  assert.strictEqual(back.itemSeq, 7);
});

test('장비가 든 저장 데이터를 불러온 뒤 새로 얻는 장비 번호가 겹치지 않는다', () => {
  const s = G.createState(0); s.bag.push(mkItem({ id: 50 })); s.itemSeq = 0;
  const back = G.deserialize(G.serialize(s, 1));
  G.setRandom(seeded(5));
  assert.ok(G.rollItem(back, 5, false).id > 50);
  G.setRandom();
});

test('조작된 장비(없는 종류·등급, 과한 수치, 겹치는 번호, 넘치는 가방)는 걸러내거나 보정한다', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  const good = mkItem({ id: 1, r: 1, ilvl: 10, val: 8 });
  o.equip = { weapon: mkItem({ id: 2, r: 4, ilvl: 5, val: 99999 }), armor: { slot: 'constructor', kind: 'hp', r: 0 }, accessory: mkItem({ id: 3, slot: 'weapon' }) };
  o.bag = [good, good, mkItem({ id: 4, r: 9 }), mkItem({ id: 5, kind: '__proto__' }), 'x', null];
  for (let i = 10; i < 60; i++) o.bag.push(mkItem({ id: i }));
  const back = G.deserialize(JSON.stringify(o));
  assert.ok(back.equip.weapon.val <= 26 * (1 + 5 / 40) * 1.15 + 0.1, `수치 ${back.equip.weapon.val}`);
  assert.strictEqual(back.equip.armor, null);
  assert.strictEqual(back.equip.accessory, null, '무기를 액세서리 칸에 넣을 수 없다');
  assert.strictEqual(back.bag.filter((x) => x.id === 1).length, 1, '같은 번호는 한 번만');
  assert.ok(back.bag.every((x) => x.id !== 4 && x.id !== 5));
  assert.ok(back.bag.length <= G.BAG_MAX);
});

test("직업 이름이 'constructor' 같은 이상한 저장 데이터도 오류 없이 불러온다", () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  o.cls = 'constructor'; o.adv = '__proto__';
  const back = G.deserialize(JSON.stringify(o));
  assert.strictEqual(back.cls, null);
  assert.ok(Number.isFinite(G.hitDmg(back)));
});

test('장비가 없는 예전 저장 데이터도 불러온다 (자동 장착 켜짐, 노말 자동 판매)', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  delete o.equip; delete o.bag; delete o.itemSeq; delete o.autoEquip; delete o.autoSell;
  const back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(back.equip, { weapon: null, armor: null, accessory: null });
  assert.deepStrictEqual(back.bag, []);
  assert.strictEqual(back.autoEquip, true);
  assert.strictEqual(back.autoSell, 0);
});

test('오프라인 보상 결과에 얻은 장비 수와 최고 등급이 들어간다', () => {
  G.setRandom(seeded(7));
  const s = G.createState(0); s.savedAt = 0;
  const r = G.applyOffline(s, 3600 * 1000);
  assert.ok(r.drops > 0 && r.dropsSold <= r.drops && r.dropBest >= 0 && r.dropBest <= 4, JSON.stringify(r));
  G.setRandom();
});

console.log('그 밖의 로직');
test('도감 8종을 채우면 codex4·codex8 업적이 함께 달성된다', () => {
  const s = G.createState(0);
  for (const k of Object.keys(G.ADVANCED)) s.mastered[k] = true;
  const ids = G.checkAchievements(s).map((e) => e.id).sort();
  assert.deepStrictEqual(ids, ['codex4', 'codex8']);
});

test('20분 자동 플레이로 스테이지 30 이상에 도달한다 (진행 속도 회귀 방지)', () => {
  const s = G.createState(0);
  play(s, (x) => x.stage >= 30, 20 * 60);
  assert.ok(s.runBest >= 30, `스테이지 ${s.runBest}`);
});

test('오프라인 보상이 최대 8시간으로 제한된다', () => {
  const s = G.createState(0);
  const r = G.applyOffline(s, 100 * 3600 * 1000);
  assert.strictEqual(r.seconds, 8 * 3600);
});

console.log(`\n${passed}개 통과` + (process.exitCode ? ', 실패 있음' : ''));
