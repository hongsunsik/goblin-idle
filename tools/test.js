// 게임 로직 자체 점검: node tools/test.js  (화면·브라우저 없이 game.js만 검사한다)
const assert = require('assert');
const G = require('../game.js');

// 테스트는 등록한 순서대로 하나씩 실행한다 (비동기 테스트도 기다린다). 실행은 파일 끝에서 시작한다.
let passed = 0;
let queue = Promise.resolve();
const section = (title) => { queue = queue.then(() => console.log(title)); };
function test(name, fn) {
  queue = queue.then(async () => {
    try { await fn(); passed += 1; console.log('  통과  ' + name); }
    catch (e) { console.error('  실패  ' + name + '\n        ' + e.message); process.exitCode = 1; }
  });
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

section('업적');
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

section('직업 도감');
test('2차 전직하면 도감에 기록이 생기고 처치 수와 최고 스테이지가 오른다', () => {
  const s = G.createState(0);
  s.level = 20; G.promote(s, 'mage'); G.promote(s, 'pyromancer');
  assert.strictEqual(G.dexRecord(s, 'pyromancer').runs, 1);
  s.monsterHp = 1; G.clickAttack(s);   // 몬스터 1마리 처치
  assert.strictEqual(G.dexRecord(s, 'pyromancer').kills, 1);
  s.stage = 21; s.killsInStage = 4; s.monsterHp = 1; G.clickAttack(s);   // 스테이지를 넘긴다
  assert.strictEqual(G.dexRecord(s, 'pyromancer').best, 22);
});

test('도감 등급은 차수별 기준 스테이지에서 오르고 그 직업 보너스를 20%씩 늘린다', () => {
  const s = G.createState(0);
  s.mastered.knight = true;                                  // 2차: 기본 +5%
  const base = G.masteryMult(s);
  assert.ok(Math.abs(base - 1.05) < 1e-9);
  s.dex.knight = { best: 35, kills: 0, runs: 1 };            // 은 = 메달 2개 → 기본값의 +40%
  assert.strictEqual(G.dexTier(s, 'knight'), 2);
  assert.ok(Math.abs(G.masteryMult(s) - (1 + 0.05 * 1.4)) < 1e-9);
  s.dex.knight.best = 60;
  assert.strictEqual(G.dexTier(s, 'knight'), 3);
  // 같은 스테이지여도 3·4차는 기준이 높다 (3차: 30/45/60, 4차: 40/55/70)
  s.dex.paladin = { best: 44, kills: 0, runs: 1 }; s.dex.seraph = { best: 44, kills: 0, runs: 1 };
  assert.strictEqual(G.dexTier(s, 'paladin'), 1);
  assert.strictEqual(G.dexTier(s, 'seraph'), 1);
  s.dex.paladin.best = 45; s.dex.seraph.best = 39;
  assert.strictEqual(G.dexTier(s, 'paladin'), 2);
  assert.strictEqual(G.dexTier(s, 'seraph'), 0);
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

section('3차·4차 전직');
// 봇처럼 필요한 레벨까지 올려서 지정한 경로를 끝까지 전직시킨다
const walkPath = (s, ids) => { for (const id of ids) { s.level = Math.max(s.level, G.PROMO_LEVEL[G.promoStage(s) || 'adv4']); if (!G.promote(s, id)) return false; } return true; };

test('직업 트리가 온전하다 (1~3차는 갈래 2개, 4차는 끝, 모든 노드에 부모)', () => {
  assert.strictEqual(Object.keys(G.ADVANCED3).length, 16);
  assert.strictEqual(Object.keys(G.ADVANCED4).length, 32);
  for (const id of Object.keys(G.CLASSES)) assert.strictEqual(G.childrenOf(id).length, 2, id);
  for (const id of [...Object.keys(G.ADVANCED), ...Object.keys(G.ADVANCED3)]) assert.strictEqual(G.childrenOf(id).length, 2, id);
  for (const id of Object.keys(G.ADVANCED4)) assert.strictEqual(G.childrenOf(id).length, 0, id);
  for (const id of G.ADV_IDS) { assert.ok(G.classTier(G.parentOf(id)) === G.classTier(id) - 1, id); }
  const names = G.ADV_IDS.map((id) => G.classTier(id) === 2 ? G.ADVANCED[id].name : G.classTier(id) === 3 ? G.ADVANCED3[id].name : G.ADVANCED4[id].name);
  assert.strictEqual(new Set(names).size, names.length, '직업 이름이 겹친다');
});

test('모든 3·4차 직업에 설명과 능력치 배율이 있다', () => {
  for (const id of [...Object.keys(G.ADVANCED3), ...Object.keys(G.ADVANCED4)]) {
    const n = G.ADVANCED3[id] || G.ADVANCED4[id];
    assert.ok(n.name && n.desc && n.desc.length > 8, id);
    assert.ok(Object.keys(n.mult).length >= 1 && Object.values(n.mult).every((v) => v > 0 && v <= 2.5), id + ' ' + JSON.stringify(n.mult));
  }
});

test('레벨 30·40이 되면 3차·4차 전직이 열리고 알림 사건이 나온다', () => {
  const s = G.createState(0);
  walkPath(s, ['warrior', 'knight']);
  s.level = 29; assert.strictEqual(G.promoStage(s), null);
  s.level = 30; assert.strictEqual(G.promoStage(s), 'adv3');
  assert.deepStrictEqual(G.promoOptions(s).sort(), ['crusader', 'paladin']);
  s.level = 29; s.exp = G.expNeeded(s) - 1; s.monsterHp = 1; s.hp = 1e9;
  const ev = G.clickAttack(s).events;   // 몬스터를 잡아 레벨 30이 되게 한다
  assert.ok(ev.some((e) => e.type === 'promoReady' && e.stage === 'adv3'), JSON.stringify(ev.map((e) => e.type)));
});

test('4차까지 순서대로 전직하고, 자식이 아닌 직업이나 건너뛰기는 거절한다', () => {
  const s = G.createState(0);
  assert.ok(walkPath(s, ['warrior', 'knight', 'paladin', 'seraph']));
  assert.deepStrictEqual(G.classPath(s), ['warrior', 'knight', 'paladin', 'seraph']);
  assert.strictEqual(G.lookId(s), 'seraph');
  assert.strictEqual(G.classTitle(s), '세라핌 기사');
  assert.strictEqual(G.promoStage(s), null);
  const t = G.createState(0); t.level = 30;
  G.promote(t, 'warrior'); G.promote(t, 'knight');
  assert.strictEqual(G.promote(t, 'lich'), false, '다른 갈래');
  assert.strictEqual(G.promote(t, 'seraph'), false, '3차를 건너뛰고 4차');
  assert.strictEqual(G.promote(t, 'knight'), false, '이미 고른 단계');
});

test('3차·4차 직업의 배율이 이전 단계 배율에 모두 곱해진다', () => {
  const s = G.createState(0);
  walkPath(s, ['mage', 'pyromancer', 'infernomage', 'flameemperor']);
  const expectDmg = 1.35 * 1.5 * 1.35 * 1.6, expectClick = 2 * 1.5 * 1.5;
  assert.ok(Math.abs(G.statMult(s, 'dmg') - expectDmg) < 1e-9, G.statMult(s, 'dmg') + ' vs ' + expectDmg);
  assert.ok(Math.abs(G.statMult(s, 'click') - expectClick) < 1e-9);
  assert.ok(Math.abs(G.statMult(s, 'hp') - 0.85) < 1e-9);
});

test('전직한 2·3·4차 직업이 모두 도감에 등록되고 기록이 쌓인다', () => {
  const s = G.createState(0);
  walkPath(s, ['rogue', 'pirate', 'captain', 'seaking']);
  for (const id of ['pirate', 'captain', 'seaking']) { assert.ok(s.mastered[id], id); assert.strictEqual(G.dexRecord(s, id).runs, 1); }
  assert.ok(!s.mastered.rogue, '1차는 도감 대상이 아니다');
  s.stage = 41; s.killsInStage = 4; s.monsterHp = 1; G.clickAttack(s);
  for (const id of ['pirate', 'captain', 'seaking']) { assert.ok(G.dexRecord(s, id).kills >= 1 && G.dexRecord(s, id).best === 42, id); }
});

test('직업 보너스는 차수가 높을수록 하나당 작다 (2차 5% > 3차 1.5% > 4차 0.5%)', () => {
  const s = G.createState(0);
  assert.ok(Math.abs(G.masteryOf({ dex: {}, mastered: {} }, 'knight') - 0.05) < 1e-9);
  assert.ok(Math.abs(G.masteryOf({ dex: {} }, 'paladin') - 0.015) < 1e-9);
  assert.ok(Math.abs(G.masteryOf({ dex: {} }, 'seraph') - 0.005) < 1e-9);
  for (const id of G.ADV_IDS) s.mastered[id] = true;
  assert.ok(G.masteryMult(s) < 2.0, '전부 채워도 배율이 폭주하지 않는다: ' + G.masteryMult(s));
});

test('환생하면 직업 경로가 모두 초기화되고 도감은 남는다', () => {
  const s = G.createState(0);
  walkPath(s, ['archer', 'ranger', 'beastmaster', 'wolfking']);
  s.runBest = 12;
  G.prestige(s);
  assert.deepStrictEqual(G.classPath(s), []);
  assert.strictEqual(G.lookId(s), 'novice');
  assert.ok(s.mastered.wolfking && s.mastered.beastmaster);
});

test('3·4차 직업이 든 저장 데이터를 저장·복원할 수 있다', () => {
  const s = G.createState(0);
  walkPath(s, ['mage', 'necromancer', 'lich', 'lichking']);
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(G.classPath(back), ['mage', 'necromancer', 'lich', 'lichking']);
  assert.deepStrictEqual(back.mastered, s.mastered);
});

test('이어지지 않는 직업 경로나 이상한 이름은 저장 데이터에서 걸러낸다', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  o.cls = 'warrior'; o.adv = 'knight'; o.adv3 = 'lich'; o.adv4 = 'seraph';   // 3차가 knight의 자식이 아니면 그 뒤도 무효
  let back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(G.classPath(back), ['warrior', 'knight']);
  o.adv3 = 'paladin'; o.adv4 = 'lichking';                                    // 4차가 paladin의 자식이 아님
  back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(G.classPath(back), ['warrior', 'knight', 'paladin']);
  o.adv3 = 'constructor'; o.adv4 = '__proto__';
  back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(G.classPath(back), ['warrior', 'knight']);
  assert.ok(Number.isFinite(G.hitDmg(back)));
  o.cls = null; o.adv = 'knight'; o.adv3 = 'paladin';                        // 1차가 없으면 이후도 무효
  assert.deepStrictEqual(G.classPath(G.deserialize(JSON.stringify(o))), []);
});

test('3·4차 업적: 3차 전직, 4차 전직, 4차 직업 8종', () => {
  const s = G.createState(0);
  assert.ok(!G.checkAchievements(s).some((e) => ['tier3', 'tier4', 'elite8'].includes(e.id)));
  s.mastered.paladin = true;
  assert.deepStrictEqual(G.checkAchievements(s).map((e) => e.id), ['tier3']);
  s.mastered.seraph = true;
  assert.deepStrictEqual(G.checkAchievements(s).map((e) => e.id), ['tier4']);
  for (const id of Object.keys(G.ADVANCED4).slice(0, 8)) s.mastered[id] = true;
  assert.deepStrictEqual(G.checkAchievements(s).map((e) => e.id), ['elite8']);
});

section('증표 상점');
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

section('장비');
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

test('고른 장비만 한꺼번에 팔고, 없는 번호는 무시하며, 골드는 합계만큼 늘어난다', () => {
  const s = G.createState(0);
  s.bag.push(mkItem({ id: 1, r: 0 }), mkItem({ id: 2, r: 1 }), mkItem({ id: 3, r: 2 }), mkItem({ id: 4, r: 3 }));
  const expected = G.sellValue(s.bag[0]) + G.sellValue(s.bag[2]);
  const r = G.sellBagItems(s, [1, 3, 999]);
  assert.deepStrictEqual([r.n, r.gold], [2, expected]);
  assert.strictEqual(s.gold, expected);
  assert.deepStrictEqual(s.bag.map((x) => x.id), [2, 4]);
  assert.deepStrictEqual(G.sellBagItems(s, []), { n: 0, gold: 0 });
});

test('지금 낀 장비보다 약한 가방 장비를 찾는다 (같은 칸·같은 능력만 비교)', () => {
  const s = G.createState(0);
  s.equip.weapon = mkItem({ id: 1, kind: 'dmg', val: 20 });
  s.equip.accessory = mkItem({ id: 2, slot: 'accessory', kind: 'gold', val: 10 });
  s.bag.push(
    mkItem({ id: 10, kind: 'dmg', val: 20 }),                                  // 같은 수치 → 약한 것으로 본다
    mkItem({ id: 11, kind: 'dmg', val: 25 }),                                  // 더 강함 → 남긴다
    mkItem({ id: 12, slot: 'accessory', kind: 'gold', val: 4 }),               // 약함
    mkItem({ id: 13, slot: 'accessory', kind: 'aps', val: 1 }),                // 다른 능력 → 비교 불가라 남긴다
    mkItem({ id: 14, slot: 'armor', kind: 'hp', val: 1 }),                     // 방어구 칸이 비어 있음 → 남긴다
  );
  assert.deepStrictEqual(G.bagWeaker(s).map((x) => x.id), [10, 12]);
  assert.strictEqual(G.isWeaker(s, s.bag[1]), false);
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

section('클라우드 저장 (판단 로직)');
const Sync = require('../sync.js');
const Cloud = require('../cloud.js');
const CloudFirebase = require('../cloud-firebase.js');

const sum = (o) => Object.assign({ v: 1, level: 10, bestStage: 12, prestiges: 0, tokens: 0, kills: 100, look: 'novice', savedAt: 1000 }, o);

test('클라우드에 저장이 없으면: 진행이 있으면 올리고, 새 게임이면 할 일이 없다', () => {
  assert.strictEqual(Sync.decide(sum(), null, null).action, 'upload');
  assert.strictEqual(Sync.decide(sum({ kills: 0, bestStage: 1, level: 1 }), null, null).action, 'same');
});

test('이 기기가 새 게임이면 클라우드 저장을 내려받는다', () => {
  assert.strictEqual(Sync.decide(sum({ kills: 0, bestStage: 1, level: 1 }), sum({ rev: 3 }), null).action, 'download');
});

test('마지막 동기화 이후 클라우드는 그대로이고 이 기기만 바뀌었으면 조용히 올린다', () => {
  const base = { rev: 4, sig: Sync.sigOf(sum({ kills: 100 })) };
  assert.strictEqual(Sync.decide(sum({ kills: 250 }), sum({ kills: 100, rev: 4 }), base).action, 'upload');
  assert.strictEqual(Sync.decide(sum({ kills: 100 }), sum({ kills: 100, rev: 4 }), base).action, 'same');
});

test('이 기기는 그대로이고 다른 기기에서 클라우드가 앞서 갔으면 조용히 내려받는다', () => {
  const base = { rev: 4, sig: Sync.sigOf(sum({ kills: 100 })) };
  assert.strictEqual(Sync.decide(sum({ kills: 100 }), sum({ kills: 900, rev: 6 }), base).action, 'download');
});

test('양쪽이 다 바뀌었으면 사용자에게 묻고, 더 앞선 쪽을 추천한다 (환생 > 증표 > 최고 스테이지)', () => {
  const base = { rev: 4, sig: Sync.sigOf(sum({ kills: 100 })) };
  const d1 = Sync.decide(sum({ kills: 300, prestiges: 1 }), sum({ kills: 500, bestStage: 40, rev: 6 }), base);
  assert.deepStrictEqual([d1.action, d1.recommend], ['ask', 'local']);   // 환생 횟수가 더 큰 쪽이 앞선 진행
  const d2 = Sync.decide(sum({ kills: 300, bestStage: 20 }), sum({ kills: 500, bestStage: 40, rev: 6 }), base);
  assert.deepStrictEqual([d2.action, d2.recommend], ['ask', 'cloud']);
});

test('동기화 기록이 없고 양쪽이 다르면 묻는다. 진행이 똑같으면 할 일이 없다', () => {
  assert.strictEqual(Sync.decide(sum({ kills: 300 }), sum({ kills: 500, rev: 2 }), null).action, 'ask');
  assert.strictEqual(Sync.decide(sum({ kills: 300 }), sum({ kills: 300, savedAt: 5, rev: 2 }), null).action, 'same');
});

test('요약은 저장 시각이 아니라 진행 값으로만 비교한다', () => {
  assert.strictEqual(Sync.sigOf(sum({ savedAt: 1 })), Sync.sigOf(sum({ savedAt: 999999 })));
  const s = G.createState(5); s.totalKills = 7; s.tokens = 3;
  const u = Sync.summaryOf(s, 'knight');
  assert.deepStrictEqual([u.kills, u.tokens, u.look, u.savedAt], [7, 3, 'knight', 5]);
  assert.ok(Sync.isFresh(Sync.summaryOf(G.createState(0), 'novice')));
});

section('클라우드 저장 (클라이언트 흐름, 가짜 서버)');
// 여러 기기가 같은 서버를 쓰는 상황을 흉내 낸다
function fakeServer() { return { docs: {}, writes: 0 }; }
function fakeAdapter(server, uid) {
  let authCb = null;
  const a = {
    log: [],
    onAuth(cb) { authCb = cb; return () => { authCb = null; }; },
    login(u) { authCb && authCb(u === null ? null : { uid, name: '테스터', email: 't@example.com', photo: '', provider: 'google.com' }); },
    async signIn(p) { a.log.push('signIn:' + p); a.login(); },
    async signOut() { a.log.push('signOut'); a.login(null); },
    async read() { a.log.push('read'); return server.docs[uid] ? JSON.parse(JSON.stringify(server.docs[uid])) : null; },
    async write({ save, summary, expectedRev }) {
      a.log.push('write:' + expectedRev);
      const cur = server.docs[uid] ? server.docs[uid].rev : 0;
      if (cur !== expectedRev) return { conflict: true, remote: JSON.parse(JSON.stringify(server.docs[uid])) };
      server.docs[uid] = { save, summary, rev: cur + 1, updatedAt: Date.now() };
      server.writes += 1;
      return { ok: true, rev: cur + 1 };
    },
  };
  return a;
}
// 기기 하나: 게임 상태(state)와 기기 저장소를 가진다
function makeDevice(server, uid, mutate) {
  const dev = { state: G.createState(1000), applied: [], asked: [], choice: 'cloud', mem: {}, changes: [] };
  if (mutate) mutate(dev.state);
  dev.adapter = fakeAdapter(server, uid);
  dev.cloud = Cloud.createCloud(dev.adapter, {
    getLocal: () => ({ text: G.serialize(dev.state, 2000), summary: Sync.summaryOf(dev.state, G.lookId(dev.state)) }),
    applySave: (text) => { const n = G.deserialize(text); if (!n) return false; dev.state = n; dev.applied.push(text); return true; },
    askConflict: async (info) => { dev.asked.push(info); return dev.choice; },
    storage: { get: (k) => (k in dev.mem ? dev.mem[k] : null), set: (k, v) => { dev.mem[k] = v; }, remove: (k) => { delete dev.mem[k]; } },
    onChange: (st) => dev.changes.push(st.status),
  });
  return dev;
}
const played = (kills, stage, extra) => (s) => { s.totalKills = kills; s.bestStage = s.runBest = s.stage = stage; s.level = 5 + Math.floor(kills / 50); Object.assign(s, extra || {}); };
const login = async (dev) => { dev.cloud.start(); dev.adapter.login(); await dev.cloud.sync(); };

test('첫 로그인: 이 기기의 진행을 클라우드에 올린다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  assert.strictEqual(server.docs.u1.rev, 1);
  assert.strictEqual(server.docs.u1.summary.kills, 300);
  assert.ok(JSON.parse(server.docs.u1.save).totalKills === 300);
  assert.strictEqual(a.cloud.state().status, 'ok');
  assert.strictEqual(a.cloud.state().rev, 1);
});

test('새 기기에서 로그인하면 클라우드 저장을 내려받아 이어서 한다', async () => {
  const server = fakeServer();
  await login(makeDevice(server, 'u1', played(300, 20)));
  const b = makeDevice(server, 'u1');   // 새 게임
  await login(b);
  assert.strictEqual(b.state.totalKills, 300);
  assert.strictEqual(b.applied.length, 1);
  assert.strictEqual(b.asked.length, 0, '묻지 않고 바로 이어 받는다');
});

test('같은 기기에서 로그아웃 후 다시 로그인하면 묻지 않고 바뀐 만큼만 올린다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  await a.cloud.signOut();
  played(450, 24)(a.state);
  a.adapter.log.length = 0;
  a.adapter.login();
  await a.cloud.sync();
  assert.strictEqual(a.asked.length, 0);
  assert.strictEqual(server.docs.u1.rev, 2);
  assert.strictEqual(server.docs.u1.summary.kills, 450);
});

test('바뀐 게 없으면 자동 저장이 서버에 쓰지 않고, 바뀌면 쓴다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  const w0 = server.writes;
  assert.strictEqual((await a.cloud.push()).action, 'unchanged');
  assert.strictEqual((await a.cloud.push()).action, 'unchanged');
  assert.strictEqual(server.writes, w0);
  played(320, 21)(a.state);
  assert.strictEqual((await a.cloud.push()).action, 'upload');
  assert.strictEqual(server.writes, w0 + 1);
});

test('다른 기기에서 진행한 뒤 이 기기는 그대로면 조용히 내려받는다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20)), b = makeDevice(server, 'u1');
  await login(a); await login(b);                   // b는 새 게임 → 내려받음
  played(900, 30)(b.state); b.cloud.state().rev;    // b가 더 진행
  await b.cloud.push();
  await a.cloud.sync();                             // a는 300 그대로, 클라우드는 900
  assert.strictEqual(a.state.totalKills, 900);
  assert.strictEqual(a.asked.length, 0);
});

