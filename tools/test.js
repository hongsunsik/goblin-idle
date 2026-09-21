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