test('양쪽 진행이 다르면 묻고, 클라우드를 고르면 이 기기가 클라우드 저장으로 바뀐다', async () => {
  const server = fakeServer();
  await login(makeDevice(server, 'u1', played(900, 30)));
  const b = makeDevice(server, 'u1', played(300, 20)); b.choice = 'cloud';
  await login(b);
  assert.strictEqual(b.asked.length, 1);
  assert.ok(b.asked[0].recommend === 'cloud' && b.asked[0].local.kills === 300 && b.asked[0].remote.kills === 900);
  assert.strictEqual(b.state.totalKills, 900);
});

test('양쪽 진행이 다를 때 이 기기를 고르면 클라우드를 덮어쓴다', async () => {
  const server = fakeServer();
  await login(makeDevice(server, 'u1', played(900, 30)));
  const b = makeDevice(server, 'u1', played(300, 20)); b.choice = 'local';
  await login(b);
  assert.strictEqual(server.docs.u1.summary.kills, 300);
  assert.strictEqual(server.docs.u1.rev, 2);
  assert.strictEqual(b.state.totalKills, 300);
});

test('선택 창을 취소하면 어느 쪽도 바꾸지 않는다', async () => {
  const server = fakeServer();
  await login(makeDevice(server, 'u1', played(900, 30)));
  const b = makeDevice(server, 'u1', played(300, 20)); b.choice = null;
  await login(b);
  assert.strictEqual(server.docs.u1.summary.kills, 900);
  assert.strictEqual(b.state.totalKills, 300);
  assert.strictEqual(b.cloud.state().status, 'ok');
});

test('저장하는 사이 다른 기기가 먼저 올렸다면 덮어쓰지 않고 사용자에게 묻는다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20)), b = makeDevice(server, 'u1');
  await login(a); await login(b);
  played(500, 25)(a.state);                          // a가 진행
  played(700, 28)(b.state); await b.cloud.push();    // b가 먼저 저장 (rev 2)
  a.choice = 'cloud';
  await a.cloud.push();                              // a의 push는 rev 1을 기준으로 시도 → 충돌
  assert.strictEqual(a.asked.length, 1, '충돌을 알려야 한다');
  assert.strictEqual(server.docs.u1.summary.kills, 700, '묻기 전에는 서버가 바뀌지 않는다');
  assert.strictEqual(a.state.totalKills, 700);
});

test('자동 저장은 연달아 예약해도 마지막 한 번만 올린다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  played(310, 21)(a.state);   // 진행이 바뀌어야 올린다
  const before = server.writes;
  a.cloud.schedulePush(15); a.cloud.schedulePush(15); a.cloud.schedulePush(15);
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(server.writes, before + 1);
});

test('로그아웃하면 마지막 진행을 올린 뒤 로그인 상태가 풀린다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  played(360, 21)(a.state);
  await a.cloud.signOut();
  assert.strictEqual(server.docs.u1.summary.kills, 360);
  assert.strictEqual(a.cloud.state().user, null);
  assert.strictEqual(a.cloud.state().status, 'signedout');
});

test('서버 오류가 나도 게임은 멈추지 않고 오류 상태와 안내 문구만 남긴다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  a.adapter.read = async () => { throw Object.assign(new Error('boom'), { code: 'unavailable' }); };
  await login(a);
  assert.strictEqual(a.cloud.state().status, 'error');
  assert.ok(a.cloud.state().error.includes('인터넷'));
  assert.strictEqual(a.state.totalKills, 300);
});

test('동기화를 동시에 여러 번 불러도 한 번만 실행한다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  a.cloud.start(); a.adapter.login();
  await Promise.all([a.cloud.sync(), a.cloud.sync(), a.cloud.sync()]);
  assert.strictEqual(a.adapter.log.filter((x) => x === 'read').length, 1);
});

test('계정이 바뀌면 이전 계정의 동기화 기록을 쓰지 않는다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  a.adapter = null;
  const other = makeDevice(server, 'u2', played(50, 6)); other.mem = a.mem;   // 같은 기기(저장소), 다른 계정
  await login(other);
  assert.strictEqual(server.docs.u2.rev, 1, '다른 계정이므로 새로 올린다');
  assert.strictEqual(other.asked.length, 0);
});

test('망가진 동기화 기록이 있어도 오류 없이 처음부터 판단한다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  a.mem[Cloud.BASE_KEY] = '{not json';
  await login(a);
  assert.strictEqual(server.docs.u1.rev, 1);
});

test('오류 문구: 창을 스스로 닫은 것은 알리지 않고 주소·설정 문제는 안내한다', () => {
  assert.strictEqual(Cloud.friendlyError({ code: 'auth/popup-closed-by-user' }), '');
  assert.ok(Cloud.friendlyError({ code: 'auth/popup-blocked' }).includes('팝업'));
  assert.ok(Cloud.friendlyError({ code: 'auth/unauthorized-domain' }).includes('FIREBASE-SETUP'));
  assert.ok(Cloud.friendlyError({ code: 'auth/operation-not-allowed' }).includes('켜져'));
  assert.ok(Cloud.friendlyError({ code: 'auth/configuration-not-found' }).includes('시작하기'));
  assert.ok(Cloud.friendlyError({ code: 'permission-denied' }).includes('규칙'));
  assert.ok(Cloud.friendlyError(new Error('뭔가 잘못됨')).includes('뭔가'));
});

test('로그인 실패 문구는 다음 시도에서 지워진다 (창을 스스로 닫은 경우 포함)', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  a.cloud.start();
  a.adapter.signIn = async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-blocked' }); };
  await a.cloud.signIn('apple');
  assert.ok(a.cloud.state().error.includes('팝업'));
  a.adapter.signIn = async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }); };
  await a.cloud.signIn('apple');
  assert.strictEqual(a.cloud.state().error, '');
});

test('설정이 없으면(어댑터 없음) 클라우드 기능은 꺼진 상태로 아무것도 하지 않는다', async () => {
  const c = Cloud.createCloud(null, { getLocal: () => { throw new Error('부르면 안 됨'); }, storage: {} });
  c.start();
  assert.strictEqual(c.state().status, 'off');
  assert.strictEqual(c.state().configured, false);
  assert.deepStrictEqual(await c.signIn('google'), { ok: false });
});

section('클라우드 저장 (Firebase 어댑터, 가짜 SDK)');
// Firebase SDK의 필요한 부분만 흉내 낸다: 어댑터가 SDK를 올바른 모양으로 부르는지 확인한다
function stubSdk() {
  const calls = [];
  const store = {};
  let authCb = null;
  const auth = { currentUser: null };
  class GoogleAuthProvider { constructor() { this.id = 'google.com'; this.params = null; calls.push('new Google'); } setCustomParameters(p) { this.params = p; calls.push('params:' + JSON.stringify(p)); } }
  class OAuthProvider { constructor(id) { this.id = id; this.scopes = []; calls.push('new OAuth:' + id); } addScope(s) { this.scopes.push(s); } }
  const user = { uid: 'abc', displayName: '홍길동', email: 'a@b.c', photoURL: 'http://p', providerData: [{ providerId: 'google.com' }] };
  const sdk = {
    calls, store, auth,
    app: { initializeApp: (cfg) => { calls.push('init:' + cfg.projectId); return { cfg }; } },
    auth: {
      getAuth: () => auth, GoogleAuthProvider, OAuthProvider,
      getRedirectResult: async () => null,
      onAuthStateChanged: (a, cb) => { authCb = cb; return () => { authCb = null; calls.push('unsubscribed'); }; },
      signInWithPopup: async (a, p) => { calls.push('popup:' + p.id); auth.currentUser = user; authCb && authCb(user); },
      signInWithRedirect: async (a, p) => { calls.push('redirect:' + p.id); },
      signOut: async () => { calls.push('signOut'); auth.currentUser = null; authCb && authCb(null); },
    },
    firestore: {
      getFirestore: () => ({}),
      doc: (db, col, id) => ({ path: col + '/' + id }),
      getDoc: async (ref) => ({ exists: () => ref.path in store, data: () => store[ref.path] }),
      serverTimestamp: () => ({ toMillis: () => 12345 }),
      runTransaction: async (db, fn) => fn({
        get: async (ref) => ({ exists: () => ref.path in store, data: () => store[ref.path] }),
        set: (ref, data) => { store[ref.path] = data; },
      }),
    },
    setPopupError(code) { sdk.auth.signInWithPopup = async () => { throw Object.assign(new Error(code), { code }); }; },
    loginNow() { auth.currentUser = user; },
  };
  return sdk;
}
const CFG = { projectId: 'demo', apiKey: 'k' };

test('로그인 상태 변화를 사용자 정보(이름·이메일·제공자)로 바꿔 알려 준다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  const seen = [];
  ad.onAuth((u) => seen.push(u));
  await new Promise((r) => setTimeout(r, 10));
  await ad.signIn('google');
  assert.deepStrictEqual(seen[seen.length - 1], { uid: 'abc', name: '홍길동', email: 'a@b.c', photo: 'http://p', provider: 'google.com' });
  assert.ok(sdk.calls.includes('init:demo'));
});

test('Google은 팝업으로, Apple은 apple.com 제공자에 이메일·이름 권한을 붙여 로그인한다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  await ad.signIn('google');
  await ad.signIn('apple');
  assert.ok(sdk.calls.includes('popup:google.com') && sdk.calls.includes('new OAuth:apple.com') && sdk.calls.includes('popup:apple.com'));
});

test('Google 로그인은 매번 계정 선택 화면을 띄우도록 요청한다 (계정이 여러 개인 사람용)', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  await ad.signIn('google');
  assert.ok(sdk.calls.includes('params:{"prompt":"select_account"}'), sdk.calls.join(' | '));
  assert.ok(sdk.calls.indexOf('params:{"prompt":"select_account"}') < sdk.calls.indexOf('popup:google.com'), '창을 열기 전에 옵션을 넣어야 한다');
});

test('알 수 없는 로그인 방식은 거절한다', async () => {
  const ad = CloudFirebase.createFirebaseAdapter(CFG, stubSdk());
  await assert.rejects(() => ad.signIn('facebook'), /지원하지 않는/);
});

test('팝업을 쓸 수 없는 환경이면 리다이렉트로 다시 시도하고, 그 밖의 오류는 그대로 전달한다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  sdk.setPopupError('auth/operation-not-supported-in-this-environment');
  await ad.signIn('google');
  assert.ok(sdk.calls.includes('redirect:google.com'));
  sdk.setPopupError('auth/popup-blocked');
  await assert.rejects(() => ad.signIn('google'), (e) => e.code === 'auth/popup-blocked');
});

test('저장: 처음엔 rev 1로 만들고, 기대한 rev와 같을 때만 rev+1로 고친다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  sdk.loginNow();
  assert.strictEqual(await ad.read(), null);
  assert.deepStrictEqual(await ad.write({ save: 'S1', summary: { kills: 1 }, expectedRev: 0 }), { ok: true, rev: 1 });
  const r = await ad.read();
  assert.deepStrictEqual([r.save, r.rev, r.updatedAt], ['S1', 1, 12345]);
  assert.deepStrictEqual(await ad.write({ save: 'S2', summary: {}, expectedRev: 1 }), { ok: true, rev: 2 });
  assert.strictEqual(sdk.store['saves/abc'].rev, 2);
});

test('저장: 기대한 rev가 서버와 다르면 덮어쓰지 않고 충돌로 돌려준다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  sdk.loginNow();
  await ad.write({ save: 'S1', summary: {}, expectedRev: 0 });
  await ad.write({ save: 'S2', summary: {}, expectedRev: 1 });
  const res = await ad.write({ save: 'STALE', summary: {}, expectedRev: 1 });
  assert.strictEqual(res.conflict, true);
  assert.strictEqual(res.remote.save, 'S2');
  assert.strictEqual(sdk.store['saves/abc'].save, 'S2', '서버 저장은 그대로');
  const created = await ad.write({ save: 'X', summary: {}, expectedRev: 0 });   // 이미 있는데 처음이라고 주장해도 충돌
  assert.strictEqual(created.conflict, true);
});

test('로그인하지 않은 채 읽거나 쓰면 로그인이 필요하다는 오류를 낸다', async () => {
  const ad = CloudFirebase.createFirebaseAdapter(CFG, stubSdk());
  await assert.rejects(() => ad.read(), (e) => e.code === 'auth/requires-login');
  await assert.rejects(() => ad.write({ save: 'x', summary: {}, expectedRev: 0 }), (e) => e.code === 'auth/requires-login');
});

test('SDK가 시작되지 못하면 로그인 안 한 상태로 알린다 (게임은 계속)', async () => {
  const sdk = stubSdk(); sdk.app.initializeApp = () => { throw new Error('bad config'); };
  const ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  const seen = [];
  const origErr = console.error; console.error = () => {};
  ad.onAuth((u) => seen.push(u));
  await new Promise((r) => setTimeout(r, 10));
  console.error = origErr;
  assert.deepStrictEqual(seen, [null]);
});

test('실제 어댑터와 가짜 서버가 같은 규격을 지킨다 (Cloud 클라이언트를 어댑터에 그대로 연결)', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  const dev = { state: G.createState(1000), mem: {} };
  played(300, 20)(dev.state);
  const c = Cloud.createCloud(ad, {
    getLocal: () => ({ text: G.serialize(dev.state, 2000), summary: Sync.summaryOf(dev.state, 'novice') }),
    applySave: () => true, askConflict: async () => 'cloud',
    storage: { get: (k) => dev.mem[k] || null, set: (k, v) => { dev.mem[k] = v; }, remove() {} },
  });
  c.start();
  await new Promise((r) => setTimeout(r, 10));
  await ad.signIn('google');
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(sdk.store['saves/abc'].rev, 1);
  assert.strictEqual(sdk.store['saves/abc'].summary.kills, 300);
  assert.strictEqual(c.state().status, 'ok');
});

section('스킬·공격 모션');
// 스킬 시험용: 몬스터 체력을 크게 잡아서 스킬 피해를 그대로 볼 수 있게 한다 (스테이지 1이라 고블린이 거의 다치지 않는다)
const skillState = (route) => { const t = G.createState(0); walkPath(t, route); t.stage = 1; t.monsterHp = t.monsterMax = 1e15; t.hp = G.maxHp(t); return t; };
const castsOf = (t, seconds, id) => { let n = 0; for (let i = 0; i < seconds * 10; i++) { t.monsterHp = t.monsterMax = 1e15; for (const e of G.tick(t, 0.1)) if (e.type === 'skill' && (!id || e.id === id)) n += 1; } return n; };

test('60개 직업 모두 스킬이 있고, 이름이 겹치지 않으며, 효과 종류가 정의돼 있다', () => {
  const ids = [...Object.keys(G.CLASSES), ...G.ADV_IDS];
  assert.strictEqual(ids.length, 60);
  const names = ids.map((id) => { assert.ok(G.SKILL_NAMES[id], id); return G.SKILL_NAMES[id][0]; });
  assert.strictEqual(new Set(names).size, 60, '스킬 이름이 겹친다');
  for (const id of ids) assert.ok(G.SKILL_KINDS[G.SKILL_NAMES[id][1]], `${id}: 알 수 없는 효과 종류`);
  assert.ok(Object.keys(G.SKILL_NAMES).every((id) => ids.includes(id)), '직업이 아닌 이름의 스킬이 있다');
});

test('직업 단계가 높을수록 같은 종류(강타) 스킬의 위력이 커진다: 1차 3.0 < 3차 4.5 < 4차 5.4', () => {
  const power = (route, id) => G.skillsOf(skillState(route)).find((x) => x.id === id).power;
  const p1 = power(['warrior'], 'warrior');
  const p3 = power(['warrior', 'berserker', 'destroyer'], 'destroyer');
  const p4 = power(['mage', 'pyromancer', 'infernomage', 'flameemperor'], 'flameemperor');
  assert.ok(Math.abs(p1 - 3.0) < 1e-9 && Math.abs(p3 - 4.5) < 1e-9 && Math.abs(p4 - 5.4) < 1e-9, [p1, p3, p4].join(' / '));
});

test('전직할수록 스킬이 쌓인다 (견습 0개 → 1차 1개 → … → 4차 4개)', () => {
  const t = G.createState(0);
  assert.strictEqual(G.skillsOf(t).length, 0);
  const path = ['warrior', 'knight', 'paladin', 'seraph'];
  const counts = [];
  t.level = 99; for (const id of path) { G.promote(t, id); counts.push(G.skillsOf(t).length); }
  assert.deepStrictEqual(counts, [1, 2, 3, 4]);
  assert.deepStrictEqual(G.skillsOf(t).map((x) => x.id), path);
});

test('강타: 쿨타임이 되면 자동으로 공격력 × 위력만큼 피해를 주고 사건을 남긴다', () => {
  const t = skillState(['warrior']);
  t.skillCd.warrior = 0;
  const dmg = G.hitDmg(t);
  const ev = G.tick(t, 0.1).filter((e) => e.type === 'skill');
  assert.strictEqual(ev.length, 1);
  assert.deepStrictEqual([ev[0].id, ev[0].kind, ev[0].name], ['warrior', 'strike', '용맹의 일격']);
  assert.ok(Math.abs(ev[0].amount - dmg * 3) < 1e-6, `${ev[0].amount} vs ${dmg * 3}`);
});

test('쿨타임 동안에는 다시 쓰지 않고, 쿨타임(14초)마다 한 번씩 쓴다', () => {
  const t = skillState(['warrior']);
  t.skillCd.warrior = 0;
  const n = castsOf(t, 50);   // 0초, 14초, 28초, 42초 → 4번
  assert.strictEqual(n, 4);
});

test('처음 만난 스킬은 시간 차를 두고 시작해서 한꺼번에 터지지 않는다', () => {
  const t = skillState(['warrior', 'knight', 'paladin', 'seraph']);
  const first = G.tick(t, 0.1).filter((e) => e.type === 'skill');
  assert.strictEqual(first.length, 0, '시작하자마자 쓰지 않는다');
  const cds = G.skillsOf(t).map((sk) => t.skillCd[sk.id]);
  assert.ok(new Set(cds.map((c) => Math.round(c * 10))).size === 4, '쿨타임 시작이 서로 다르다: ' + cds);
});

test('연타: 위력 × 횟수만큼 한 번에 피해를 준다', () => {
  const t = skillState(['mage']);
  t.skillCd.mage = 0;
  const dmg = G.hitDmg(t);
  const e = G.tick(t, 0.1).find((x) => x.type === 'skill');
  assert.strictEqual(e.kind, 'multi');
  assert.ok(Math.abs(e.amount - dmg * 1.0 * 4) < 1e-6);
});

test('회복: 체력이 충분하면 쓰지 않고, 70% 아래일 때만 최대 체력의 (위력)만큼 회복한다', () => {
  const t = skillState(['warrior', 'knight', 'paladin']);
  t.skillCd.paladin = 0;
  t.hp = G.maxHp(t);
  assert.strictEqual(castsOf(t, 30, 'paladin'), 0, '체력이 가득이면 회복하지 않는다');
  t.hp = G.maxHp(t) * 0.3; t.skillCd.paladin = 0;
  const before = t.hp;
  const e = G.tick(t, 0.1).find((x) => x.id === 'paladin');
  assert.ok(e, '체력이 낮으면 쓴다');
  assert.ok(t.hp - before >= G.maxHp(t) * 0.3 - 1, `회복량 ${t.hp - before}`);   // 위력 0.2×1.5=0.3
});

test('가속: 공격 속도가 지속 시간 동안만 오른다', () => {
  const t = skillState(['archer']);
  const base = G.attacksPerSec(t);
  t.skillCd.archer = 0;
  G.tick(t, 0.1);
  assert.ok(Math.abs(G.attacksPerSec(t) / base - 1.35) < 1e-9);
  for (let i = 0; i < 70; i++) { t.monsterHp = t.monsterMax = 1e15; G.tick(t, 0.1); }   // 7초 지남
  assert.ok(!t.buffs.haste, '효과가 끝났다');
  assert.strictEqual(G.attacksPerSec(t), base);
});

test('강화·방어·약탈: 각각 공격력·받는 피해·골드에 영향을 준다', () => {
  const t = skillState(['mage']);
  const d0 = G.hitDmg(t);
  t.buffs.might = { t: 5, v: 0.3 };
  assert.ok(Math.abs(G.hitDmg(t) / d0 - 1.3) < 1e-9);
  // 방어: 1초 동안 받는 피해가 (몬스터 공격력 × 위력)만큼 줄어든다. 회복량은 두 경우가 같으므로 손실의 차이가 그 값이다.
  const loss = (guard) => {
    const u = skillState(['warrior']); u.stage = 6; u.monsterHp = u.monsterMax = 1e15;
    u.hp = G.maxHp(u) * 0.5;
    if (guard) u.buffs.guard = { t: 99, v: 0.5 };
    const h0 = u.hp; G.tick(u, 1); return h0 - u.hp;
  };
  const noGuard = loss(false), withGuard = loss(true);
  assert.ok(Math.abs((noGuard - withGuard) - 0.5 * G.monsterAtk(6)) < 1e-6, `${noGuard} → ${withGuard}`);
  // 약탈: 처치 골드가 (1 + 위력)배가 된다
  const kill = (greed) => { const u = skillState(['rogue']); u.monsterHp = 1; if (greed) u.buffs.greed = { t: 9, v: 0.5 }; G.clickAttack(u); return u.gold; };
  const g1 = kill(false), g2 = kill(true);
  assert.ok(g2 > g1 && Math.abs(g2 / g1 - 1.5) < 0.2, `${g1} → ${g2}`);
});

test('소환: 동료가 없어도 내 초당 피해의 일부만큼은 피해를 준다', () => {
  const t = skillState(['archer', 'ranger']);
  t.skillCd.ranger = 0;
  const e = G.tick(t, 0.1).find((x) => x.id === 'ranger');
  assert.strictEqual(e.kind, 'summon');
  assert.ok(e.amount > 0 && e.amount < G.totalDps(t) * 6 * 1.25, `${e.amount}`);
});

test('쓰러져 있는 동안에는 스킬을 쓰지 않고, 환생하면 쿨타임과 효과가 초기화된다', () => {
  const t = skillState(['warrior']);
  t.skillCd.warrior = 0; t.downT = 2;
  assert.strictEqual(G.tick(t, 0.1).filter((e) => e.type === 'skill').length, 0);
  t.downT = 0; t.buffs.might = { t: 5, v: 0.3 }; t.skillCd.warrior = 3; t.runBest = 12;
  G.prestige(t);
  assert.deepStrictEqual([t.buffs, t.skillCd], [{}, {}]);
});

test('저장·불러오기 뒤에는 쿨타임과 효과가 새로 시작한다', () => {
  const t = skillState(['warrior']);
  t.buffs.might = { t: 5, v: 0.3 }; t.skillCd.warrior = 7;
  const back = G.deserialize(G.serialize(t, 1));
  assert.deepStrictEqual([back.buffs, back.skillCd], [{}, {}]);
  assert.deepStrictEqual(G.skillsOf(back).map((x) => x.id), ['warrior'], '직업(스킬)은 그대로');
});

test('스킬 설명은 효과 종류마다 위력 수치가 들어간 문장이다', () => {
  const t = skillState(['mage', 'pyromancer', 'infernomage', 'flameemperor']);
  const d = G.skillsOf(t).map((sk) => G.describeSkill(sk));
  assert.ok(d.every((x) => x.length > 8));
  assert.ok(d[0].includes('4번') && d[0].includes('×1'), d[0]);      // 마법 화살(연타) ×1 4번
  assert.ok(d[1].includes('불태워') && d[1].includes('50%'), d[1]);   // 점화(지속 피해) 위력 0.4×1.25
  assert.ok(d[3].includes('5.4'), d[3]);                            // 화염 제국(강타) ×5.4
});

test('처형: 몬스터 체력이 충분하면 쓰지 않고, 40% 아래가 되면 공격력 × 위력으로 마무리한다', () => {
  const t = skillState(['archer', 'sniper']);
  t.skillCd.sniper = 0;
  assert.strictEqual(castsOf(t, 30, 'sniper'), 0, '체력이 가득이면 쓰지 않는다');
  t.monsterMax = 1e15; t.monsterHp = 1e15 * 0.3; t.skillCd.sniper = 0;
  const e = G.tick(t, 0.1).find((x) => x.id === 'sniper');
  assert.ok(e && e.kind === 'execute');
  assert.ok(Math.abs(e.amount - G.hitDmg(t) * 7 * 1.25) < 1e-6);
});

test('보스 사냥: 보스가 아니면 쓰지 않고, 보스가 나오면 큰 피해를 준다', () => {
  const t = skillState(['rogue', 'assassin']);
  t.skillCd.assassin = 0; t.isBoss = false;
  assert.strictEqual(castsOf(t, 30, 'assassin'), 0);
  t.isBoss = true; t.skillCd.assassin = 0;
  const e = G.tick(t, 0.1).find((x) => x.id === 'assassin');
  assert.ok(e && e.kind === 'bossbane' && Math.abs(e.amount - G.hitDmg(t) * 9 * 1.25) < 1e-6);
});

test('지속 피해: 몬스터 체력이 절반 넘을 때 걸고, 시간 동안 매초 피해를 주며, 겹쳐 걸지 않고, 몬스터가 죽으면 사라진다', () => {
  const t = skillState(['rogue']);
  t.skillCd.rogue = 0;
  G.tick(t, 0.1);
  assert.ok(t.dot && t.dot.variant === 'poison' && t.dot.t > 7.5, JSON.stringify(t.dot));
  const dps = t.dot.dps;
  const before = t.monsterHp;
  for (let i = 0; i < 10; i++) { t.skillCd.rogue = 0; G.tick(t, 0.1); }   // 1초 진행. 이미 걸려 있으니 다시 걸지 않는다
  assert.ok(t.dot.dps === dps, '다시 걸리지 않았다');
  assert.ok(before - t.monsterHp >= dps * 0.9, `지속 피해 ${before - t.monsterHp} vs 초당 ${dps}`);
  for (let i = 0; i < 100; i++) { t.monsterHp = t.monsterMax = 1e15; G.tick(t, 0.1); }   // 시간이 다하면 끝난다
  assert.ok(!t.dot || t.dot.t > 0);
  t.dot = { t: 5, dps: 1, variant: 'poison' }; t.monsterHp = 1; G.clickAttack(t);            // 몬스터가 죽으면 사라진다
  assert.strictEqual(t.dot, null);
});

test('기절: 걸린 동안 몬스터가 공격하지 못하고, 체력이 충분하면 쓰지 않는다', () => {
  const loss = (stunned) => { const u = skillState(['warrior']); u.stage = 6; u.monsterHp = u.monsterMax = 1e15; u.hp = G.maxHp(u) * 0.5; if (stunned) u.buffs.stun = { t: 5, v: 1 }; const h0 = u.hp; G.tick(u, 1); return h0 - u.hp; };
  assert.ok(loss(false) > loss(true), '기절하면 덜 다친다');
  assert.ok(loss(true) < 0, '기절한 동안은 회복만 남아 체력이 오른다');
  const t = skillState(['rogue', 'assassin', 'shade']);
  t.skillCd.shade = 0; t.hp = G.maxHp(t);
  assert.strictEqual(castsOf(t, 30, 'shade'), 0, '체력이 가득이면 쓰지 않는다');
});

test('흡혈: 걸린 동안 준 피해의 일부만큼 체력을 회복한다', () => {
  const t = skillState(['warrior', 'berserker']);
  t.hp = G.maxHp(t) * 0.5; t.buffs.lifesteal = { t: 8, v: 0.3 };
  const h0 = t.hp;
  const dmg = G.clickAttack(t).dmg;
  assert.ok(Math.abs((t.hp - h0) - dmg * 0.3) < 1e-6, `회복 ${t.hp - h0} vs 기대 ${dmg * 0.3}`);
  t.hp = G.maxHp(t); const full = t.hp; G.clickAttack(t);
  assert.strictEqual(t.hp, full, '최대 체력을 넘어 회복하지 않는다');
});

test('방벽: 몬스터의 피해를 먼저 대신 맞고, 다 닳으면 사라진다. 체력이 충분하면 펼치지 않는다', () => {
  const t = skillState(['warrior', 'knight']);
  t.skillCd.knight = 0; t.hp = G.maxHp(t);
  assert.strictEqual(castsOf(t, 30, 'knight'), 0, '체력이 충분하면 펼치지 않는다');
  t.hp = G.maxHp(t) * 0.5; t.skillCd.knight = 0;
  G.tick(t, 0.1);
  assert.ok(t.buffs.barrier && Math.abs(t.buffs.barrier.v - G.maxHp(t) * 0.35 * 1.25) < G.monsterAtk(1), '방벽 크기');
  const loss = (barrier) => { const u = skillState(['warrior']); u.stage = 6; u.monsterHp = u.monsterMax = 1e15; u.hp = G.maxHp(u) * 0.5; if (barrier) u.buffs.barrier = { t: 8, v: 1e9 }; const h0 = u.hp; G.tick(u, 1); return h0 - u.hp; };
  assert.ok(loss(true) < loss(false), '방벽이 있으면 덜 다친다');
  const u = skillState(['warrior']); u.stage = 6; u.monsterHp = u.monsterMax = 1e15; u.buffs.barrier = { t: 8, v: 1 };
  G.tick(u, 1);
  assert.ok(!u.buffs.barrier, '다 닳으면 사라진다');
});

test('전리품: 처치 골드의 위력배를 즉시 얻는다', () => {
  const t = skillState(['rogue', 'pirate', 'buccaneer']);
  G.checkAchievements(t);   // 전직 업적이 틱 도중에 달성돼 골드 배율이 바뀌지 않게, 먼저 반영해 둔다
  t.skillCd.buccaneer = 0;
  const g0 = t.gold, expected = Math.ceil(G.monsterGold(1) * G.goldMult(t) * 6 * 1.5);
  const e = G.tick(t, 0.1).find((x) => x.id === 'buccaneer');
  assert.ok(e && e.kind === 'bounty');
  assert.strictEqual(t.gold - g0, expected);
});

test('광란: 공격 속도와 공격력이 함께 오른다', () => {
  const t = skillState(['warrior', 'berserker', 'warlord']);
  G.checkAchievements(t);   // 업적 배율을 먼저 반영해 두고 기준값을 잡는다
  const a0 = G.attacksPerSec(t), d0 = G.hitDmg(t);
  t.skillCd.warlord = 0;
  G.tick(t, 0.1);
  assert.ok(Math.abs(G.attacksPerSec(t) / a0 - 1.375) < 1e-9 && Math.abs(G.hitDmg(t) / d0 - 1.375) < 1e-9);
});

test('스킬 효과 종류는 16가지이고 모두 어느 직업이 쓴다. 상황 조건이 필요한 종류는 조건이 있다', () => {
  assert.strictEqual(Object.keys(G.SKILL_KINDS).length, 16);
  const used = new Set(Object.values(G.SKILL_NAMES).map((x) => x[1]));
  for (const k of Object.keys(G.SKILL_KINDS)) assert.ok(used.has(k), `${k}를 쓰는 직업이 없다`);
  const t = skillState(['warrior']);
  t.hp = G.maxHp(t);   // 체력 가득, 보스 아님, 몬스터 체력 가득
  t.isBoss = false;
  const can = (kind) => G.canCast(t, { kind });
  assert.deepStrictEqual(['heal', 'guard', 'stun', 'barrier', 'lifesteal', 'execute', 'bossbane'].filter(can), [], '상황이 안 맞으면 쓰지 않는다');
  assert.deepStrictEqual(['strike', 'dot', 'greed', 'bounty'].filter((k) => !can(k)), [], '언제나 쓸 수 있는 종류');
});

test('그림 생성 스크립트의 스킬·이펙트 목록이 게임 데이터와 같다 (이름이 어긋나면 그림이 안 쓰인다)', () => {
  const fs = require('fs'), path = require('path');
  const py = fs.readFileSync(path.join(__dirname, 'generate-images.py'), 'utf8');
  const keysOf = (name) => { const body = py.slice(py.indexOf(name + ' = {'), py.indexOf('\n}\n', py.indexOf(name + ' = {'))); return [...body.matchAll(/^\s+'([a-z_]+)':/gm)].map((m) => m[1]); };
  const skills = keysOf('SKILLS'), vfx = keysOf('VFX');
  assert.deepStrictEqual(skills.slice().sort(), Object.keys(G.SKILL_NAMES).sort(), '스킬 아이콘 프롬프트가 60개 직업과 다르다');
  assert.deepStrictEqual(vfx.slice().sort(), require('../skills.js').VFX_NAMES.slice().sort(), '이펙트 이름이 skills.js와 다르다');
});

test('직업별 공격 모션: 도적은 표창, 마법사는 마법구, 기사는 칼, 궁수는 화살, 저격수는 총', () => {
  const style = (route) => G.attackStyle(skillState(route));
  assert.strictEqual(G.attackStyle(G.createState(0)), 'slash', '견습은 몽둥이');
  assert.strictEqual(style(['rogue']), 'shuriken');
  assert.strictEqual(style(['mage']), 'orb');
  assert.strictEqual(style(['warrior', 'knight']), 'slash');
  assert.strictEqual(style(['archer']), 'arrow');
  assert.strictEqual(style(['archer', 'sniper']), 'bullet');
  assert.strictEqual(style(['mage', 'pyromancer']), 'fire');
  assert.strictEqual(style(['mage', 'necromancer']), 'dark');
});

test('60개 직업 모두 공격 모션이 정해져 있고, 3·4차는 정해 두지 않으면 윗단계를 따른다', () => {
  const known = new Set(['slash', 'axe', 'hammer', 'holy', 'dagger', 'arrow', 'bolt', 'bullet', 'orb', 'fire', 'dark', 'shuriken', 'coin']);
  for (const id of [...Object.keys(G.CLASSES), ...G.ADV_IDS]) assert.ok(known.has(G.styleOfClass(id)), `${id}: ${G.styleOfClass(id)}`);
  assert.strictEqual(G.styleOfClass('warlord'), 'axe', '전쟁군주는 광전사(도끼)를 따른다');
  assert.strictEqual(G.styleOfClass('windwalker'), 'arrow');
  assert.strictEqual(G.styleOfClass('paladin'), 'holy', '정해 둔 것은 그대로');
  assert.ok(Object.keys(G.ATTACK_STYLE).every((id) => id === 'novice' || G.NODES[id]), '없는 직업의 모션이 있다');
});

section('스테이지·몬스터 배치');
test('모든 지역에서 일반 몬스터 5종과 보스 2종이 빠짐없이 나온다 (예전에는 5번째 몬스터가 한 번도 안 나왔다)', () => {
  for (let b = 0; b < 6; b++) {
    const normals = new Set(), bosses = new Set();
    for (let p = 1; p <= 10; p++) { const m = G.monsterInfo(b * 10 + p); (m.boss ? bosses : normals).add(m.name); }
    assert.strictEqual(normals.size, 5, `지역 ${b}: 일반 몬스터 ${[...normals].join(', ')}`);
    assert.strictEqual(bosses.size, 2, `지역 ${b}: 보스 ${[...bosses].join(', ')}`);
  }
});

test('보스는 5의 배수 스테이지에만 나오고, 같은 몬스터가 두 스테이지 연속으로 나오지 않는다', () => {
  let prev = null;
  for (let st = 1; st <= 130; st++) {
    const m = G.monsterInfo(st);
    assert.strictEqual(m.boss, st % 5 === 0, `스테이지 ${st}`);
    if (prev) assert.notStrictEqual(m.name + m.round, prev, `스테이지 ${st}에서 ${m.name} 반복`);
    prev = m.name + m.round;
  }
});

test('지역 안 위치는 1~10이고, 스테이지 61부터 회차가 올라가며 같은 지역이 다시 나온다', () => {
  assert.deepStrictEqual([1, 5, 10, 11].map((st) => G.monsterInfo(st).pos), [1, 5, 10, 1]);
  assert.strictEqual(G.roundOf(60), 0);
  assert.strictEqual(G.roundOf(61), 1);
  const m61 = G.monsterInfo(61);
  assert.deepStrictEqual([m61.biome, m61.pos, m61.round], [0, 1, 1]);
  assert.strictEqual(G.monsterInfo(121).round, 2);
  assert.strictEqual(G.monsterInfo(61).name, G.monsterInfo(1).name, '같은 몬스터가 색만 바뀌어 다시 나온다');
});

test('일반 몬스터 자리표가 지역 표의 5종을 모두 가리키고 보스 자리는 5의 배수와 일치한다', () => {
  const used = new Set(G.NORMAL_SLOTS.filter((x) => x !== null));
  assert.deepStrictEqual([...used].sort(), [0, 1, 2, 3, 4]);
  G.NORMAL_SLOTS.forEach((slot, i) => assert.strictEqual(slot === null, (i + 1) % 5 === 0, `위치 ${i + 1}`));
});

section('그 밖의 로직');
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

queue.then(() => console.log(`\n${passed}개 통과` + (process.exitCode ? ', 실패 있음' : '')));
